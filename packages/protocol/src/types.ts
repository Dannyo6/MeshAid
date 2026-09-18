/**
 * MeshAid Protocol Core Type Definitions
 * Strict Non-AI, Delay/Disruption-Tolerant Networking Specification
 */

export const Priority = {
  EMERGENCY_AUTHORITY: 0, // P0: Dam breaches, evacuation orders, tsunami warnings
  CIVILIAN_SOS: 1,        // P1: Life-threatening distress, trapped victims, triage SOS
  RESOURCE_LOGISTICS: 2,  // P2: Water, blood, generator, medical supply requests/offers
  GENERAL_INFO: 3         // P3: Road status, welfare checks, neighborhood bulletins
} as const;

export type Priority = typeof Priority[keyof typeof Priority];

export type PayloadType = 'SOS' | 'BULLETIN' | 'RESOURCE_REQ' | 'RESOURCE_OFFER' | 'ACK';

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracyM?: number;
}

export interface MeshAidEnvelope {
  version: number;
  id: string;              // Deterministic 16-character hex identifier
  senderId: string;        // Originating node ID / public key fingerprint
  recipientId: string;     // 'BROADCAST' or target Node ID
  timestamp: number;       // Creation timestamp in UTC ms
  ttl: number;             // Time-To-Live in seconds
  priority: Priority;      // P0 to P3
  hopCount: number;        // Incremented by each relay
  maxHops: number;         // Upper bound on hops (e.g. 7)
  type: PayloadType;       // Bundle category
  payload: Record<string, unknown>; // Application emergency payload
  location?: GeoLocation;  // Optional GPS coordinates
  signature?: string;      // Cryptographic signature
  checksum: string;        // CRC32 or truncated SHA-256
}

export interface MessageSummary {
  id: string;
  priority: Priority;
  timestamp: number;
  ttl: number;
}

export interface ManifestOffer {
  type: 'MANIFEST_OFFER';
  senderNodeId: string;
  items: MessageSummary[];
}

export interface ManifestRequest {
  type: 'MANIFEST_REQUEST';
  senderNodeId: string;
  requestedIds: string[];
}

export interface BundleAck {
  type: 'BUNDLE_ACK';
  bundleId: string;
  status: 'STORED' | 'DUPLICATE' | 'EXPIRED' | 'REJECTED';
}
