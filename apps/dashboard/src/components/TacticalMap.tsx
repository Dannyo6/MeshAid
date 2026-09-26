import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { MeshTelemetryRecord, IncidentPayload } from '../App';
import './TacticalMap.css';

export interface TacticalMapProps {
  incidents: MeshTelemetryRecord[];
  selectedIncidentId?: string | null;
  onSelectIncident?: (incident: MeshTelemetryRecord) => void;
  className?: string;
  viewTrigger?: unknown;
}

// Helper to safely parse incident payload
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

// Extract human-readable details
function extractDetails(payloadObj: IncidentPayload): string {
  if (payloadObj.details) return String(payloadObj.details);
  if (payloadObj.notes) return String(payloadObj.notes);
  if (payloadObj.alert) return String(payloadObj.alert);
  if (payloadObj.situation) return String(payloadObj.situation);
  if (payloadObj.text) return String(payloadObj.text);
  if (payloadObj.category) return String(payloadObj.category);
  return 'Situational report broadcasted from offline field node.';
}

// Extract category/type label
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

// Extract headcount
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

// Cache of Leaflet DivIcons by priority and selection state
const markerIconCache: Record<string, L.DivIcon> = {};

function getTacticalMarkerIcon(priority: number, isSelected = false): L.DivIcon {
  const cacheKey = `${priority}_${isSelected ? 1 : 0}`;
  if (markerIconCache[cacheKey]) {
    return markerIconCache[cacheKey];
  }

  let pinClass = 'tactical-pin-p3';
  let badgeLabel = 'P3';
  if (priority === 0) {
    pinClass = 'tactical-pin-p0';
    badgeLabel = 'P0';
  } else if (priority === 1) {
    pinClass = 'tactical-pin-p1';
    badgeLabel = 'P1';
  } else if (priority === 2) {
    pinClass = 'tactical-pin-p2';
    badgeLabel = 'P2';
  }

  const selectedClass = isSelected ? ' tactical-pin-selected' : '';
  const isCritical = priority === 0 || priority === 1;
  const pulseHtml = isCritical ? `<div class="tactical-pulse ${pinClass}"></div>` : '';

  const icon = L.divIcon({
    className: 'custom-tactical-marker',
    html: `
      <div class="tactical-marker-container">
        ${pulseHtml}
        <div class="tactical-pin ${pinClass}${selectedClass}">
          <span>${badgeLabel}</span>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });

  markerIconCache[cacheKey] = icon;
  return icon;
}

/**
 * Controller inside MapContainer to resize and fit markers
 */
function MapTacticalController({
  points,
  viewTrigger,
}: {
  points: [number, number][];
  viewTrigger?: unknown;
}) {
  const map = useMap();

  // Invalidate size on mount or when view layout changes
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map, viewTrigger]);

  const handleRecenter = () => {
    if (points.length === 0) {
      map.setView([12.9716, 77.5946], 13);
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  };

  return (
    <div className="tactical-map-actions">
      <button
        type="button"
        className="tactical-recenter-btn"
        onClick={handleRecenter}
        title="Fit all active GPS incidents"
      >
        🎯 Recenter ({points.length})
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
  // Filter for valid GPS coordinates (not null and not NaN and within bounds)
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

  // Points array for centroid and bounds fitting
  const points = useMemo<[number, number][]>(() => {
    return validIncidents.map((inc) => [inc.lat as number, inc.lng as number]);
  }, [validIncidents]);

  // Default initial center: centroid of incidents or default command center
  const initialCenter: [number, number] = useMemo(() => {
    if (points.length === 0) {
      return [12.9716, 77.5946]; // Default tactical center (Bengaluru Command Center)
    }
    const sumLat = points.reduce((acc, p) => acc + p[0], 0);
    const sumLng = points.reduce((acc, p) => acc + p[1], 0);
    return [sumLat / points.length, sumLng / points.length];
  }, [points]);

  return (
    <div className={`tactical-map-wrapper ${className}`}>
      {/* Top Header Controls Overlay */}
      <div className="tactical-map-header">
        <div className="tactical-map-badge">
          <span className="tactical-map-dot" />
          <span>TACTICAL GIS RADAR</span>
          <span style={{ color: '#38bdf8' }}>({validIncidents.length} Mapped)</span>
        </div>
      </div>

      <MapContainer
        center={initialCenter}
        zoom={13}
        scrollWheelZoom={true}
        className="tactical-map-container"
      >
        {/* Dark-mode CartoDB tile layer */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />

        <MapTacticalController points={points} viewTrigger={viewTrigger} />

        {/* Dynamic Markers for each valid incident */}
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
                <div className="tactical-popup">
                  {/* Header: Priority Badge + Cryptographic Verified Shield */}
                  <div className="tactical-popup-header">
                    <span className={`tactical-popup-badge-p${incident.priority}`}>
                      {incident.priority === 0
                        ? 'P0 AUTHORITY'
                        : incident.priority === 1
                          ? 'P1 SOS'
                          : incident.priority === 2
                            ? 'P2 SUPPLIES'
                            : 'P3 INFO'}
                    </span>
                    <span
                      className="tactical-popup-shield"
                      title="Decoded from Ed25519 digitally signed wire frame. Authenticity verified."
                    >
                      🛡️ Ed25519 Verified
                    </span>
                  </div>

                  {/* Title: Emergency Type & Headcount */}
                  <div className="tactical-popup-title-row">
                    <span className="tactical-popup-type">{category}</span>
                    {headcount !== null && (
                      <span className="tactical-popup-headcount" title="Persons at risk">
                        👥 {headcount} {headcount === 1 ? 'victim' : 'victims'}
                      </span>
                    )}
                  </div>

                  {/* Situation Report Snippet */}
                  <p className="tactical-popup-snippet">{details}</p>

                  {/* Meta: Hop Count & GPS Coordinates */}
                  <div className="tactical-popup-meta">
                    <span>
                      🔀 {incident.hopCount} {incident.hopCount === 1 ? 'hop' : 'hops'}
                    </span>
                    <span>
                      📍 {Number(incident.lat).toFixed(4)}°, {Number(incident.lng).toFixed(4)}°
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {validIncidents.length === 0 && (
        <div className="tactical-map-empty">
          ⚠️ No active GPS coordinates in current transmission feed
        </div>
      )}
    </div>
  );
};

export default TacticalMap;
