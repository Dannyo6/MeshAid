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
    <section className="triage-kpi-grid">
      {/* ── KPI 1: Total Verified Ingest ── */}
      <SpotlightCard
        spotlightColor="rgba(239, 68, 68, 0.15)"
        className="kpi-card kpi-ingest"
        contentStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}
      >
        <div className="kpi-header">
          <span className="kpi-title font-mono">TOTAL VERIFIED INGEST</span>
          <div className="kpi-icon-wrap text-emerald-400">
            <CheckCircle2 size={16} />
          </div>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-number font-mono tabular-nums">
            <CountUp to={totalIngested} />
          </span>
          <span className="kpi-unit font-mono">PKTS</span>
        </div>
        <div className="kpi-footer font-mono">
          <div className="kpi-meta text-emerald-400">
            <span className="dot dot-emerald" />
            <span>100% ED25519 VERIFIED</span>
          </div>
          <span className="kpi-secondary text-slate-400">GATEWAY DEDUP ACTIVE</span>
        </div>
      </SpotlightCard>

      {/* ── KPI 2: Active P1 Distress Signals ── */}
      <SpotlightCard
        spotlightColor="rgba(239, 68, 68, 0.25)"
        className={`kpi-card kpi-p1 ${activeSosCount > 0 ? 'kpi-crimson-alert' : ''}`}
        contentStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}
      >
        <div className="kpi-header">
          <span className="kpi-title font-mono">ACTIVE P1 DISTRESS SIGNALS</span>
          <div className="kpi-icon-wrap text-red-500">
            <Flame size={16} className={activeSosCount > 0 ? 'animate-bounce' : ''} />
          </div>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-number font-mono tabular-nums text-red-400">
            <CountUp to={activeSosCount} decimals={0} />
          </span>
          {activeSosCount > 0 && (
            <span className="active-pulse-beacon">
              <span className="beacon-ring" />
              <span className="beacon-core" />
              <span className="beacon-label font-mono">CRITICAL SOS</span>
            </span>
          )}
        </div>
        <div className="kpi-footer font-mono">
          <div className="kpi-meta text-red-300">
            <Users size={12} />
            <span>{totalVictimsAtRisk} PERSONS AT RISK</span>
          </div>
          <span className="kpi-secondary text-slate-400">IMMEDIATE TRIAGE</span>
        </div>
      </SpotlightCard>

      {/* ── KPI 3: Supply / Logistics Demands ── */}
      <SpotlightCard
        spotlightColor="rgba(239, 68, 68, 0.15)"
        className="kpi-card kpi-p2"
        contentStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}
      >
        <div className="kpi-header">
          <span className="kpi-title font-mono">SUPPLY / LOGISTICS DEMANDS</span>
          <div className="kpi-icon-wrap text-amber-400">
            <Truck size={16} />
          </div>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-number font-mono tabular-nums text-amber-400">
            <CountUp to={supplyReqCount} decimals={0} />
          </span>
          <span className="kpi-unit font-mono text-amber-300/70">REQS</span>
        </div>
        <div className="kpi-footer font-mono">
          <div className="kpi-meta text-amber-400">
            <TrendingUp size={12} />
            <span>FIELD QUOTA DISPATCH</span>
          </div>
        </div>
      </SpotlightCard>

      {/* ── KPI 4: Average Mesh Hops & Efficiency ── */}
      <SpotlightCard
        spotlightColor="rgba(239, 68, 68, 0.15)"
        className="kpi-card kpi-hops"
        contentStyle={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}
      >
        <div className="kpi-header">
          <span className="kpi-title font-mono">AVERAGE MESH HOPS</span>
          <div className="kpi-icon-wrap text-cyan-400">
            <GitFork size={16} />
          </div>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-number font-mono tabular-nums text-cyan-400">
            <CountUp to={avgHopsNum} decimals={1} />
          </span>
          <span className="kpi-unit font-mono text-slate-400">/ 07 MAX</span>
        </div>
        <div className="kpi-footer font-mono">
          {/* Mini Hop Distribution Progress Bar */}
          <div className="hop-progress-container">
            <div
              className="hop-progress-bar"
              style={{ width: `${hopFillPercent}%` }}
            />
          </div>
          <div className="hop-footer-meta">
            <span>PEAK HOPS: {maxHops}</span>
            <span className="text-cyan-300">DTN STORE-CARRY OK</span>
          </div>
        </div>
      </SpotlightCard>
    </section>
  );
};

export default TriageKpiRow;
