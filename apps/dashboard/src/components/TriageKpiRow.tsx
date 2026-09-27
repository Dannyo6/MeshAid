import React from 'react';
import {
  Flame,
  Truck,
  GitFork,
  CheckCircle2,
  Users,
  TrendingUp,
} from 'lucide-react';
import type { MeshTelemetryRecord } from '../App';
import { CountUp } from './reactbits/CountUp';
import { SpotlightCard } from './reactbits/SpotlightCard';

interface TriageKpiRowProps {
  incidents: MeshTelemetryRecord[];
  totalIngested: number;
  activeSosCount: number;
  supplyReqCount: number;
  averageHops: string;
}

export const TriageKpiRow: React.FC<TriageKpiRowProps> = ({
  incidents,
  totalIngested,
  activeSosCount,
  supplyReqCount,
  averageHops,
}) => {
  // Calculate total victims across all active incidents
  const totalVictimsAtRisk = React.useMemo(() => {
    return incidents.reduce((acc, curr) => {
      const payload = typeof curr.payload === 'object' && curr.payload !== null ? curr.payload : {};
      const count =
        (payload as any).headcount ??
        (payload as any).headCount ??
        (payload as any).injuredCount ??
        (payload as any).victimCount ??
        (payload as any).count ??
        0;
      const num = typeof count === 'number' ? count : parseInt(String(count), 10) || 0;
      return acc + num;
    }, 0);
  }, [incidents]);

  // Max hop recorded
  const maxHops = React.useMemo(() => {
    if (incidents.length === 0) return 0;
    return Math.max(...incidents.map((i) => i.hopCount || 0));
  }, [incidents]);

  const avgHopsNum = parseFloat(averageHops) || 0;
  const hopFillPercent = Math.min(100, Math.round((avgHopsNum / 7) * 100));

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* ── KPI 1: Total Verified Ingest ── */}
      <SpotlightCard
        spotlightColor="rgba(255, 255, 255, 0.05)"
        className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-5 flex flex-col justify-between"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Verified Ingest</span>
          <CheckCircle2 size={16} className="text-emerald-500" />
        </div>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-semibold text-zinc-50 tracking-tight tabular-nums">
            <CountUp to={totalIngested} />
          </span>
          <span className="text-xs text-zinc-500 font-medium">PKTS</span>
        </div>
        <div className="flex flex-col gap-1 text-[10px] font-medium">
          <div className="flex items-center gap-1.5 text-emerald-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            100% ED25519 VERIFIED
          </div>
          <span className="text-zinc-500">GATEWAY DEDUP ACTIVE</span>
        </div>
      </SpotlightCard>

      {/* ── KPI 2: Active P1 Distress Signals ── */}
      <SpotlightCard
        spotlightColor="rgba(244, 63, 94, 0.1)"
        className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-5 flex flex-col justify-between relative overflow-hidden"
      >
        {activeSosCount > 0 && (
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-2xl rounded-full -mr-16 -mt-16 pointer-events-none"></div>
        )}
        <div className="flex items-center justify-between mb-4 relative z-10">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Active P1 Distress</span>
          <Flame size={16} className={`text-rose-500 ${activeSosCount > 0 ? 'animate-pulse' : ''}`} />
        </div>
        <div className="flex items-baseline gap-2 mb-4 relative z-10">
          <span className="text-3xl font-semibold text-rose-500 tracking-tight tabular-nums">
            <CountUp to={activeSosCount} decimals={0} />
          </span>
        </div>
        <div className="flex flex-col gap-1 text-[10px] font-medium relative z-10">
          <div className="flex items-center gap-1.5 text-rose-400">
            <Users size={12} />
            <span>{totalVictimsAtRisk} PERSONS AT RISK</span>
          </div>
          <span className="text-zinc-500">IMMEDIATE TRIAGE</span>
        </div>
      </SpotlightCard>

      {/* ── KPI 3: Supply / Logistics Demands ── */}
      <SpotlightCard
        spotlightColor="rgba(251, 191, 36, 0.05)"
        className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-5 flex flex-col justify-between"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Supply / Logistics</span>
          <Truck size={16} className="text-amber-500" />
        </div>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-semibold text-amber-500 tracking-tight tabular-nums">
            <CountUp to={supplyReqCount} decimals={0} />
          </span>
          <span className="text-xs text-zinc-500 font-medium">REQS</span>
        </div>
        <div className="flex flex-col gap-1 text-[10px] font-medium">
          <div className="flex items-center gap-1.5 text-amber-500">
            <TrendingUp size={12} />
            <span>FIELD QUOTA DISPATCH</span>
          </div>
        </div>
      </SpotlightCard>

      {/* ── KPI 4: Average Mesh Hops & Efficiency ── */}
      <SpotlightCard
        spotlightColor="rgba(56, 189, 248, 0.05)"
        className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-5 flex flex-col justify-between"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Average Mesh Hops</span>
          <GitFork size={16} className="text-zinc-500" />
        </div>
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-semibold text-zinc-100 tracking-tight tabular-nums">
            <CountUp to={avgHopsNum} decimals={1} />
          </span>
          <span className="text-xs text-zinc-500 font-medium">/ 7.0 MAX</span>
        </div>
        <div className="flex flex-col gap-1.5 w-full">
          <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-400 rounded-full transition-all duration-1000"
              style={{ width: `${hopFillPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-medium">
            <span className="text-zinc-500">PEAK HOPS: {maxHops}</span>
            <span className="text-zinc-400">DTN STORE-CARRY OK</span>
          </div>
        </div>
      </SpotlightCard>
    </section>
  );
};

export default TriageKpiRow;
