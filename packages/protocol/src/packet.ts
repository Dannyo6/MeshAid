/**
 * Packet serialization, hashing, checksums, and envelope factory
 */

import { createHash } from 'node:crypto';
import { Priority } from './types.ts';
import type { MeshAidEnvelope, PayloadType, GeoLocation } from './types.ts';

export function computeSha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Deterministically generates a collision-resistant 16-character Message ID
 */
export function generateMessageId(senderId: string, timestamp: number, nonce: string): string {
  const seed = `${senderId}:${timestamp}:${nonce}`;
  return computeSha256(seed).slice(0, 16);
}

/**
 * Computes canonical payload checksum for rapid transmission integrity checking
 */
export function computePayloadChecksum(payload: Record<string, unknown>): string {
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  return computeSha256(canonicalString).slice(0, 8);
}

export interface CreateEnvelopeOptions {
  senderId: string;
  recipientId?: string;
  priority: Priority;
  ttlSeconds?: number;
  maxHops?: number;
  type: PayloadType;
  payload: Record<string, unknown>;
  location?: GeoLocation;
  timestamp?: number;
  nonce?: string;
}

export function createEnvelope(options: CreateEnvelopeOptions): MeshAidEnvelope {
  const timestamp = options.timestamp ?? Date.now();
  const nonce = options.nonce ?? Math.random().toString(36).substring(2, 10);
  const ttl = options.ttlSeconds ?? (options.priority === Priority.EMERGENCY_AUTHORITY ? 259200 : 172800);
  const maxHops = options.maxHops ?? 7;
  const id = generateMessageId(options.senderId, timestamp, nonce);
  const checksum = computePayloadChecksum(options.payload);

  return {
    version: 1,
    id,
    senderId: options.senderId,
    recipientId: options.recipientId ?? 'BROADCAST',
    timestamp,
    ttl,
    priority: options.priority,
    hopCount: 0,
    maxHops,
    type: options.type,
    payload: options.payload,
    location: options.location,
    checksum
  };
}

export function serializeEnvelope(envelope: MeshAidEnvelope): string {
  return JSON.stringify(envelope);
}

export function deserializeEnvelope(raw: string): MeshAidEnvelope {
  const parsed = JSON.parse(raw) as MeshAidEnvelope;
  
  if (!parsed.id || typeof parsed.id !== 'string') {
    throw new Error('Invalid MeshAid packet: missing or malformed id');
  }
  if (typeof parsed.priority !== 'number' || parsed.priority < 0 || parsed.priority > 3) {
    throw new Error('Invalid MeshAid packet: malformed priority tier');
  }
  if (!parsed.payload || typeof parsed.payload !== 'object') {
    throw new Error('Invalid MeshAid packet: missing payload');
  }

  // Integrity validation
  const expectedChecksum = computePayloadChecksum(parsed.payload);
  if (parsed.checksum !== expectedChecksum) {
    throw new Error(`Checksum mismatch: expected ${expectedChecksum}, got ${parsed.checksum}`);
  }

  return parsed;
}

export function isPacketExpired(envelope: MeshAidEnvelope, nowMs: number = Date.now()): boolean {
  const expiryTimeMs = envelope.timestamp + (envelope.ttl * 1000);
  return nowMs >= expiryTimeMs;
}
