import React, { useState, useEffect } from 'react';
import {
  Radio,
  Wifi,
  WifiOff,
  Activity,
  Search,
  X,
  Zap,
  LayoutGrid,
  List,
  Map as MapIcon,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import type { GatewayConnectionState } from '../App';

interface TopHudProps {
  connectionState: GatewayConnectionState;
  selectedFilter: 'ALL' | number;
  onSelectFilter: (filter: 'ALL' | number) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: 'SPLIT' | 'FEED_ONLY' | 'MAP_ONLY';
  onChangeViewMode: (mode: 'SPLIT' | 'FEED_ONLY' | 'MAP_ONLY') => void;
  onOpenSimulator: () => void;
  totalCount: number;
  filteredCount: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  p3Count: number;
}

export const TopHud: React.FC<TopHudProps> = ({
  connectionState,
  selectedFilter,
  onSelectFilter,
  searchQuery,
  onSearchChange,
  viewMode,
  onChangeViewMode,
  onOpenSimulator,
  totalCount,
  filteredCount,
  p0Count,
  p1Count,
  p2Count,
  p3Count,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentUtc, setCurrentUtc] = useState<string>('');

  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
      setCurrentUtc(
        now.toISOString().replace('T', ' ').slice(11, 19) + ' ZULU'
      );
    };
    updateClocks();
    const timer = setInterval(updateClocks, 1000);
    return () => clearInterval(timer);
  }, []);

  const isConnected = connectionState.status === 'connected';

  return (
    <header className="top-hud-strip">
      {/* ── Line 1: Monospaced System Status & Operations Bar ── */}
      <div className="top-hud-status-bar">
        {/* Call-sign & Agency Designation */}
        <div className="hud-branding">
          <div className="hud-logo-icon">
            <Radio size={16} className="text-cyan-400 animate-pulse" />
          </div>
          <div className="hud-callsign font-mono">
            <span className="hud-title">MESHAID</span>
            <span className="hud-divider">//</span>
            <span className="hud-sub">TAC-C2 OPS</span>
            <span className="hud-divider">//</span>
            <span className="hud-sector">SECTOR-01</span>
          </div>
        </div>

        {/* Live System Status Telemetry */}
        <div className="hud-telemetry-status font-mono tabular-nums">
          {/* RF Uplink Status */}
          <div className="status-pill rf-status" title="Mesh RF Uplink status">
            <Activity size={12} className="text-emerald-400" />
            <span className="status-label">RF UPLINK:</span>
            <span className="status-value text-emerald-400">915MHz LoRa / BLE 5.4</span>
          </div>

          {/* Cryptographic Engine */}
          <div className="status-pill crypto-status" title="Ed25519 Engine Active">
            <ShieldCheck size={12} className="text-purple-400" />
            <span className="status-label">CRYPTO:</span>
            <span className="status-value text-purple-400">ED25519 VERIFIED</span>
          </div>

          {/* Dual Mission Clocks */}
          <div className="status-pill clock-pill" title="Mission Time (Local & UTC Zulu)">
            <Clock size={12} className="text-slate-400" />
            <span className="clock-utc text-cyan-300">{currentUtc}</span>
            <span className="clock-divider">|</span>
            <span className="clock-local text-slate-300">{currentTime} LOC</span>
          </div>

          {/* WebSocket Live Connection Badge */}
          <div
            className={`status-pill ws-badge ${
              isConnected ? 'ws-connected' : 'ws-reconnecting'
            }`}
            title={`WebSocket target: ${connectionState.wsUrl}`}
          >
            {isConnected ? (
              <>
                <span className="radar-dot" />
                <Wifi size={12} />
                <span className="ws-text">WS: ACTIVE (PORT 3000)</span>
              </>
            ) : (
              <>
                <span className="radar-dot-alert" />
                <WifiOff size={12} />
                <span className="ws-text">
                  RETRY #{connectionState.retryAttempt} (
                  {Math.round(connectionState.nextRetryMs / 1000)}s)
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Line 2: Tactical Control Dock (Filter Pills, Search, Views, Simulation) ── */}
      <div className="top-hud-controls-dock">
        {/* Priority Filter Segmented Dock */}
        <div className="filter-pill-group font-mono">
          <button
            type="button"
            className={`filter-pill ${selectedFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => onSelectFilter('ALL')}
          >
            <span>[ALL]</span>
            <span className="pill-count">{totalCount}</span>
          </button>

          <button
            type="button"
            className={`filter-pill pill-p0 ${selectedFilter === 0 ? 'active' : ''}`}
            onClick={() => onSelectFilter(0)}
          >
            <span className="dot dot-p0" />
            <span>[P0:AUTH]</span>
            <span className="pill-count">{p0Count}</span>
          </button>

          <button
            type="button"
            className={`filter-pill pill-p1 ${selectedFilter === 1 ? 'active' : ''}`}
            onClick={() => onSelectFilter(1)}
          >
            <span className="dot dot-p1" />
            <span>[P1:SOS]</span>
            <span className="pill-count">{p1Count}</span>
          </button>

          <button
            type="button"
            className={`filter-pill pill-p2 ${selectedFilter === 2 ? 'active' : ''}`}
            onClick={() => onSelectFilter(2)}
          >
            <span className="dot dot-p2" />
            <span>[P2:SUPL]</span>
            <span className="pill-count">{p2Count}</span>
          </button>

          <button
            type="button"
            className={`filter-pill pill-p3 ${selectedFilter === 3 ? 'active' : ''}`}
            onClick={() => onSelectFilter(3)}
          >
            <span className="dot dot-p3" />
            <span>[P3:INFO]</span>
            <span className="pill-count">{p3Count}</span>
          </button>
        </div>

        {/* Tactical Search Box */}
        <div className="tactical-search-wrapper">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="tactical-search-input font-mono"
            placeholder="SCAN TELEMETRY / VICTIM NOTES / MSG ID..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => onSearchChange('')}
              title="Clear query"
            >
              <X size={12} />
            </button>
          )}
          {searchQuery && (
            <span className="search-match-badge font-mono tabular-nums">
              {filteredCount} HITS
            </span>
          )}
        </div>

        {/* View Switcher Segmented Control */}
        <div className="view-switcher-group font-mono">
          <button
            type="button"
            className={`view-btn ${viewMode === 'SPLIT' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('SPLIT')}
            title="Split view (Transmissions + Tactical Map)"
          >
            <LayoutGrid size={13} />
            <span>[◫ SPLIT]</span>
          </button>

          <button
            type="button"
            className={`view-btn ${viewMode === 'FEED_ONLY' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('FEED_ONLY')}
            title="Feed only view"
          >
            <List size={13} />
            <span>[☰ FEED]</span>
          </button>

          <button
            type="button"
            className={`view-btn ${viewMode === 'MAP_ONLY' ? 'active' : ''}`}
            onClick={() => onChangeViewMode('MAP_ONLY')}
            title="Tactical Map only view"
          >
            <MapIcon size={13} />
            <span>[🗺️ MAP]</span>
          </button>
        </div>

        {/* Tactical Drill Injector Button */}
        <button
          type="button"
          className="tactical-action-btn simulator-trigger-btn font-mono"
          onClick={onOpenSimulator}
          title="Open Tactical Packet Drill Simulator"
        >
          <Zap size={14} className="text-amber-400" />
          <span>[⚡ SIMULATE PACKET]</span>
        </button>
      </div>
    </header>
  );
};

export default TopHud;
