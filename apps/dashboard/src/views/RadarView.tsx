import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { IncidentCard } from '../components/IncidentCard';
import { TacticalMap } from '../components/TacticalMap';
import type { MeshTelemetryRecord } from '../App';

interface RadarViewProps {
  incidents: MeshTelemetryRecord[];
  totalIncidents: number;
  activeSosCount: number;
  supplyReqCount: number;
  averageRelayHops: string;
  selectedFilter: 'ALL' | number;
  setSelectedFilter: (filter: 'ALL' | number) => void;
  selectedIncidentId: string | null;
  setSelectedIncidentId: (id: string | null) => void;
  onFocusMap: (incident: MeshTelemetryRecord) => void;
}

export const RadarView: React.FC<RadarViewProps> = ({
  incidents,
  totalIncidents,
  activeSosCount,
  supplyReqCount,
  averageRelayHops,
  selectedFilter,
  setSelectedFilter,
  selectedIncidentId,
  setSelectedIncidentId,
  onFocusMap
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top KPI Row */}
      <div className="grid grid-cols-4 gap-4 p-6 pb-0">
        <div className="bg-zinc-950 border-t-2 border-t-emerald-500 border-x border-b border-zinc-800 rounded-b-lg p-4 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Ingest Count</div>
          <div className="text-2xl font-bold font-mono text-zinc-100">{totalIncidents}</div>
        </div>
        <div className="bg-zinc-950 border-t-2 border-t-rose-500 border-x border-b border-zinc-800 rounded-b-lg p-4 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">P1 Emergencies</div>
          <div className="text-2xl font-bold font-mono text-zinc-100">{activeSosCount}</div>
        </div>
        <div className="bg-zinc-950 border-t-2 border-t-amber-500 border-x border-b border-zinc-800 rounded-b-lg p-4 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Supply Requests</div>
          <div className="text-2xl font-bold font-mono text-zinc-100">{supplyReqCount}</div>
        </div>
        <div className="bg-zinc-950 border-t-2 border-t-cyan-500 border-x border-b border-zinc-800 rounded-b-lg p-4 shadow-sm">
          <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Hop Average</div>
          <div className="text-2xl font-bold font-mono text-zinc-100">{averageRelayHops}</div>
        </div>
      </div>

      {/* Split View Container */}
      <div className="flex-1 flex gap-4 p-6 min-h-[600px] min-h-0">
        
        {/* Left Panel */}
        <div className="w-96 flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/40 flex gap-2 overflow-x-auto">
            <button 
              onClick={() => setSelectedFilter('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${selectedFilter === 'ALL' ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              All
            </button>
            <button 
              onClick={() => setSelectedFilter(1)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${selectedFilter === 1 ? 'bg-rose-500 text-zinc-50' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'}`}
            >
              Distress
            </button>
            <button 
              onClick={() => setSelectedFilter(2)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${selectedFilter === 2 ? 'bg-amber-500 text-zinc-900' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'}`}
            >
              Logistics
            </button>
            <button 
              onClick={() => setSelectedFilter(3)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${selectedFilter === 3 ? 'bg-emerald-500 text-zinc-900' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'}`}
            >
              General
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            <AnimatePresence initial={false}>
              {incidents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                  <AlertCircle size={24} className="text-zinc-600" />
                  <p className="text-sm">No matching incidents found.</p>
                </div>
              ) : (
                incidents.map((incident) => (
                  <IncidentCard
                    key={incident.messageId}
                    incident={incident}
                    isSelected={incident.messageId === selectedIncidentId}
                    onSelect={(inc) => setSelectedIncidentId(inc.messageId)}
                    onFocusMap={onFocusMap}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex-1 border border-zinc-800 rounded-xl overflow-hidden relative shadow-inner">
          <TacticalMap
            incidents={incidents}
            selectedIncidentId={selectedIncidentId}
            onSelectIncident={(inc) => setSelectedIncidentId(inc.messageId)}
            viewTrigger="SPLIT"
          />
        </div>
      </div>
    </div>
  );
};
