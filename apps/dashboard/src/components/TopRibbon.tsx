import React from 'react';
import { Shield } from 'lucide-react';

interface TopRibbonProps {
  activeView: 'radar' | 'protocol' | 'runbook';
  onSimulate: () => void;
}

export const TopRibbon: React.FC<TopRibbonProps> = ({ activeView, onSimulate }) => {
  const getViewTitle = () => {
    switch (activeView) {
      case 'radar': return 'Visual Command Center';
      case 'protocol': return 'Protocol Specification';
      case 'runbook': return 'Field Setup & Runbook';
      default: return '';
    }
  };

  const getBreadcrumbGroup = () => {
    switch (activeView) {
      case 'radar': return 'Situational Awareness';
      case 'protocol':
      case 'runbook': return 'Operations & System';
      default: return 'System';
    }
  };

  return (
    <header className="h-14 border-b border-slate-800/80 bg-[#0a101f]/70 backdrop-blur-md px-6 flex items-center justify-between flex-shrink-0">
      {/* Left: Breadcrumb navigation */}
      <div className="text-xs text-slate-400 font-medium flex items-center gap-2 tracking-wide">
        <span>{getBreadcrumbGroup()}</span>
        <span className="text-slate-600">&gt;</span>
        <span className="text-slate-200">{getViewTitle()}</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 bg-[#0d1527] px-2.5 py-1 rounded-full border border-slate-800 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            BLE 5.0 Extended Mesh
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono text-slate-300 bg-emerald-950/30 px-2.5 py-1 rounded-full border border-emerald-900/50 shadow-inner" title="Ed25519 signature verified via curve25519">
            <Shield size={10} className="text-emerald-400" />
            <span className="text-emerald-400/90">Ed25519 Verified</span>
          </div>
        </div>
        
        <div className="h-4 w-px bg-slate-800/80"></div>
        
        <button 
          onClick={onSimulate}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg shadow-sm shadow-blue-900/20 transition-all border border-blue-500/50"
        >
          + Broadcast Simulation
        </button>
      </div>
    </header>
  );
};
