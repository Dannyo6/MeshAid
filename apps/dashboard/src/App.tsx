import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import styles from './App.module.css';

/**
 * Decoded payload within an emergency telemetry record.
 */
export interface IncidentPayload {
  category?: string;
  type?: string;
  notes?: string;
  details?: string;
  situation?: string;
  alert?: string;
  text?: string;
  headcount?: number;
  headCount?: number;
  injuredCount?: number;
  victimCount?: number;
  count?: number;
  publicKey?: string;
  [key: string]: unknown;
}

/**
 * Core Mesh Telemetry Record ingested from wire packets by the gateway server.
 */
export interface MeshTelemetryRecord {
  messageId: string;
  priority: number; // 0 = P0 Authority, 1 = P1 SOS, 2 = P2 Supplies, 3 = P3 Info
  hopCount: number;
  timestamp: number; // Seconds or Milliseconds
  lat: number | null;
  lng: number | null;
  payload: IncidentPayload | string;
  receivedAt?: number;
}

/**
 * Gateway WebSocket live connection state.
 */
export type ConnectionStatus = 'connected' | 'reconnecting';

export interface GatewayConnectionState {
  status: ConnectionStatus;
  wsUrl: string;
  retryAttempt: number;
  nextRetryMs: number;
}

// Priority constants matching @meshaid/protocol
export const Priority = {
  EMERGENCY_AUTHORITY: 0,
  CIVILIAN_SOS: 1,
  RESOURCE_LOGISTICS: 2,
  GENERAL_INFO: 3,
} as const;

/**
 * Safe helper to normalize and parse decoded payload objects.
 */
function parsePayload(payload: IncidentPayload | string): IncidentPayload {
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as IncidentPayload;
      }
      return { details: payload };
    } catch {
      return { details: payload };
    }
  }
  return payload || {};
}

/**
 * Extract headcount / persons at risk from various payload variations.
 */
function extractHeadcount(payloadObj: IncidentPayload): number | null {
  const count =
    payloadObj.headcount ??
    payloadObj.headCount ??
    payloadObj.injuredCount ??
    payloadObj.victimCount ??
    payloadObj.count;

  if (typeof count === 'number' && !Number.isNaN(count) && count > 0) {
    return count;
  }
  if (typeof count === 'string') {
    const parsed = parseInt(count, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/**
 * Extract human-readable situational emergency details from payload.
 */
function extractDetails(payloadObj: IncidentPayload): string {
  if (payloadObj.details) return String(payloadObj.details);
  if (payloadObj.notes) return String(payloadObj.notes);
  if (payloadObj.alert) return String(payloadObj.alert);
  if (payloadObj.situation) return String(payloadObj.situation);
  if (payloadObj.text) return String(payloadObj.text);
  if (payloadObj.category) return String(payloadObj.category);

  const keys = Object.keys(payloadObj).filter((k) => k !== 'publicKey' && k !== 'type');
  if (keys.length > 0) {
    return keys.map((k) => `${k}: ${String(payloadObj[k])}`).join(' | ');
  }
  return 'Situational report broadcasted from offline field node.';
}

/**
 * Extract category or triage title.
 */
function extractCategory(payloadObj: IncidentPayload, priority: number): string {
  if (payloadObj.category) return String(payloadObj.category).replace(/_/g, ' ');
  if (payloadObj.type) return String(payloadObj.type).replace(/_/g, ' ');

  switch (priority) {
    case Priority.EMERGENCY_AUTHORITY:
      return 'AUTHORITY ALERT';
    case Priority.CIVILIAN_SOS:
      return 'CIVILIAN SOS';
    case Priority.RESOURCE_LOGISTICS:
      return 'LOGISTICS REQUEST';
    case Priority.GENERAL_INFO:
      return 'FIELD BULLETIN';
    default:
      return 'EMERGENCY DISPATCH';
  }
}

/**
 * Format timestamp to relative human time (e.g. '2s ago', '5m ago').
 */
function formatRelativeTime(timestampSecondsOrMs: number): string {
  const timestampMs =
    timestampSecondsOrMs < 10000000000 ? timestampSecondsOrMs * 1000 : timestampSecondsOrMs;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));

  if (elapsedSec < 5) return 'just now';
  if (elapsedSec < 60) return `${elapsedSec}s ago`;
  const minutes = Math.floor(elapsedSec / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format timestamp to UTC string.
 */
function formatUtcTime(timestampSecondsOrMs: number): string {
  const timestampMs =
    timestampSecondsOrMs < 10000000000 ? timestampSecondsOrMs * 1000 : timestampSecondsOrMs;
  return new Date(timestampMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/**
 * Format raw epoch value for telemetry badge.
 */
function formatEpoch(timestampSecondsOrMs: number): number {
  return timestampSecondsOrMs < 10000000000
    ? timestampSecondsOrMs
    : Math.floor(timestampSecondsOrMs / 1000);
}

export function App() {
  const [incidents, setIncidents] = useState<MeshTelemetryRecord[]>([]);
  const [connectionState, setConnectionState] = useState<GatewayConnectionState>({
    status: 'reconnecting',
    wsUrl: 'ws://localhost:3000',
    retryAttempt: 0,
    nextRetryMs: 1000,
  });

  const [selectedFilter, setSelectedFilter] = useState<'ALL' | number>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'PRIORITY_CHRONO' | 'PURE_CHRONO'>('PRIORITY_CHRONO');
  const [expandedPayloadIds, setExpandedPayloadIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const retryAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isComponentMounted = useRef(true);

  // ── 1. Initial State Hydration ─────────────────────────────────────────────
  const hydrateTelemetry = useCallback(async () => {
    // Try relative endpoint first, then direct localhost targets if dev proxy not active
    const candidateEndpoints = [
      '/api/mesh/telemetry',
      'http://localhost:3000/api/mesh/telemetry',
      'http://localhost:4000/api/mesh/telemetry',
    ];

    for (const endpoint of candidateEndpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          const json = await response.json();
          const records: MeshTelemetryRecord[] = Array.isArray(json)
            ? json
            : Array.isArray(json.incidents)
              ? json.incidents
              : [];

          if (isComponentMounted.current && records.length > 0) {
            setIncidents((prev) => {
              const existingMap = new Map(prev.map((item) => [item.messageId, item]));
              for (const record of records) {
                if (record && record.messageId && !existingMap.has(record.messageId)) {
                  existingMap.set(record.messageId, record);
                }
              }
              return Array.from(existingMap.values());
            });
          }
          break; // successfully fetched from this endpoint
        }
      } catch {
        // Continue to fallback candidates
      }
    }
  }, []);

  useEffect(() => {
    isComponentMounted.current = true;
    hydrateTelemetry();

    return () => {
      isComponentMounted.current = false;
    };
  }, [hydrateTelemetry]);

  // ── 2. WebSocket Streaming & Exponential Backoff Reconnection ──────────────
  const connectWebSocket = useCallback(() => {
    if (!isComponentMounted.current) return;

    // Clear any pending reconnect timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Determine target WebSocket URL:
    // User requirement: "ws://localhost:3000 (or dynamic window.location.host)"
    let targetWsUrl = 'ws://localhost:3000';
    if (typeof window !== 'undefined') {
      const isHttps = window.location.protocol === 'https:';
      const wsProto = isHttps ? 'wss:' : 'ws:';
      const host = window.location.host;

      // Check for explicit query param override (?ws=ws://...)
      const params = new URLSearchParams(window.location.search);
      const wsParam = params.get('ws');

      if (wsParam) {
        targetWsUrl = wsParam;
      } else if (window.location.port === '3000') {
        targetWsUrl = `${wsProto}//${host}`;
      } else if (retryAttemptRef.current >= 2 && retryAttemptRef.current % 2 === 0) {
        // Resilient fallback: If port 3000 failed several times, rotate candidate
        targetWsUrl = 'ws://localhost:4000';
      } else {
        targetWsUrl = 'ws://localhost:3000';
      }
    }

    setConnectionState((prev) => ({
      ...prev,
      status: 'reconnecting',
      wsUrl: targetWsUrl,
      retryAttempt: retryAttemptRef.current,
    }));

    try {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }

      const socket = new WebSocket(targetWsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isComponentMounted.current) return;
        retryAttemptRef.current = 0;
        setConnectionState({
          status: 'connected',
          wsUrl: targetWsUrl,
          retryAttempt: 0,
          nextRetryMs: 1000,
        });
      };

      socket.onmessage = (event: MessageEvent) => {
        if (!isComponentMounted.current) return;

        try {
          const parsed = JSON.parse(event.data);
          // Check for EVENT_NEW_INCIDENT event wrapper or direct payload
          if (
            parsed.event === 'EVENT_NEW_INCIDENT' ||
            parsed.type === 'EVENT_NEW_INCIDENT' ||
            parsed.messageId
          ) {
            const rawRecord = parsed.data || parsed.incident || parsed;
            if (rawRecord && rawRecord.messageId) {
              const newRecord: MeshTelemetryRecord = {
                messageId: String(rawRecord.messageId),
                priority: Number(rawRecord.priority ?? Priority.CIVILIAN_SOS),
                hopCount: Number(rawRecord.hopCount ?? 0),
                timestamp: Number(rawRecord.timestamp ?? Math.floor(Date.now() / 1000)),
                lat: rawRecord.lat ?? rawRecord.latitude ?? null,
                lng: rawRecord.lng ?? rawRecord.longitude ?? null,
                payload: rawRecord.payload ?? {},
                receivedAt: rawRecord.receivedAt ?? Date.now(),
              };

              // Prepend newly received record and deduplicate by messageId
              setIncidents((prev) => {
                if (prev.some((item) => item.messageId === newRecord.messageId)) {
                  return prev; // Deduplicate
                }
                return [newRecord, ...prev];
              });
            }
          }
        } catch (err) {
          console.error('Error parsing incoming WebSocket packet:', err);
        }
      };

      socket.onerror = () => {
        // WebSocket error event: close will trigger reconnect backoff
        try {
          socket.close();
        } catch {
          // ignore
        }
      };

      socket.onclose = () => {
        if (!isComponentMounted.current) return;

        // Exponential backoff reconnect: 1s -> 2s -> 4s -> 8s -> 16s -> 30s max
        const backoffMs = Math.min(1000 * Math.pow(2, retryAttemptRef.current), 30000);
        retryAttemptRef.current += 1;

        setConnectionState({
          status: 'reconnecting',
          wsUrl: targetWsUrl,
          retryAttempt: retryAttemptRef.current,
          nextRetryMs: backoffMs,
        });

        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, backoffMs);
      };
    } catch {
      const backoffMs = Math.min(1000 * Math.pow(2, retryAttemptRef.current), 30000);
      retryAttemptRef.current += 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, backoffMs);
    }
  }, []);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [connectWebSocket]);

  // ── 3. Global Incident Telemetry Counters ──────────────────────────────────
  const totalIncidents = incidents.length;
  const activeSosCount = useMemo(
    () => incidents.filter((i) => i.priority === Priority.CIVILIAN_SOS).length,
    [incidents],
  );
  const supplyReqCount = useMemo(
    () => incidents.filter((i) => i.priority === Priority.RESOURCE_LOGISTICS).length,
    [incidents],
  );
  const p0AuthorityCount = useMemo(
    () => incidents.filter((i) => i.priority === Priority.EMERGENCY_AUTHORITY).length,
    [incidents],
  );
  const p3InfoCount = useMemo(
    () => incidents.filter((i) => i.priority === Priority.GENERAL_INFO).length,
    [incidents],
  );

  const averageRelayHops = useMemo(() => {
    if (incidents.length === 0) return '0.0';
    const sum = incidents.reduce((acc, curr) => acc + (curr.hopCount || 0), 0);
    return (sum / incidents.length).toFixed(1);
  }, [incidents]);

  // ── 4. Sorted & Filtered Incident Stream ───────────────────────────────────
  const displayedIncidents = useMemo(() => {
    let list = incidents;

    // Priority tier filter
    if (selectedFilter !== 'ALL') {
      list = list.filter((i) => i.priority === selectedFilter);
    }

    // Text search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) => {
        const payloadObj = parsePayload(i.payload);
        const details = extractDetails(payloadObj).toLowerCase();
        const category = extractCategory(payloadObj, i.priority).toLowerCase();
        const idMatch = i.messageId.toLowerCase().includes(q);
        const latMatch = i.lat !== null && String(i.lat).includes(q);
        const lngMatch = i.lng !== null && String(i.lng).includes(q);

        return idMatch || details.includes(q) || category.includes(q) || latMatch || lngMatch;
      });
    }

    // Sorting: Chronologically and Prioritized
    if (sortMode === 'PRIORITY_CHRONO') {
      return [...list].sort((a, b) => {
        // Priority ascending (0: P0 highest -> 3: P3 lowest)
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // Matching priority: most recent timestamp first
        return b.timestamp - a.timestamp;
      });
    } else {
      // Pure Chronological: newest received first
      return [...list].sort((a, b) => b.timestamp - a.timestamp);
    }
  }, [incidents, selectedFilter, searchQuery, sortMode]);

  // Toggle raw payload inspector
  const togglePayloadExpand = (id: string) => {
    setExpandedPayloadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Copy Message ID helper
  const copyMessageId = (id: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // ── 5. Simulation Tool (for Testing & Demonstration) ───────────────────────
  const simulateInboundIncident = (tier?: number) => {
    const randomHex = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0'),
    ).join('');

    const targetPriority =
      tier !== undefined
        ? tier
        : [
            Priority.EMERGENCY_AUTHORITY,
            Priority.CIVILIAN_SOS,
            Priority.RESOURCE_LOGISTICS,
            Priority.GENERAL_INFO,
          ][Math.floor(Math.random() * 4)];

    const nowSec = Math.floor(Date.now() / 1000);

    let samplePayload: IncidentPayload;
    let lat: number | null = 12.9716;
    let lng: number | null = 77.5946;

    if (targetPriority === Priority.EMERGENCY_AUTHORITY) {
      samplePayload = {
        category: 'DAM_BREACH_EVACUATION',
        details: 'Immediate evacuation directive: Upstream reservoir overflow imminent in Sector 4.',
        headcount: 140,
        type: 'EMERGENCY',
      };
      lat = 12.9815;
      lng = 77.6042;
    } else if (targetPriority === Priority.CIVILIAN_SOS) {
      samplePayload = {
        category: 'COLLAPSED_STRUCTURE_SOS',
        details: 'Civilians trapped under collapsed roof rubble. Urgent extrication required.',
        headcount: 3,
        injuredCount: 2,
        type: 'SOS',
      };
      lat = 12.9654;
      lng = 77.5891;
    } else if (targetPriority === Priority.RESOURCE_LOGISTICS) {
      samplePayload = {
        category: 'MEDICAL_LOGISTICS_REQ',
        details: 'Urgent need for 10 units O-Negative blood and portable diesel generator fuel.',
        headcount: 1,
        type: 'RESOURCE_REQ',
      };
      lat = 12.9789;
      lng = 77.5912;
    } else {
      samplePayload = {
        category: 'ROAD_STATUS_UPDATE',
        details: 'Bridge over North River cleared for emergency 4x4 relief vehicles.',
        type: 'BULLETIN',
      };
      lat = 12.9542;
      lng = 77.6105;
    }

    const testIncident: MeshTelemetryRecord = {
      messageId: randomHex,
      priority: targetPriority,
      hopCount: Math.floor(Math.random() * 4) + 1,
      timestamp: nowSec,
      lat,
      lng,
      payload: samplePayload,
      receivedAt: Date.now(),
    };

    setIncidents((prev) => [testIncident, ...prev]);
  };

  return (
    <div className={styles.dashboard}>
      {/* ── Header Bar ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          {/* Brand Branding */}
          <div className={styles.brandingGroup}>
            <div className={styles.radarIconBox} title="MeshAid Opportunistic Relay Network">
              <div className={styles.radarSweep} />
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20M2 12h20" />
              </svg>
            </div>
            <div className={styles.titleArea}>
              <div className={styles.brandTitleRow}>
                <h1 className={styles.brandTitle}>
                  Mesh<span className={styles.brandTitleAccent}>Aid</span> Command Center
                </h1>
                <span className={styles.brandPill}>DTN GATEWAY</span>
              </div>
              <span className={styles.brandSubtitle}>
                Real-Time Opportunistic Mesh Telemetry & Incident Dispatch
              </span>
            </div>
          </div>

          {/* Connection Status & Actions */}
          <div className={styles.headerControls}>
            {/* Live Gateway Connection Badge */}
            <div
              className={`${styles.connectionBadge} ${
                connectionState.status === 'connected'
                  ? styles.connectionConnected
                  : styles.connectionReconnecting
              }`}
              title={`Gateway target: ${connectionState.wsUrl}`}
            >
              <span
                className={`${styles.statusDot} ${
                  connectionState.status === 'connected'
                    ? styles.dotConnected
                    : styles.dotReconnecting
                }`}
              />
              <span>
                {connectionState.status === 'connected'
                  ? 'Connected'
                  : `Reconnecting (retry #${connectionState.retryAttempt})`}
              </span>
              <span className={styles.wsEndpointLabel}>
                {connectionState.wsUrl.replace(/^wss?:\/\//, '')}
              </span>
            </div>

            {/* Manual Sync / Refresh */}
            <button
              type="button"
              className={styles.btnIcon}
              onClick={hydrateTelemetry}
              title="Poll telemetry REST endpoint"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              Sync
            </button>

            {/* Inbound Simulator */}
            <button
              type="button"
              className={`${styles.btnIcon} ${styles.btnSimulate}`}
              onClick={() => simulateInboundIncident()}
              title="Inject simulated signed wire packet into feed"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Simulate Packet
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Command Body ── */}
      <main className={styles.main}>
        {/* Global Incident Telemetry Counters */}
        <section className={styles.statsGrid}>
          {/* 1. Total Incidents */}
          <div className={`${styles.statCard} ${styles.statTotal}`}>
            <div className={styles.statCardTop}>
              <span className={styles.statLabel}>Total Incidents</span>
              <span className={styles.statIcon}>📡</span>
            </div>
            <div className={styles.statValue}>{totalIncidents}</div>
            <div className={styles.statSubtext}>Verified Mesh Telemetry Records</div>
          </div>

          {/* 2. Active SOS (P1) */}
          <div
            className={`${styles.statCard} ${styles.statSos} ${
              activeSosCount > 0 ? styles.statSosActive : ''
            }`}
          >
            <div className={styles.statCardTop}>
              <span className={styles.statLabel}>Active SOS (P1)</span>
              <span className={styles.statIcon}>🚨</span>
            </div>
            <div className={styles.statValue}>{activeSosCount}</div>
            <div className={styles.statSubtext}>Life-Threatening Distress Signals</div>
          </div>

          {/* 3. Supply Requests (P2) */}
          <div className={`${styles.statCard} ${styles.statSupplies}`}>
            <div className={styles.statCardTop}>
              <span className={styles.statLabel}>Supply Requests (P2)</span>
              <span className={styles.statIcon}>📦</span>
            </div>
            <div className={styles.statValue}>{supplyReqCount}</div>
            <div className={styles.statSubtext}>Critical Logistics & Medical Needs</div>
          </div>

          {/* 4. Average Relay Hops */}
          <div className={`${styles.statCard} ${styles.statHops}`}>
            <div className={styles.statCardTop}>
              <span className={styles.statLabel}>Average Relay Hops</span>
              <span className={styles.statIcon}>🔀</span>
            </div>
            <div className={styles.statValue}>{averageRelayHops}</div>
            <div className={styles.statSubtext}>Store-Carry-Forward Mesh Relays</div>
          </div>
        </section>

        {/* ── Feed Controls & Filter Bar ── */}
        <section className={styles.controlsSection}>
          {/* Priority Filter Pills */}
          <div className={styles.filterPillsGroup}>
            <button
              type="button"
              className={`${styles.filterPill} ${
                selectedFilter === 'ALL' ? styles.filterPillActive : ''
              }`}
              onClick={() => setSelectedFilter('ALL')}
            >
              All Transmissions
              <span className={styles.filterCount}>{totalIncidents}</span>
            </button>

            <button
              type="button"
              className={`${styles.filterPill} ${
                selectedFilter === Priority.EMERGENCY_AUTHORITY ? styles.filterPillActive : ''
              }`}
              onClick={() => setSelectedFilter(Priority.EMERGENCY_AUTHORITY)}
            >
              P0 Authority
              <span className={styles.filterCount}>{p0AuthorityCount}</span>
            </button>

            <button
              type="button"
              className={`${styles.filterPill} ${
                selectedFilter === Priority.CIVILIAN_SOS ? styles.filterPillActive : ''
              }`}
              onClick={() => setSelectedFilter(Priority.CIVILIAN_SOS)}
            >
              P1 Critical SOS
              <span className={styles.filterCount}>{activeSosCount}</span>
            </button>

            <button
              type="button"
              className={`${styles.filterPill} ${
                selectedFilter === Priority.RESOURCE_LOGISTICS ? styles.filterPillActive : ''
              }`}
              onClick={() => setSelectedFilter(Priority.RESOURCE_LOGISTICS)}
            >
              P2 Supplies
              <span className={styles.filterCount}>{supplyReqCount}</span>
            </button>

            <button
              type="button"
              className={`${styles.filterPill} ${
                selectedFilter === Priority.GENERAL_INFO ? styles.filterPillActive : ''
              }`}
              onClick={() => setSelectedFilter(Priority.GENERAL_INFO)}
            >
              P3 Info
              <span className={styles.filterCount}>{p3InfoCount}</span>
            </button>
          </div>

          {/* Search & Sort Controls */}
          <div className={styles.searchAndSort}>
            {/* Search Box */}
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Search ID, payload, GPS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortMode}
              onChange={(e) =>
                setSortMode(e.target.value as 'PRIORITY_CHRONO' | 'PURE_CHRONO')
              }
              className={styles.sortSelect}
              title="Ordering mode"
            >
              <option value="PRIORITY_CHRONO">Prioritized (P0 → P3)</option>
              <option value="PURE_CHRONO">Chronological (Newest First)</option>
            </select>
          </div>
        </section>

        {/* ── Live Incident Feed ── */}
        <section className={styles.feedSection}>
          <div className={styles.feedHeader}>
            <div className={styles.feedTitleGroup}>
              <h2 className={styles.feedTitle}>Live Incident Feed</h2>
              <div className={styles.liveBeacon}>
                <span className={styles.liveBeaconDot} />
                REAL-TIME STREAM
              </div>
            </div>
            <span className={styles.feedCountBadge}>
              Showing {displayedIncidents.length} of {totalIncidents} Transmissions
            </span>
          </div>

          {displayedIncidents.length === 0 ? (
            <div className={styles.emptyFeed}>
              <div className={styles.emptyRadarAnim} />
              <div className={styles.emptyTitle}>No Emergency Transmissions in Queue</div>
              <p className={styles.emptyDesc}>
                Listening on opportunistic BLE gateway synchronization channel. Transmissions
                relayed via store-carry-forward nodes will stream here automatically.
              </p>
              <button
                type="button"
                className={`${styles.btnIcon} ${styles.btnSimulate}`}
                onClick={() => simulateInboundIncident()}
              >
                Simulate Inbound Transmission
              </button>
            </div>
          ) : (
            <div className={styles.incidentList}>
              {displayedIncidents.map((incident) => {
                const payloadObj = parsePayload(incident.payload);
                const details = extractDetails(payloadObj);
                const category = extractCategory(payloadObj, incident.priority);
                const headcount = extractHeadcount(payloadObj);
                const isExpanded = expandedPayloadIds.has(incident.messageId);
                const isCopied = copiedId === incident.messageId;

                // Priority card border style
                const priorityClass =
                  incident.priority === Priority.EMERGENCY_AUTHORITY
                    ? styles.cardPriorityP0
                    : incident.priority === Priority.CIVILIAN_SOS
                      ? styles.cardPriorityP1
                      : incident.priority === Priority.RESOURCE_LOGISTICS
                        ? styles.cardPriorityP2
                        : styles.cardPriorityP3;

                return (
                  <article
                    key={incident.messageId}
                    className={`${styles.incidentCard} ${priorityClass}`}
                  >
                    {/* Top Row: Triage Tag + Security Badge + Timestamps */}
                    <div className={styles.cardHeaderRow}>
                      <div className={styles.cardHeaderBadges}>
                        {/* Triage Tag */}
                        {incident.priority === Priority.EMERGENCY_AUTHORITY && (
                          <span className={styles.triageP0}>
                            ⚠️ P0 AUTHORITY ALERT
                          </span>
                        )}
                        {incident.priority === Priority.CIVILIAN_SOS && (
                          <span className={styles.triageP1}>
                            🚨 P1 CRITICAL SOS
                          </span>
                        )}
                        {incident.priority === Priority.RESOURCE_LOGISTICS && (
                          <span className={styles.triageP2}>
                            📦 P2 SUPPLIES REQUEST
                          </span>
                        )}
                        {incident.priority === Priority.GENERAL_INFO && (
                          <span className={styles.triageP3}>
                            ℹ️ P3 GENERAL INFO
                          </span>
                        )}

                        {/* Cryptographic Security Badge */}
                        <span
                          className={styles.securityBadge}
                          title="Decoded from Ed25519 digitally signed wire frame. Cryptographic authenticity validated by gateway."
                        >
                          <span className={styles.securityBadgeIcon}>🛡️</span>
                          Ed25519 Cryptographically Verified
                        </span>
                      </div>

                      {/* Timestamp */}
                      <div className={styles.timestampGroup}>
                        <span className={styles.timeRelative}>
                          {formatRelativeTime(incident.timestamp)}
                        </span>
                        <span>•</span>
                        <span className={styles.timeUtc}>
                          {formatUtcTime(incident.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Card Body: Category, Headcount, Situational Details */}
                    <div className={styles.cardBody}>
                      <div className={styles.payloadHeaderRow}>
                        <span className={styles.categoryTag}>{category}</span>

                        {headcount !== null && (
                          <span className={styles.headcountBadge}>
                            <span>👥</span>
                            <span>Headcount:</span>
                            <span className={styles.headcountValue}>{headcount}</span>
                            <span>Victim{headcount > 1 ? 's' : ''} at Risk</span>
                          </span>
                        )}
                      </div>

                      <p className={styles.situationalNotes}>{details}</p>
                    </div>

                    {/* Packet Telemetry Data Grid */}
                    <div className={styles.telemetryGrid}>
                      {/* Message ID Slice */}
                      <div className={styles.telemetryItem}>
                        <span className={styles.telemetryKey}>Message ID</span>
                        <span className={styles.telemetryValue}>
                          #{incident.messageId.slice(0, 8)}...
                          <button
                            type="button"
                            className={styles.copyBtn}
                            onClick={() => copyMessageId(incident.messageId)}
                            title="Copy full message ID"
                          >
                            {isCopied ? '✓ Copied' : '📋'}
                          </button>
                        </span>
                      </div>

                      {/* Hop Count */}
                      <div className={styles.telemetryItem}>
                        <span className={styles.telemetryKey}>Relay Hops</span>
                        <span className={styles.telemetryValue}>
                          🔀 {incident.hopCount} {incident.hopCount === 1 ? 'Hop' : 'Hops'}
                        </span>
                      </div>

                      {/* Epoch Timestamp */}
                      <div className={styles.telemetryItem}>
                        <span className={styles.telemetryKey}>Epoch Timestamp</span>
                        <span className={styles.telemetryValue}>
                          ⏱️ {formatEpoch(incident.timestamp)}
                        </span>
                      </div>

                      {/* Lat / Lng Coordinates */}
                      <div className={styles.telemetryItem}>
                        <span className={styles.telemetryKey}>GPS Coordinates</span>
                        <span className={styles.telemetryValue}>
                          {incident.lat !== null && incident.lng !== null ? (
                            <a
                              href={`https://www.openstreetmap.org/?mlat=${incident.lat}&mlon=${incident.lng}#map=16/${incident.lat}/${incident.lng}`}
                              target="_blank"
                              rel="noreferrer"
                              className={styles.coordLink}
                              title="View GPS fix on OpenStreetMap"
                            >
                              📍 {Number(incident.lat).toFixed(4)}°, {Number(incident.lng).toFixed(4)}° ↗
                            </a>
                          ) : (
                            <span style={{ color: '#64748b' }}>📍 GPS Offline</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Raw Payload Inspector */}
                    <button
                      type="button"
                      className={styles.rawDetailsToggle}
                      onClick={() => togglePayloadExpand(incident.messageId)}
                    >
                      {isExpanded ? '▲ Hide Raw Wire Data' : '▼ Inspect Wire Payload JSON'}
                    </button>

                    {isExpanded && (
                      <pre className={styles.rawPayloadBox}>
                        {JSON.stringify(
                          {
                            messageId: incident.messageId,
                            priority: incident.priority,
                            hopCount: incident.hopCount,
                            timestamp: incident.timestamp,
                            lat: incident.lat,
                            lng: incident.lng,
                            receivedAt: incident.receivedAt,
                            payload: payloadObj,
                            signatureVerified: true,
                            cryptoAlgorithm: 'Ed25519-SHA512',
                          },
                          null,
                          2,
                        )}
                      </pre>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
