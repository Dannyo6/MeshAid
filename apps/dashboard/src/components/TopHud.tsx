import React, { useState, useEffect } from 'react';
import {
  Radio,
  Wifi,
  WifiOff,
  Activity,
  Search,
  X,
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
  totalCount,
  filteredCount,
  p0Count,
  p1Count,
  p2Count,
  p3Count,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
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
            <span className="hud-sub">TACTICAL COMMAND</span>
          </div>
        </div>

        {/* Live System Status Telemetry */}
        <div className="hud-telemetry-status font-mono tabular-nums">
          {/* RF Uplink Status */}
          <div className="status-pill rf-status" title="Mesh RF Uplink status">
            <Activity size={12} className="text-emerald-400" />
            <span className="status-label">RF UPLINK:</span>
            <span className="status-value text-emerald-400">BLE Offline Mesh</span>
          </div>

          {/* Cryptographic Engine */}
          <div className="status-pill crypto-status" title="Ed25519 Engine Active">
            <ShieldCheck size={12} className="text-purple-400" />
            <span className="status-label">CRYPTO:</span>
            <span className="status-value text-purple-400">ED25519 VERIFIED</span>
          </div>

          {/* Mission Clock */}
          <div className="status-pill clock-pill" title="Mission Time (Local)">
            <Clock size={12} className="text-slate-400" />
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
                <span className="ws-text">Gateway Online</span>
              </>
            ) : (
              <>
                <span className="radar-dot-alert" />
                <WifiOff size={12} />
                <span className="ws-text">
                  Reconnecting...
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
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${selectedFilter === 'ALL' ? 'bg-zinc-700 text-zinc-100 border-zinc-600' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700/80'}`}
            onClick={() => onSelectFilter('ALL')}
          >
            <span>ALL</span>
            <span className="bg-zinc-900 px-1.5 rounded-sm text-[10px]">{totalCount}</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${selectedFilter === 0 ? 'bg-purple-900/40 text-purple-400 border-purple-800/50' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700/80'}`}
            onClick={() => onSelectFilter(0)}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
            <span>P0: AUTH</span>
            <span className="bg-zinc-900 px-1.5 rounded-sm text-[10px]">{p0Count}</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${selectedFilter === 1 ? 'bg-rose-900/40 text-rose-400 border-rose-800/50' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700/80'}`}
            onClick={() => onSelectFilter(1)}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            <span>P1: SOS</span>
            <span className="bg-zinc-900 px-1.5 rounded-sm text-[10px]">{p1Count}</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${selectedFilter === 2 ? 'bg-amber-900/40 text-amber-400 border-amber-800/50' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700/80'}`}
            onClick={() => onSelectFilter(2)}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>P2: SUP</span>
            <span className="bg-zinc-900 px-1.5 rounded-sm text-[10px]">{p2Count}</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${selectedFilter === 3 ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800/50' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700/80'}`}
            onClick={() => onSelectFilter(3)}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>P3: INFO</span>
            <span className="bg-zinc-900 px-1.5 rounded-sm text-[10px]">{p3Count}</span>
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
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${viewMode === 'SPLIT' ? 'bg-zinc-700 text-zinc-100 border-zinc-600' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700/80'}`}
            onClick={() => onChangeViewMode('SPLIT')}
            title="Split view (Transmissions + Tactical Map)"
          >
            <LayoutGrid size={13} />
            <span>SPLIT</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${viewMode === 'FEED_ONLY' ? 'bg-zinc-700 text-zinc-100 border-zinc-600' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700/80'}`}
            onClick={() => onChangeViewMode('FEED_ONLY')}
            title="Feed only view"
          >
            <List size={13} />
            <span>FEED</span>
          </button>

          <button
            type="button"
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border transition-colors ${viewMode === 'MAP_ONLY' ? 'bg-zinc-700 text-zinc-100 border-zinc-600' : 'bg-zinc-800 text-zinc-300 border-zinc-700/50 hover:bg-zinc-700/80'}`}
            onClick={() => onChangeViewMode('MAP_ONLY')}
            title="Tactical Map only view"
          >
            <MapIcon size={13} />
            <span>MAP</span>
          </button>
        </div>

      </div>
    </header>
  );
};

export default TopHud;
