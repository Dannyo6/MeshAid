import { useState } from 'react';
import {
  X,
  Zap,
  Radio,
  Send,
  MapPin,
  Users,
  AlertTriangle,
  Flame,
  Truck,
  Info,
} from 'lucide-react';
import type { MeshTelemetryRecord } from '../App';

interface PacketSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInjectIncident: (incident: MeshTelemetryRecord) => void;
}

const PRESET_LOCATIONS = [
  { name: 'Bengaluru Incident Hub (HQ)', lat: 12.9716, lng: 77.5946 },
  { name: 'MG Road Metro Station (Sector B)', lat: 12.9754, lng: 77.608 },
  { name: 'Majestic Inter-City Transit Hub', lat: 12.9767, lng: 77.5713 },
  { name: 'Whitefield Industrial Sector E', lat: 12.9698, lng: 77.7499 },
  { name: 'Koramangala Relief Sub-Station', lat: 12.9352, lng: 77.6245 },
];

export const PacketSimulatorModal: React.FC<PacketSimulatorModalProps> = ({
  isOpen,
  onClose,
  onInjectIncident,
}) => {
  const [priority, setPriority] = useState<number>(1);
  const [category, setCategory] = useState<string>('STRUCTURAL_COLLAPSE');
  const [headcount, setHeadcount] = useState<number>(4);
  const [selectedLocationIdx, setSelectedLocationIdx] = useState<number>(0);
  const [customLat, setCustomLat] = useState<string>('12.9716');
  const [customLng, setCustomLng] = useState<string>('77.5946');
  const [useCustomLocation, setUseCustomLocation] = useState<boolean>(false);
  const [hopCount, setHopCount] = useState<number>(1);
  const [notes, setNotes] = useState<string>('Trapped in basement sector B. Structural debris obstructing ingress.');
  const [isInjecting, setIsInjecting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectLocation = (idx: number) => {
    setSelectedLocationIdx(idx);
    setUseCustomLocation(false);
    setCustomLat(PRESET_LOCATIONS[idx].lat.toFixed(4));
    setCustomLng(PRESET_LOCATIONS[idx].lng.toFixed(4));
  };

  const handleInject = async (method: 'HTTP_API' | 'LOCAL') => {
    setIsInjecting(true);
    setStatusMessage(null);

    const lat = useCustomLocation
      ? parseFloat(customLat) || 12.9716
      : PRESET_LOCATIONS[selectedLocationIdx].lat;
    const lng = useCustomLocation
      ? parseFloat(customLng) || 77.5946
      : PRESET_LOCATIONS[selectedLocationIdx].lng;

    // Generate truncated SHA-256 message ID
    const randomHex = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0')
    ).join('');

    // Synthetic Ed25519 public key hex
    const dummyPubHex = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0')
    ).join('');

    const payloadObj = {
      headcount,
      type: category,
      category,
      notes,
      details: notes,
      publicKey: dummyPubHex,
    };

    const newRecord: MeshTelemetryRecord = {
      messageId: randomHex,
      priority,
      hopCount,
      timestamp: Math.floor(Date.now() / 1000),
      lat,
      lng,
      payload: payloadObj,
      receivedAt: Date.now(),
    };

    if (method === 'HTTP_API') {
      try {
        // Build simulated packet base64
        const payloadStr = JSON.stringify(payloadObj);
        const payloadBytes = new TextEncoder().encode(payloadStr);
        const wireBuffer = new Uint8Array(96 + payloadBytes.length);
        const view = new DataView(wireBuffer.buffer);

        wireBuffer[0] = 0x4d; // 'M'
        wireBuffer[1] = 0x41; // 'A'
        wireBuffer[2] = 1;    // Version
        wireBuffer[3] = priority;
        view.setUint16(4, hopCount, false);

        for (let i = 0; i < 8; i++) {
          wireBuffer[6 + i] = parseInt(randomHex.slice(i * 2, i * 2 + 2), 16) || 0;
        }

        const nowSec = Math.floor(Date.now() / 1000);
        view.setUint32(14, nowSec, false);
        view.setUint32(18, 3600, false);
        view.setFloat32(22, lat, false);
        view.setFloat32(26, lng, false);
        view.setUint16(30, payloadBytes.length, false);

        // Dummy signature
        for (let i = 0; i < 64; i++) {
          wireBuffer[32 + i] = 0xaa;
        }
        wireBuffer.set(payloadBytes, 96);

        // Binary to base64
        let binaryStr = '';
        for (let i = 0; i < wireBuffer.length; i++) {
          binaryStr += String.fromCharCode(wireBuffer[i]);
        }
        const b64 = btoa(binaryStr);

        const apiCandidateUrls = [
          '/api/mesh/sync',
          'http://localhost:3000/api/mesh/sync',
          'http://localhost:4000/api/mesh/sync',
        ];

        let posted = false;
        for (const url of apiCandidateUrls) {
          try {
            const resp = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ packets: [b64] }),
            });
            if (resp.ok) {
              posted = true;
              setStatusMessage('SUCCESS: Wire packet transmitted to Gateway Ingestion API');
              break;
            }
          } catch {
            // try next
          }
        }

        if (!posted) {
          // Fallback to local injection
          onInjectIncident(newRecord);
          setStatusMessage('NOTE: Gateway offline — Injected into local Command Center feed.');
        }
      } catch (err) {
        onInjectIncident(newRecord);
        setStatusMessage('Injected locally (API sync bypassed).');
      }
    } else {
      onInjectIncident(newRecord);
      setStatusMessage('SUCCESS: Injected directly into live telemetry feed.');
    }

    setIsInjecting(false);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="simulator-overlay" onClick={onClose}>
      <div
        className="simulator-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="simulator-header">
          <div className="simulator-title-group">
            <Radio size={16} className="text-amber-400 animate-pulse" />
            <span className="font-mono simulator-title">TACTICAL PACKET SIMULATOR DOCK</span>
          </div>
          <button
            type="button"
            className="simulator-close-btn"
            onClick={onClose}
            title="Close simulator"
          >
            <X size={16} />
          </button>
        </div>

        <p className="simulator-subtitle font-mono">
          Inject simulated Ed25519-framed emergency packets to validate Base Station C2 ingestion,
          dispatch triage, and GIS radar rendering.
        </p>

        {statusMessage && (
          <div className="simulator-alert-banner font-mono">
            {statusMessage}
          </div>
        )}

        {/* Priority Tier Selector */}
        <div className="simulator-section">
          <label className="simulator-label font-mono">PRIORITY TIER CLASSIFICATION</label>
          <div className="simulator-priority-grid font-mono">
            <button
              type="button"
              className={`sim-prio-btn sim-p0 ${priority === 0 ? 'selected' : ''}`}
              onClick={() => {
                setPriority(0);
                setCategory('DAM_BREACH_EVACUATION');
                setNotes('Authority mandate: Immediate vertical evacuation ordered.');
              }}
            >
              <AlertTriangle size={14} />
              <span>[P0:AUTHORITY]</span>
            </button>

            <button
              type="button"
              className={`sim-prio-btn sim-p1 ${priority === 1 ? 'selected' : ''}`}
              onClick={() => {
                setPriority(1);
                setCategory('STRUCTURAL_COLLAPSE');
                setNotes('Trapped in basement sector B. High casualty risk.');
              }}
            >
              <Flame size={14} />
              <span>[P1:CRIT-SOS]</span>
            </button>

            <button
              type="button"
              className={`sim-prio-btn sim-p2 ${priority === 2 ? 'selected' : ''}`}
              onClick={() => {
                setPriority(2);
                setCategory('LOGISTICS_BLOOD_REQ');
                setNotes('Urgent requirement for 10 units O-Negative blood & portable generator.');
              }}
            >
              <Truck size={14} />
              <span>[P2:SUPPLIES]</span>
            </button>

            <button
              type="button"
              className={`sim-prio-btn sim-p3 ${priority === 3 ? 'selected' : ''}`}
              onClick={() => {
                setPriority(3);
                setCategory('ROAD_STATUS_UPDATE');
                setNotes('Field bulletin: Access road clear for 4x4 relief trucks.');
              }}
            >
              <Info size={14} />
              <span>[P3:INTEL]</span>
            </button>
          </div>
        </div>

        {/* Emergency Category & Headcount */}
        <div className="simulator-two-col">
          <div className="simulator-section">
            <label className="simulator-label font-mono">EMERGENCY CLASSIFICATION</label>
            <input
              type="text"
              className="simulator-input font-mono"
              value={category}
              onChange={(e) => setCategory(e.target.value.toUpperCase())}
              placeholder="e.g. STRUCTURAL_COLLAPSE"
            />
          </div>

          <div className="simulator-section">
            <label className="simulator-label font-mono">VICTIMS / PERSONS AT RISK</label>
            <div className="headcount-input-wrap font-mono">
              <Users size={14} className="text-slate-400" />
              <input
                type="number"
                min="0"
                max="999"
                className="simulator-input font-mono tabular-nums"
                value={headcount}
                onChange={(e) => setHeadcount(Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
            </div>
          </div>
        </div>

        {/* Tactical Location Presets */}
        <div className="simulator-section">
          <label className="simulator-label font-mono">TACTICAL GPS LOCATION (SECTOR BEACON)</label>
          <div className="preset-locations-list font-mono">
            {PRESET_LOCATIONS.map((loc, idx) => (
              <button
                key={loc.name}
                type="button"
                className={`preset-loc-item ${!useCustomLocation && selectedLocationIdx === idx ? 'active' : ''}`}
                onClick={() => handleSelectLocation(idx)}
              >
                <MapPin size={12} />
                <span className="loc-name">{loc.name}</span>
                <span className="loc-coords">
                  {loc.lat.toFixed(4)}°, {loc.lng.toFixed(4)}°
                </span>
              </button>
            ))}
          </div>

          <div className="custom-coords-toggle font-mono">
            <label className="coords-checkbox-label">
              <input
                type="checkbox"
                checked={useCustomLocation}
                onChange={(e) => setUseCustomLocation(e.target.checked)}
              />
              <span>Enter custom GPS coordinates</span>
            </label>
          </div>

          {useCustomLocation && (
            <div className="simulator-two-col custom-coords-row font-mono">
              <div>
                <label className="sub-label">LATITUDE</label>
                <input
                  type="text"
                  className="simulator-input font-mono"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  placeholder="12.9716"
                />
              </div>
              <div>
                <label className="sub-label">LONGITUDE</label>
                <input
                  type="text"
                  className="simulator-input font-mono"
                  value={customLng}
                  onChange={(e) => setCustomLng(e.target.value)}
                  placeholder="77.5946"
                />
              </div>
            </div>
          )}
        </div>

        {/* Mesh Hops & Situation Notes */}
        <div className="simulator-section">
          <div className="hop-slider-header font-mono">
            <label className="simulator-label">HOP PROGRESSION</label>
            <span className="hop-slider-val text-cyan-400">HOP {hopCount} / 07</span>
          </div>
          <input
            type="range"
            min="1"
            max="7"
            value={hopCount}
            onChange={(e) => setHopCount(parseInt(e.target.value, 10))}
            className="simulator-range-slider"
          />
        </div>

        <div className="simulator-section">
          <label className="simulator-label font-mono">FIELD SITUATION REPORT (SITREP)</label>
          <textarea
            className="simulator-textarea font-mono"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Field report notes..."
          />
        </div>

        {/* Action Buttons */}
        <div className="simulator-actions font-mono">
          <button
            type="button"
            className="sim-submit-btn sim-btn-primary"
            onClick={() => handleInject('HTTP_API')}
            disabled={isInjecting}
          >
            <Send size={14} />
            <span>{isInjecting ? 'TRANSMITTING...' : 'INJECT VIA HTTP /api/mesh/sync'}</span>
          </button>

          <button
            type="button"
            className="sim-submit-btn sim-btn-secondary"
            onClick={() => handleInject('LOCAL')}
            disabled={isInjecting}
          >
            <Zap size={14} />
            <span>INSTANT IN-MEMORY INJECT</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PacketSimulatorModal;
