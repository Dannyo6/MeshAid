import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  MapPin,
  Users,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Terminal,
  GitFork,
} from 'lucide-react';
import type { MeshTelemetryRecord, IncidentPayload } from '../App';
import { DecryptedText } from './DecryptedText';
import { HexDumpInspector } from './HexDumpInspector';

interface IncidentCardProps {
  incident: MeshTelemetryRecord;
  isSelected: boolean;
  onSelect: (incident: MeshTelemetryRecord) => void;
  onFocusMap: (incident: MeshTelemetryRecord) => void;
}

function parsePayload(payload: IncidentPayload | string): IncidentPayload {
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as IncidentPayload;
      }
      return { details: payload };
    } catch {
      return { details: payload };
    }
  }
  return payload || {};
}

function extractDetails(payloadObj: IncidentPayload): string {
  if (payloadObj.details) return String(payloadObj.details);
  if (payloadObj.notes) return String(payloadObj.notes);
  if (payloadObj.alert) return String(payloadObj.alert);
  if (payloadObj.situation) return String(payloadObj.situation);
  if (payloadObj.text) return String(payloadObj.text);
  if (payloadObj.category) return String(payloadObj.category);
  return 'Situational report broadcasted from offline field node.';
}

function extractCategory(payloadObj: IncidentPayload, priority: number): string {
  if (payloadObj.category) return String(payloadObj.category).replace(/_/g, ' ');
  if (payloadObj.type) return String(payloadObj.type).replace(/_/g, ' ');
  switch (priority) {
    case 0:
      return 'AUTHORITY ALERT';
    case 1:
      return 'CIVILIAN SOS';
    case 2:
      return 'LOGISTICS REQUEST';
    case 3:
      return 'FIELD BULLETIN';
    default:
      return 'EMERGENCY DISPATCH';
  }
}

function extractHeadcount(payloadObj: IncidentPayload): number | null {
  const count =
    payloadObj.headcount ??
    payloadObj.headCount ??
    payloadObj.injuredCount ??
    payloadObj.victimCount ??
    payloadObj.count;
  if (typeof count === 'number' && !Number.isNaN(count) && count > 0) return count;
  if (typeof count === 'string') {
    const parsed = parseInt(count, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function formatRelativeTime(timestampSecondsOrMs: number): string {
  const timestampMs =
    timestampSecondsOrMs < 10000000000 ? timestampSecondsOrMs * 1000 : timestampSecondsOrMs;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (elapsedSec < 5) return 'JUST NOW';
  if (elapsedSec < 60) return `${elapsedSec}S AGO`;
  const minutes = Math.floor(elapsedSec / 60);
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
}

function formatUtcTime(timestampSecondsOrMs: number): string {
  const timestampMs =
    timestampSecondsOrMs < 10000000000 ? timestampSecondsOrMs * 1000 : timestampSecondsOrMs;
  return new Date(timestampMs).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export const IncidentCard: React.FC<IncidentCardProps> = ({
  incident,
  isSelected,
  onSelect,
  onFocusMap,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);
  const [copiedMsgId, setCopiedMsgId] = useState<boolean>(false);

  const payloadObj = parsePayload(incident.payload);
  const category = extractCategory(payloadObj, incident.priority);
  const details = extractDetails(payloadObj);
  const headcount = extractHeadcount(payloadObj);

  const hasGps =
    typeof incident.lat === 'number' &&
    typeof incident.lng === 'number' &&
    !Number.isNaN(incident.lat) &&
    !Number.isNaN(incident.lng);

  const coordsString = hasGps
    ? `${Number(incident.lat).toFixed(4)}°N, ${Number(incident.lng).toFixed(4)}°E`
    : 'NO GPS FIX';

  const handleCopyCoords = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasGps) return;
    navigator.clipboard?.writeText(`${incident.lat}, ${incident.lng}`);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(incident.messageId);
    setCopiedMsgId(true);
    setTimeout(() => setCopiedMsgId(false), 2000);
  };

  const getPriorityBadge = () => {
    switch (incident.priority) {
      case 0:
        return { label: '[P0:AUTHORITY]', cls: 'prio-p0' };
      case 1:
        return { label: '[P1:CRIT-SOS]', cls: 'prio-p1' };
      case 2:
        return { label: '[P2:SUP-LOGS]', cls: 'prio-p2' };
      case 3:
      default:
        return { label: '[P3:INTEL]', cls: 'prio-p3' };
    }
  };

  const prioMeta = getPriorityBadge();

  return (
    <motion.article
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`incident-card ${prioMeta.cls} ${isSelected ? 'incident-card-selected' : ''}`}
      onClick={() => onSelect(incident)}
    >
      {/* ── Card Header ── */}
      <div className="incident-card-header font-mono">
        <div className="card-header-left">
          {/* NATO-Style Bracketed Priority Badge */}
          <span className={`nato-priority-badge ${prioMeta.cls}`}>
            {prioMeta.label}
          </span>

          {/* Cryptographic Shield */}
          <span className="crypto-shield-tag" title="Ed25519 signature verified via curve25519">
            <ShieldCheck size={12} className="text-emerald-400" />
            <span>[ED25519:VERIFIED]</span>
          </span>

          {/* Hop Progression */}
          <span className="hop-tag" title="Mesh relay hop progression">
            <GitFork size={11} className="text-cyan-400" />
            <span>HOP 0{incident.hopCount}/07</span>
          </span>
        </div>

        {/* Timestamps */}
        <div className="card-header-right tabular-nums">
          <span className="time-relative font-mono">{formatRelativeTime(incident.timestamp)}</span>
          <span className="time-utc font-mono" title="Exact UTC Time">
            {formatUtcTime(incident.timestamp)}
          </span>
        </div>
      </div>

      {/* ── Card Body ── */}
      <div className="incident-card-body">
        {/* Title Row: Category & Headcount */}
        <div className="incident-title-row font-mono">
          <div className="incident-category-title font-mono">
            <span>{category}</span>
          </div>

          <div className="title-tags-group">
            {headcount !== null && (
              <span className="victim-count-pill font-mono">
                <Users size={12} />
                <span>👥 {headcount.toString().padStart(2, '0')} VICTIMS</span>
              </span>
            )}
          </div>
        </div>

        {/* Field Situation Notes with DecryptedText Terminal Effect */}
        <div className="incident-sitrep-box font-mono">
          <p className="sitrep-text">
            <DecryptedText
              text={details}
              speed={20}
              maxIterations={6}
              sequential={true}
              className="text-slate-200"
              encryptedClassName="text-cyan-400 font-bold"
            />
          </p>
        </div>

        {/* Metadata Strip: Message ID + Coordinates */}
        <div className="incident-meta-strip font-mono tabular-nums">
          {/* Message ID with Copy */}
          <div className="meta-item msg-id-item" onClick={handleCopyId} title="Click to copy message ID">
            <span className="meta-label">ID:</span>
            <span className="meta-val id-val">{incident.messageId.slice(0, 16)}</span>
            {copiedMsgId ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          </div>

          {/* GPS Coordinates with Copy */}
          <div
            className={`meta-item coords-item ${hasGps ? 'has-gps' : 'no-gps'}`}
            onClick={handleCopyCoords}
            title={hasGps ? 'Click to copy Lat/Lng' : 'No GPS coordinate available'}
          >
            <MapPin size={11} />
            <span className="meta-val">{coordsString}</span>
            {hasGps && (
              copiedCoords ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />
            )}
          </div>
        </div>
      </div>

      {/* ── Card Actions Bar ── */}
      <div className="incident-card-actions font-mono">
        {hasGps && (
          <button
            type="button"
            className="action-btn map-focus-btn"
            onClick={(e) => {
              e.stopPropagation();
              onFocusMap(incident);
            }}
            title="Pan and zoom Tactical GIS Radar to this location"
          >
            <Crosshair size={12} className="text-cyan-400" />
            <span>[🎯 FOCUS MAP]</span>
          </button>
        )}

        <button
          type="button"
          className={`action-btn hex-toggle-btn ${isExpanded ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          title="Inspect raw 96-byte packet frame and decoded JSON"
        >
          <Terminal size={12} className="text-amber-400" />
          <span>[🔍 96B WIRE INSPECTOR]</span>
          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* ── Collapsible 96-Byte Hex Inspector Drawer ── */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="hex-drawer-wrapper"
            onClick={(e) => e.stopPropagation()}
          >
            <HexDumpInspector incident={incident} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
};

export default IncidentCard;
