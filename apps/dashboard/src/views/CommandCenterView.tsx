import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlertCircle, Clock, MapPin, Target, Activity } from 'lucide-react';
import { IncidentCard } from '../components/IncidentCard';
import { TacticalMap } from '../components/TacticalMap';
import type { MeshTelemetryRecord } from '../App';

interface CommandCenterViewProps {
  incidents: MeshTelemetryRecord[];
  totalIncidents: number;
  activeSosCount: number;
  supplyReqCount: number;
  selectedFilter: 'ALL' | number;
  setSelectedFilter: (filter: 'ALL' | number) => void;
  selectedIncidentId: string | null;
  setSelectedIncidentId: (id: string | null) => void;
  onFocusMap: (incident: MeshTelemetryRecord) => void;
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  incidents,
  totalIncidents,
  activeSosCount,
  supplyReqCount,
  selectedFilter,
  setSelectedFilter,
  selectedIncidentId,
  setSelectedIncidentId,
  onFocusMap
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 space-y-4">
      {/* Row 1: Active Alert Banner */}
      <div className="w-full rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/20 via-[#0d1527] to-[#0d1527] p-4 flex items-center justify-between shadow-lg shadow-black/40">
        <div className="flex items-center gap-4">
          <div className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded text-xs font-bold tracking-widest">
            ACTIVE INCIDENT: P1 DISTRESS BEACON
          </div>
          <div className="text-slate-200 text-sm font-medium flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-400" />
            <span>Multiple casualty beacon detected in Sector 4 (Bengaluru South) via 3 hops</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-slate-400 text-xs font-mono flex items-center gap-1.5">
            <Clock size={14} />
            <span>Detected: 2m ago</span>
          </div>
          <button className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs rounded-lg shadow-sm border border-slate-700 transition-colors">
            Dispatch Units
          </button>
        </div>
      </div>

      {/* Row 2: Tactical Workspace (Two-Column Layout) */}
      <div className="flex-1 flex gap-4 min-h-[600px] min-h-0">
        
        {/* Left Column: GIS Radar & Asset Map (w-7/12) */}
        <div className="w-7/12 flex flex-col bg-[#0d1527]/80 backdrop-blur-md border border-slate-800/80 rounded-xl overflow-hidden shadow-lg shadow-black/40">
          {/* Header Tabs */}
          <div className="flex items-center border-b border-slate-800 bg-[#0a101f]/50 px-2 pt-2">
            <button className="px-4 py-2 text-xs font-semibold text-blue-400 border-b-2 border-blue-500">Details</button>
            <button className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-300">Assets</button>
            <button className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-300">History</button>
          </div>
          
          <div className="flex-1 relative">
            <TacticalMap
              incidents={incidents}
              selectedIncidentId={selectedIncidentId}
              onSelectIncident={(inc) => setSelectedIncidentId(inc.messageId)}
              viewTrigger="COMMAND_CENTER"
            />
            {/* Map overlay floating controls */}
            <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2 pointer-events-none">
              <div className="bg-[#0a101f]/90 backdrop-blur-sm border border-slate-800 rounded-lg p-2 px-3 flex items-center gap-2 shadow-lg">
                <MapPin size={14} className="text-blue-400" />
                <span className="text-xs font-mono text-slate-300"><strong className="text-slate-100">{totalIncidents}</strong> ACTIVE NODES</span>
              </div>
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]">
              <button className="bg-slate-900/90 hover:bg-slate-800 backdrop-blur-md border border-slate-700 rounded-full px-4 py-2 text-xs font-medium text-slate-200 shadow-xl transition-all flex items-center gap-2">
                <Target size={14} className="text-blue-400" />
                Re-center Radar
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Triage & Telemetry Matrix (w-5/12) */}
        <div className="w-5/12 flex flex-col gap-4">
          
          {/* Summary Metrics Block */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-center shadow-lg flex flex-col justify-center">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Verified</div>
              <div className="text-2xl font-bold font-mono text-slate-100">{totalIncidents}</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-center shadow-lg flex flex-col justify-center">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Distress P1</div>
              <div className="text-2xl font-bold font-mono text-rose-400">{activeSosCount}</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-center shadow-lg flex flex-col justify-center">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Logistics P2</div>
              <div className="text-2xl font-bold font-mono text-amber-400">{supplyReqCount}</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 text-center shadow-lg flex flex-col justify-center">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Relay Nodes</div>
              <div className="text-2xl font-bold font-mono text-blue-400">24</div>
            </div>
          </div>

          {/* Incident Queue Card */}
          <div className="flex-1 flex flex-col bg-[#0d1527]/80 backdrop-blur-md border border-slate-800/80 rounded-xl shadow-lg shadow-black/40 overflow-hidden">
            <div className="p-3 border-b border-slate-800/80 bg-[#0a101f]/50 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider pl-1">Telemetry Queue</div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setSelectedFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-colors ${selectedFilter === 'ALL' ? 'bg-slate-700 text-slate-100' : 'bg-slate-800/50 text-slate-500 hover:text-slate-300'}`}
                >
                  All
                </button>
                <button 
                  onClick={() => setSelectedFilter(1)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-colors ${selectedFilter === 1 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800/50 text-slate-500 hover:text-rose-400'}`}
                >
                  P1
                </button>
                <button 
                  onClick={() => setSelectedFilter(2)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase transition-colors ${selectedFilter === 2 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-800/50 text-slate-500 hover:text-amber-400'}`}
                >
                  P2
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              <AnimatePresence initial={false}>
                {incidents.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                    <Activity size={24} className="text-slate-600 opacity-50" />
                    <p className="text-xs font-medium">No verified telemetry frames in queue.</p>
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

        </div>
      </div>
    </div>
  );
};

// Target is missing from lucide-react import in this file so we need to add it, wait I will add it inside the component.
// But first I should make sure I import Target.
