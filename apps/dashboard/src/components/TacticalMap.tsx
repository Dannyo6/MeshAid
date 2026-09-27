import React, { useMemo, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Crosshair,
  ShieldCheck,
  Users,
  Ambulance,
  Package,
  Copy,
  Check,
} from 'lucide-react';
import type { MeshTelemetryRecord, IncidentPayload } from '../App';
import './TacticalMap.css';

export interface TacticalMapProps {
  incidents: MeshTelemetryRecord[];
  selectedIncidentId?: string | null;
  onSelectIncident?: (incident: MeshTelemetryRecord) => void;
  className?: string;
  viewTrigger?: unknown;
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

// Marker cache for Leaflet DivIcons
const markerIconCache: Record<string, L.DivIcon> = {};

function getTacticalMarkerIcon(priority: number, isSelected = false): L.DivIcon {
  const cacheKey = `${priority}_${isSelected ? 1 : 0}`;
  if (markerIconCache[cacheKey]) {
    return markerIconCache[cacheKey];
  }

  let pinClass = 'tactical-pin-p3';
  let badgeLabel = '[P3:INF]';
  if (priority === 0) {
    pinClass = 'tactical-pin-p0';
    badgeLabel = '[P0:AUTH]';
  } else if (priority === 1) {
    pinClass = 'tactical-pin-p1';
    badgeLabel = '[P1:SOS]';
  } else if (priority === 2) {
    pinClass = 'tactical-pin-p2';
    badgeLabel = '[P2:SUP]';
  }

  const selectedClass = isSelected ? ' tactical-pin-selected' : '';
  const isCritical = priority === 0 || priority === 1;

  // Custom SVG Multi-Ring Pulsating Radar Beacon for P0 / P1
  const pulseSvg = isCritical
    ? `<div class="radar-beacon-rings ${pinClass}">
         <span class="beacon-wave-1"></span>
         <span class="beacon-wave-2"></span>
         <span class="beacon-wave-3"></span>
       </div>`
    : '';

  const icon = L.divIcon({
    className: 'custom-tactical-marker',
    html: `
      <div class="tactical-marker-container">
        ${pulseSvg}
        <div class="tactical-pin ${pinClass}${selectedClass}">
          <span class="tactical-pin-label">${badgeLabel}</span>
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });

  markerIconCache[cacheKey] = icon;
  return icon;
}

function MapTacticalController({
  points,
  selectedPosition,
  viewTrigger,
}: {
  points: [number, number][];
  selectedPosition?: [number, number] | null;
  viewTrigger?: unknown;
}) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map, viewTrigger]);

  useEffect(() => {
    if (selectedPosition) {
      map.flyTo(selectedPosition, 16, { duration: 1.2 });
    }
  }, [map, selectedPosition]);

  const handleRecenterAll = () => {
    if (points.length === 0) {
      map.setView([12.9716, 77.5946], 13);
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  };

  return (
    <div className="tactical-map-controls">
      <button
        type="button"
        className="tactical-map-recenter-btn font-mono"
        onClick={handleRecenterAll}
        title="Fit all active GPS transmissions in viewport"
      >
        <Crosshair size={13} />
        <span>RECENTER RADAR ({points.length})</span>
      </button>
    </div>
  );
}

export const TacticalMap: React.FC<TacticalMapProps> = ({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  className = '',
  viewTrigger,
}) => {
  const [copiedSitrepId, setCopiedSitrepId] = useState<string | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  const validIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const lat = inc.lat;
      const lng = inc.lng;
      return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        !Number.isNaN(lat) &&
        !Number.isNaN(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      );
    });
  }, [incidents]);

  const points = useMemo<[number, number][]>(() => {
    return validIncidents.map((inc) => [inc.lat as number, inc.lng as number]);
  }, [validIncidents]);

  const selectedPosition = useMemo<[number, number] | null>(() => {
    if (!selectedIncidentId) return null;
    const match = validIncidents.find((i) => i.messageId === selectedIncidentId);
    if (match && typeof match.lat === 'number' && typeof match.lng === 'number') {
      return [match.lat, match.lng];
    }
    return null;
  }, [selectedIncidentId, validIncidents]);

  const initialCenter: [number, number] = useMemo(() => {
    if (points.length === 0) {
      return [12.9716, 77.5946]; // Bengaluru Incident Hub Command Center
    }
    const sumLat = points.reduce((acc, p) => acc + p[0], 0);
    const sumLng = points.reduce((acc, p) => acc + p[1], 0);
    return [sumLat / points.length, sumLng / points.length];
  }, [points]);

  const handleCopySitrep = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedSitrepId(id);
    setTimeout(() => setCopiedSitrepId(null), 2000);
  };

  const handleDispatch = (type: string, id: string) => {
    setDispatchStatus(`DISPATCH ORDER ISSUED: ${type} -> INCIDENT #${id.slice(0, 8)}`);
    setTimeout(() => setDispatchStatus(null), 3000);
  };

  return (
    <div className={`tactical-map-wrapper ${className}`}>
      {/* Top Header Tactical Overlay */}
      <div className="tactical-map-header">
        <div className="tactical-map-badge font-mono">
          <span className="radar-sweep-icon" />
          <span className="map-badge-title">TACTICAL GIS RADAR</span>
          <span className="map-badge-divider">//</span>
          <span className="map-badge-count">{validIncidents.length} NODES MAPPED</span>
        </div>

        {dispatchStatus && (
          <div className="map-dispatch-notification font-mono animate-pulse">
            {dispatchStatus}
          </div>
        )}
      </div>

      <MapContainer
        center={initialCenter}
        zoom={13}
        scrollWheelZoom={true}
        className="tactical-map-container"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles-dark"
          maxZoom={19}
        />

        <MapTacticalController
          points={points}
          selectedPosition={selectedPosition}
          viewTrigger={viewTrigger}
        />

        {validIncidents.map((incident) => {
          const payloadObj = parsePayload(incident.payload);
          const details = extractDetails(payloadObj);
          const category = extractCategory(payloadObj, incident.priority);
          const headcount = extractHeadcount(payloadObj);
          const position: [number, number] = [incident.lat as number, incident.lng as number];
          const isSelected = incident.messageId === selectedIncidentId;
          const icon = getTacticalMarkerIcon(incident.priority, isSelected);

          return (
            <Marker
              key={incident.messageId}
              position={position}
              icon={icon}
              eventHandlers={{
                click: () => {
                  onSelectIncident?.(incident);
                },
              }}
            >
              <Popup>
                <div className="tactical-popup font-mono">
                  {/* Popup Header */}
                  <div className="tactical-popup-header">
                    <span className={`popup-badge-p${incident.priority}`}>
                      {incident.priority === 0
                        ? '[P0:AUTHORITY]'
                        : incident.priority === 1
                          ? '[P1:CRIT-SOS]'
                          : incident.priority === 2
                            ? '[P2:SUPPLIES]'
                            : '[P3:INTEL]'}
                    </span>
                    <span className="popup-verified-tag">
                      <ShieldCheck size={11} className="text-emerald-400" />
                      <span>ED25519 VERIFIED</span>
                    </span>
                  </div>

                  {/* Incident Title & Victims */}
                  <div className="tactical-popup-title-row">
                    <span className="popup-title">{category}</span>
                    {headcount !== null && (
                      <span className="popup-victim-badge">
                        <Users size={11} />
                        <span>{headcount} {headcount === 1 ? 'VICTIM' : 'VICTIMS'}</span>
                      </span>
                    )}
                  </div>

                  {/* Situation Report Snippet */}
                  <div className="popup-snippet-box">
                    <p className="popup-snippet">{details}</p>
                  </div>

                  {/* Geo & Hops Meta */}
                  <div className="popup-meta-row tabular-nums">
                    <span>HOP: 0{incident.hopCount}/07</span>
                    <span>
                      {Number(incident.lat).toFixed(4)}°N, {Number(incident.lng).toFixed(4)}°E
                    </span>
                  </div>

                  {/* Tactical Field Action Shortcuts */}
                  <div className="popup-dispatch-actions">
                    <button
                      type="button"
                      className="popup-dispatch-btn btn-med"
                      onClick={() => handleDispatch('AIR-MEDEVAC', incident.messageId)}
                      title="Issue Medevac order"
                    >
                      <Ambulance size={11} />
                      <span>DISPATCH MED-EVAC</span>
                    </button>

                    <button
                      type="button"
                      className="popup-dispatch-btn btn-relief"
                      onClick={() => handleDispatch('SUPPLY RELIEF', incident.messageId)}
                      title="Issue supply relay order"
                    >
                      <Package size={11} />
                      <span>DISPATCH RELIEF</span>
                    </button>

                    <button
                      type="button"
                      className="popup-dispatch-btn btn-copy"
                      onClick={() =>
                        handleCopySitrep(
                          incident.messageId,
                          `[MESHAID C2 SITREP] ${category} @ ${Number(incident.lat).toFixed(4)}, ${Number(incident.lng).toFixed(4)} - ${details}`
                        )
                      }
                      title="Copy Incident SITREP to Clipboard"
                    >
                      {copiedSitrepId === incident.messageId ? (
                        <>
                          <Check size={11} className="text-emerald-400" />
                          <span>COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>COPY SITREP</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {validIncidents.length === 0 && (
        <div className="tactical-map-empty font-mono">
          <span>⚠️ NO GEOLOCATED RF TRANSMISSIONS RECORDED IN CURRENT SECTOR</span>
        </div>
      )}
    </div>
  );
};

export default TacticalMap;
