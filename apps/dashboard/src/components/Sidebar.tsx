import React, { useState, useEffect } from 'react';
import { Target, Smartphone, Radio, AlertTriangle, Activity, FileText } from 'lucide-react';

import type { GatewayConnectionState } from '../App';

interface SidebarProps {
  activeView: 'radar' | 'protocol' | 'runbook';
  onViewChange: (view: 'radar' | 'protocol' | 'runbook') => void;
  connectionState: GatewayConnectionState;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, connectionState }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside className="w-64 bg-[#0a101f] border-r border-slate-800 flex flex-col justify-between h-screen flex-shrink-0 select-none">
      {/* Top Brand Section */}
      <div className="flex items-center gap-3 mb-4 px-5 pt-6 pb-2 border-b border-slate-800/50">
        <Radio className="text-blue-500" size={24} />
        <div>
          <div className="text-lg font-bold text-slate-100 tracking-tight leading-tight">MeshAid</div>
          <div className="text-[10px] tracking-wider text-blue-400 font-mono font-semibold uppercase mt-0.5">
            VISUAL COMMAND CENTER
          </div>
        </div>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto pb-4">
        <div className="text-[11px] font-semibold text-slate-500 tracking-wider px-5 mb-2 mt-4 uppercase">
          SITUATIONAL AWARENESS
        </div>
        <div className="space-y-1 px-3">
          <button
            onClick={() => onViewChange('radar')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'radar'
                ? 'bg-blue-500/10 text-blue-300 font-semibold border border-blue-500/20 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Target size={16} />
            <span>Visual Command Center</span>
          </button>
          <button
            disabled
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-slate-500 cursor-not-allowed border border-transparent"
          >
            <AlertTriangle size={16} />
            <span>Active Incidents &amp; Alerts</span>
          </button>
          <button
            disabled
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-slate-500 cursor-not-allowed border border-transparent"
          >
            <Activity size={16} />
            <span>Asset Telemetry</span>
          </button>
        </div>

        <div className="text-[11px] font-semibold text-slate-500 tracking-wider px-5 mb-2 mt-6 uppercase">
          OPERATIONS &amp; SYSTEM
        </div>
        <div className="space-y-1 px-3">
          <button
            onClick={() => onViewChange('protocol')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'protocol'
                ? 'bg-blue-500/10 text-blue-300 font-semibold border border-blue-500/20 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <FileText size={16} />
            <span>Protocol Specification</span>
          </button>

          <button
            onClick={() => onViewChange('runbook')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
              activeView === 'runbook'
                ? 'bg-blue-500/10 text-blue-300 font-semibold border border-blue-500/20 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Smartphone size={16} />
            <span>Field Setup &amp; Runbook</span>
          </button>
        </div>
      </nav>

      {/* Bottom Status Tray */}
      <div className="p-4 border-t border-slate-800 bg-[#0a101f]">
        <div className="bg-[#0d1527] border border-slate-800/80 rounded-lg p-3 shadow-inner">
          <div className="flex items-center gap-2 mb-2">
            <span className="relative flex h-2 w-2">
              {(connectionState.status === 'connected' || connectionState.status === 'reconnecting') && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${connectionState.status === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            <span className="text-slate-300 text-xs font-semibold uppercase tracking-wide">
              {connectionState.status === 'connected' ? 'Gateway Online' : 'Connecting...'}
            </span>
          </div>
          <div className="flex flex-col gap-1 text-[10px] text-slate-500 font-mono">
            <div className="flex justify-between">
              <span>LOCAL</span>
              <span className="text-slate-400">{time.toLocaleTimeString('en-US', { hour12: false })}</span>
            </div>
            <div className="flex justify-between">
              <span>UTC</span>
              <span className="text-slate-400">{time.toISOString().substring(11, 19)}</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
