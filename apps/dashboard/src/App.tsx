import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  List,
  Map as MapIcon,
  BarChart3,
  Radio,
  AlertCircle,
  ArrowUpDown,
} from 'lucide-react';
import { TopHud } from './components/TopHud';
import { TriageKpiRow } from './components/TriageKpiRow';
import { IncidentCard } from './components/IncidentCard';
import { TacticalMap } from './components/TacticalMap';
import { PacketSimulatorModal } from './components/PacketSimulatorModal';
import { Squares } from './components/reactbits/Squares';
import { ProtocolDocs } from './components/ProtocolDocs';
import { FieldSetup } from './components/FieldSetup';
import { Footer } from './components/Footer';
import styles from './App.module.css';

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

export type ConnectionStatus = 'connected' | 'reconnecting';

export interface GatewayConnectionState {
  status: ConnectionStatus;
  wsUrl: string;
  retryAttempt: number;
  nextRetryMs: number;
}

export const Priority = {
  EMERGENCY_AUTHORITY: 0,
  CIVILIAN_SOS: 1,
  RESOURCE_LOGISTICS: 2,
  GENERAL_INFO: 3,
} as const;

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

function extractDetails(payloadObj: IncidentPayload): string {
  if (payloadObj.details) return String(payloadObj.details);
  if (payloadObj.notes) return String(payloadObj.notes);
  if (payloadObj.alert) return String(payloadObj.alert);
  if (payloadObj.situation) return String(payloadObj.situation);
  if (payloadObj.text) return String(payloadObj.text);
  if (payloadObj.category) return String(payloadObj.category);
  return 'Situational report broadcasted from offline field node.';
}

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
  const [viewMode, setViewMode] = useState<'SPLIT' | 'FEED_ONLY' | 'MAP_ONLY'>('SPLIT');
  const [mobileTab, setMobileTab] = useState<'FEED' | 'MAP' | 'METRICS'>('FEED');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'RADAR' | 'DOCS' | 'SETUP'>('RADAR');

  const retryAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isComponentMounted = useRef(true);

  // ── 1. Telemetry Hydration ─────────────────────────────────────────────────
  const hydrateTelemetry = useCallback(async () => {
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
          break;
        }
      } catch {
        // Fallback to next candidate
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

  // ── 2. WebSocket Streaming & Reconnection ──────────────────────────────────
  const connectWebSocket = useCallback(() => {
    if (!isComponentMounted.current) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    let targetWsUrl = 'ws://localhost:3000';
    if (typeof window !== 'undefined') {
      const isHttps = window.location.protocol === 'https:';
      const wsProto = isHttps ? 'wss:' : 'ws:';
      const host = window.location.host;
      const params = new URLSearchParams(window.location.search);
      const wsParam = params.get('ws');

      if (wsParam) {
        targetWsUrl = wsParam;
      } else if (window.location.port === '3000') {
        targetWsUrl = `${wsProto}//${host}`;
      } else if (window.location.port === '80' || window.location.port === '5173') {
        targetWsUrl = `${wsProto}//${host}/ws`;
      } else if (retryAttemptRef.current >= 2 && retryAttemptRef.current % 2 === 0) {
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

              setIncidents((prev) => {
                if (prev.some((item) => item.messageId === newRecord.messageId)) {
                  return prev;
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
        try {
          socket.close();
        } catch {
          // ignore
        }
      };

      socket.onclose = () => {
        if (!isComponentMounted.current) return;
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

  // ── 3. KPI Statistics ──────────────────────────────────────────────────────
  const totalIncidents = incidents.length;
  const activeSosCount = useMemo(
    () => incidents.filter((i) => i.priority === Priority.CIVILIAN_SOS).length,
    [incidents]
  );
  const supplyReqCount = useMemo(
    () => incidents.filter((i) => i.priority === Priority.RESOURCE_LOGISTICS).length,
    [incidents]
  );
  const p0AuthorityCount = useMemo(
    () => incidents.filter((i) => i.priority === Priority.EMERGENCY_AUTHORITY).length,
    [incidents]
  );
  const p3InfoCount = useMemo(
    () => incidents.filter((i) => i.priority === Priority.GENERAL_INFO).length,
    [incidents]
  );

  const averageRelayHops = useMemo(() => {
    if (incidents.length === 0) return '0.0';
    const sum = incidents.reduce((acc, curr) => acc + (curr.hopCount || 0), 0);
    return (sum / incidents.length).toFixed(1);
  }, [incidents]);

  // ── 4. Filtering & Sorting ─────────────────────────────────────────────────
  const displayedIncidents = useMemo(() => {
    let list = incidents;

    if (selectedFilter !== 'ALL') {
      list = list.filter((i) => i.priority === selectedFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((i) => {
        const payloadObj = parsePayload(i.payload);
        const details = extractDetails(payloadObj).toLowerCase();
        const cat = extractCategory(payloadObj, i.priority).toLowerCase();
        const idMatch = i.messageId.toLowerCase().includes(q);
        const latMatch = i.lat !== null && String(i.lat).includes(q);
        const lngMatch = i.lng !== null && String(i.lng).includes(q);

        return idMatch || details.includes(q) || cat.includes(q) || latMatch || lngMatch;
      });
    }

    if (sortMode === 'PRIORITY_CHRONO') {
      return [...list].sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return b.timestamp - a.timestamp;
      });
    } else {
      return [...list].sort((a, b) => b.timestamp - a.timestamp);
    }
  }, [incidents, selectedFilter, searchQuery, sortMode]);

  // Focus map on selected incident
  const handleFocusMap = (incident: MeshTelemetryRecord) => {
    setSelectedIncidentId(incident.messageId);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileTab('MAP');
    }
  };

  const handleInjectSimulatedIncident = (incident: MeshTelemetryRecord) => {
    setIncidents((prev) => {
      if (prev.some((i) => i.messageId === incident.messageId)) return prev;
      return [incident, ...prev];
    });
    setSelectedIncidentId(incident.messageId);
  };

  const layoutClass =
    viewMode === 'SPLIT'
      ? styles.splitLayout
      : viewMode === 'FEED_ONLY'
        ? styles.feedOnlyLayout
        : styles.mapOnlyLayout;

  return (
    <div className={styles.appContainer}>
      {/* ── Faint Tactical Animated Grid Background Canvas ── */}
      <Squares
        direction="diagonal"
        speed={0.2}
        squareSize={40}
        borderColor="#1a1e29"
        hoverFillColor="#1e2433"
      />

      {/* ── Top Header View Switcher ── */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#090c12]/80 backdrop-blur border-b border-slate-800 z-50 relative shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 bg-cyan-900/30 border border-cyan-500/30 rounded-sm">
            <Radio size={14} className="text-cyan-400" />
          </div>
          <span className="text-cyan-400 font-black tracking-widest text-sm uppercase drop-shadow-[0_0_8px_rgba(6,182,212,0.5)] hidden sm:inline">
            MESHAID
          </span>
        </div>
        <div className="flex bg-[#0f141e] border border-slate-800 rounded p-1 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveView('RADAR')}
            className={`whitespace-nowrap px-3 sm:px-4 py-1 text-[10px] sm:text-xs font-bold font-mono transition-colors rounded-sm ${activeView === 'RADAR' ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-800' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
          >
            [ 🗺️ C2 RADAR ]
          </button>
          <button
            onClick={() => setActiveView('DOCS')}
            className={`whitespace-nowrap px-3 sm:px-4 py-1 text-[10px] sm:text-xs font-bold font-mono transition-colors rounded-sm ${activeView === 'DOCS' ? 'bg-amber-900/50 text-amber-400 border border-amber-800' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
          >
            [ 📄 PROTOCOL SPEC ]
          </button>
          <button
            onClick={() => setActiveView('SETUP')}
            className={`whitespace-nowrap px-3 sm:px-4 py-1 text-[10px] sm:text-xs font-bold font-mono transition-colors rounded-sm ${activeView === 'SETUP' ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}
          >
            [ 📱 FIELD APK & SETUP ]
          </button>
        </div>
        <div className="w-7 hidden sm:block"></div>
      </header>

      {activeView === 'RADAR' && (
        <>
          {/* ── Top HUD Operations Strip ── */}
          <TopHud
            connectionState={connectionState}
            selectedFilter={selectedFilter}
            onSelectFilter={setSelectedFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onChangeViewMode={setViewMode}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            totalCount={totalIncidents}
            filteredCount={displayedIncidents.length}
            p0Count={p0AuthorityCount}
            p1Count={activeSosCount}
            p2Count={supplyReqCount}
            p3Count={p3InfoCount}
          />

      {/* ── Global Triage KPI Row ── */}
      <TriageKpiRow
        incidents={incidents}
        totalIngested={totalIncidents}
        activeSosCount={activeSosCount}
        supplyReqCount={supplyReqCount}
        averageHops={averageRelayHops}
      />

      {/* ── Main Viewport Grid (Split / Feed Only / Map Only) ── */}
      <main className={`${styles.mainViewport} ${layoutClass}`}>
        {/* Left Pane: Incident Telemetry Stream */}
        {viewMode !== 'MAP_ONLY' && (
          <section className={styles.feedPane}>
            <div className={styles.feedHeaderBar}>
              <div className={styles.feedHeaderLeft}>
                <Radio size={13} className="text-cyan-400" />
                <span className={`${styles.feedTitle} font-mono`}>
                  TACTICAL TRANSMISSION FEED
                </span>
                <span className={`${styles.feedCountBadge} font-mono tabular-nums`}>
                  {displayedIncidents.length} / {totalIncidents}
                </span>
              </div>

              <div className={styles.feedHeaderRight}>
                <button
                  type="button"
                  className={`${styles.sortModeBtn} font-mono`}
                  onClick={() =>
                    setSortMode((prev) =>
                      prev === 'PRIORITY_CHRONO' ? 'PURE_CHRONO' : 'PRIORITY_CHRONO'
                    )
                  }
                  title="Toggle Sorting Mode"
                >
                  <ArrowUpDown size={11} />
                  <span>
                    {sortMode === 'PRIORITY_CHRONO' ? 'SORT: PRIORITY + TIME' : 'SORT: CHRONO ONLY'}
                  </span>
                </button>
              </div>
            </div>

            <div className={styles.feedScrollArea}>
              <AnimatePresence initial={false}>
                {displayedIncidents.length === 0 ? (
                  <div className={styles.emptyFeedState}>
                    <AlertCircle size={32} className={styles.emptyIcon} />
                    <p className={`${styles.emptyText} font-mono`}>
                      NO MATCHING INCIDENTS TRANSMITTED IN CURRENT FILTER
                    </p>
                  </div>
                ) : (
                  displayedIncidents.map((incident) => (
                    <IncidentCard
                      key={incident.messageId}
                      incident={incident}
                      isSelected={incident.messageId === selectedIncidentId}
                      onSelect={(inc) => setSelectedIncidentId(inc.messageId)}
                      onFocusMap={handleFocusMap}
                    />
                  ))
                )}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* Right Pane: Sticky Tactical GIS Radar Map */}
        {viewMode !== 'FEED_ONLY' && (
          <section className={styles.mapPane}>
            <TacticalMap
              incidents={displayedIncidents}
              selectedIncidentId={selectedIncidentId}
              onSelectIncident={(inc) => setSelectedIncidentId(inc.messageId)}
              viewTrigger={viewMode}
            />
          </section>
        )}
      </main>
        </>
      )}

      {activeView === 'DOCS' && (
        <main className="flex-1 flex w-full relative z-10 overflow-hidden">
          <ProtocolDocs />
        </main>
      )}

      {activeView === 'SETUP' && (
        <main className="flex-1 flex w-full relative z-10 overflow-hidden">
          <FieldSetup />
        </main>
      )}

      {/* ── Interactive Packet Simulator Slide-Over Drawer ── */}
      <PacketSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onInjectIncident={handleInjectSimulatedIncident}
      />

      {/* ── Mobile & Rugged Field Tablet Bottom Navigation Dock (< 1024px) ── */}
      {activeView === 'RADAR' && (
        <nav className={styles.mobileNavDock}>
          <button
            type="button"
            className={`${styles.mobileDockBtn} ${mobileTab === 'FEED' ? styles.active : ''}`}
            onClick={() => {
              setMobileTab('FEED');
              setViewMode('FEED_ONLY');
            }}
          >
            <List size={16} />
            <span>TRANSMISSIONS</span>
          </button>

          <button
            type="button"
            className={`${styles.mobileDockBtn} ${mobileTab === 'MAP' ? styles.active : ''}`}
            onClick={() => {
              setMobileTab('MAP');
              setViewMode('MAP_ONLY');
            }}
          >
            <MapIcon size={16} />
            <span>GIS RADAR</span>
          </button>

          <button
            type="button"
            className={`${styles.mobileDockBtn} ${mobileTab === 'METRICS' ? styles.active : ''}`}
            onClick={() => {
              setMobileTab('METRICS');
              setViewMode('SPLIT');
            }}
          >
            <BarChart3 size={16} />
            <span>C2 SPLIT</span>
          </button>
        </nav>
      )}

      {/* ── Footer ── */}
      <Footer />
    </div>
  );
}

export default App;
