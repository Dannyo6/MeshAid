import React from 'react';
import type { GatewayConnectionState } from '../App';

interface TopBarProps {
  activeView: 'radar' | 'protocol' | 'runbook';
  connectionState: GatewayConnectionState;
  onSimulate: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ activeView, connectionState, onSimulate }) => {
  const getViewTitle = () => {
    switch (activeView) {
      case 'radar': return 'Tactical Radar';
      case 'protocol': return 'Protocol Spec';
      case 'runbook': return 'Field Runbook';
      default: return '';
    }
  };

  return (
    <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md px-6 flex items-center justify-between flex-shrink-0">
      {/* Left: Active View title with breadcrumb */}
      <div className="text-xs text-zinc-400 font-medium">
        Mesh Operations / <span className="text-zinc-200">{getViewTitle()}</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        <div className="text-xs font-mono text-zinc-400 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800">
          PING: {connectionState.status === 'connected' ? '32ms' : 'OFFLINE'}
        </div>
        
        <button 
          onClick={onSimulate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs rounded-md shadow-sm transition-all"
        >
          + Simulate Packet
        </button>
      </div>
    </header>
  );
};
