import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import { Sidebar } from './components/Sidebar';
import { TopRibbon } from './components/TopRibbon';
import { CommandCenterView } from './views/CommandCenterView';
import { ProtocolView } from './views/ProtocolView';
import { RunbookView } from './views/RunbookView';
import { PacketSimulatorModal } from './components/PacketSimulatorModal';


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


export function App() {
  const API_BASE = import.meta.env.VITE_GATEWAY_URL || '';
  const WS_BASE = import.meta.env.VITE_GATEWAY_URL 
    ? import.meta.env.VITE_GATEWAY_URL.replace(/^http/, 'ws')
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host || 'localhost:3000'}`;

  const [incidents, setIncidents] = useState<MeshTelemetryRecord[]>([]);
  const [connectionState, setConnectionState] = useState<GatewayConnectionState>({
    status: 'reconnecting',
    wsUrl: WS_BASE,
    retryAttempt: 0,
    nextRetryMs: 1000,
  });

  const [selectedFilter, setSelectedFilter] = useState<'ALL' | number>('ALL');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'radar' | 'protocol' | 'runbook'>('radar');

  const retryAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isComponentMounted = useRef(true);

  // ── 1. Telemetry Hydration ─────────────────────────────────────────────────
  const hydrateTelemetry = useCallback(async () => {
    const candidateEndpoints = [
      API_BASE ? `${API_BASE}/api/mesh/telemetry` : '/api/mesh/telemetry',
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

    let targetWsUrl = WS_BASE;
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const wsParam = params.get('ws');

      if (wsParam) {
        targetWsUrl = wsParam;
      } else if (!import.meta.env.VITE_GATEWAY_URL && window.location.port === '80' || window.location.port === '5173') {
        const isHttps = window.location.protocol === 'https:';
        const wsProto = isHttps ? 'wss:' : 'ws:';
        targetWsUrl = `${wsProto}//${window.location.host}/ws`;
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




  // ── 4. Filtering & Sorting ─────────────────────────────────────────────────
  const displayedIncidents = useMemo(() => {
    let list = incidents;

    if (selectedFilter !== 'ALL') {
      list = list.filter((i) => i.priority === selectedFilter);
    }

    return [...list].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return b.timestamp - a.timestamp;
    });
  }, [incidents, selectedFilter]);

  const handleFocusMap = (incident: MeshTelemetryRecord) => {
    setSelectedIncidentId(incident.messageId);
  };

  const handleInjectSimulatedIncident = (incident: MeshTelemetryRecord) => {
    setIncidents((prev) => {
      if (prev.some((i) => i.messageId === incident.messageId)) return prev;
      return [incident, ...prev];
    });
    setSelectedIncidentId(incident.messageId);
  };


  return (
    <div className="flex h-screen bg-[#080c16] text-slate-300 font-sans overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} connectionState={connectionState} />
      
      <main className="flex-1 bg-[#080c16] flex flex-col min-h-screen relative overflow-hidden">
        <TopRibbon 
          activeView={activeView} 
          onSimulate={() => setIsSimulatorOpen(true)}
        />
        
        <div className="flex-1 overflow-y-auto relative">
          {activeView === 'radar' && (
            <CommandCenterView
              incidents={displayedIncidents}
              totalIncidents={totalIncidents}
              activeSosCount={activeSosCount}
              supplyReqCount={supplyReqCount}
              selectedFilter={selectedFilter}
              setSelectedFilter={setSelectedFilter}
              selectedIncidentId={selectedIncidentId}
              setSelectedIncidentId={setSelectedIncidentId}
              onFocusMap={handleFocusMap}
            />
          )}

          {activeView === 'protocol' && <ProtocolView />}
          {activeView === 'runbook' && <RunbookView />}
        </div>
      </main>

      {/* ── Interactive Packet Simulator Slide-Over Drawer ── */}
      <PacketSimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        onInjectIncident={handleInjectSimulatedIncident}
      />
    </div>
  );
}

export default App;
