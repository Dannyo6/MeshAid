/**
 * Binary Wire Packet Codec & Ed25519 Cryptographic Verification Engine
 * Strictly compatible with MeshAid Android Packet Codec wire specification:
 *
 * Wire format (Total Header: 93 bytes + N bytes payload):
 * - Version (1B)
 * - Priority Class (1B: P0-P3)
 * - Hop Count (2B, Big Endian)
 * - Message ID (8B SHA-256 slice)
 * - Timestamp (4B UInt32 seconds, Big Endian)
 * - TTL (4B UInt32 seconds, Big Endian)
 * - Latitude (4B IEEE 754 Float, NaN if null)
 * - Longitude (4B IEEE 754 Float, NaN if null)
 * - Payload Length (1B, 0..255)
 * - Ed25519 Signature (64B)
 * - Variable Payload (N bytes)
 */

import crypto from 'node:crypto';
import { Priority } from './types.ts';

export const HEADER_SIZE = 93;
export const MAX_PAYLOAD_SIZE = 255;

// Standard ASN.1 prefix for 32-byte Ed25519 public keys to form X.509 DER SubjectPublicKeyInfo (12 bytes)
export const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export class PacketIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PacketIntegrityError';
  }
}

export class ExpiredPacketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpiredPacketError';
  }
}

export interface MeshAidWirePacket {
  version: number;
  priority: Priority;
  hopCount: number;
  messageId: string; // 16-char hex
  messageIdBytes: Buffer; // 8 bytes
  timestampSeconds: number; // 4-byte uint32
  ttlSeconds: number; // 4-byte uint32
  latitude: number | null;
  longitude: number | null;
  payloadLength: number;
  signature: Buffer; // 64 bytes
  signatureHex: string;
  payload: Buffer;
  payloadJson: Record<string, unknown> | null;
}

export interface EncodePacketOptions {
  version?: number;
  priority: Priority;
  hopCount?: number;
  messageId: string | Buffer;
  timestampSeconds: number;
  ttlSeconds: number;
  latitude?: number | null;
  longitude?: number | null;
  signature?: Buffer;
  payload: Buffer | string | Record<string, unknown>;
}

export interface DecodePacketOptions {
  currentTimeSeconds?: number;
  publicKey?: crypto.KeyObject | Buffer | string;
  expectedChecksum?: string;
  requireSignature?: boolean;
}

// In-memory registry for known node public keys (optional lookup fallback)
const keyRegistry = new Map<string, crypto.KeyObject>();

export function registerPublicKey(keyId: string, key: crypto.KeyObject | Buffer | string): void {
  keyRegistry.set(keyId, toPublicKeyObject(key));
}

export function clearKeyRegistry(): void {
  keyRegistry.clear();
}

/**
 * Converts various public key formats (raw 32-byte Buffer, SPKI DER, PEM, hex string, base64) to KeyObject
 */
export function toPublicKeyObject(key: crypto.KeyObject | Buffer | string): crypto.KeyObject {
  if (key && typeof key === 'object' && 'type' in key && key.type === 'public') {
    return key as crypto.KeyObject;
  }

  let buf: Buffer;
  if (typeof key === 'string') {
    const trimmed = key.trim();
    if (trimmed.startsWith('-----BEGIN')) {
      return crypto.createPublicKey(trimmed);
    }
    // Check if hex (64 or 88 hex characters)
    if (/^[0-9a-fA-F]+$/.test(trimmed) && (trimmed.length === 64 || trimmed.length === 88)) {
      buf = Buffer.from(trimmed, 'hex');
    } else {
      // Base64 or base64url
      buf = Buffer.from(trimmed, 'base64');
    }
  } else if (Buffer.isBuffer(key)) {
    buf = key;
  } else if (key instanceof Uint8Array) {
    buf = Buffer.from(key.buffer, key.byteOffset, key.byteLength);
  } else {
    buf = Buffer.from(key as unknown as ArrayBuffer);
  }

  if (buf.length === 32) {
    buf = Buffer.concat([ED25519_SPKI_PREFIX, buf]);
  }

  return crypto.createPublicKey({
    key: buf,
    format: 'der',
    type: 'spki'
  });
}

/**
 * Normalizes an 8-byte message ID from string or buffer
 */
export function normalizeMessageId(id: string | Buffer): Buffer {
  if (Buffer.isBuffer(id)) {
    if (id.length !== 8) {
      throw new PacketIntegrityError(`Message ID buffer must be 8 bytes, got ${id.length}`);
    }
    return id;
  }
  const clean = id.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length >= 16) {
    return Buffer.from(clean.slice(0, 16), 'hex');
  }
  // Hash to derive 8 bytes if non-hex or shorter
  return crypto.createHash('sha256').update(id, 'utf8').digest().subarray(0, 8);
}

/**
 * Collects the canonical signable bytes covered by the Ed25519 signature
 * (29 bytes header + N bytes payload)
 */
export function getSignableBytes(packet: {
  version?: number;
  priority: Priority;
  hopCount?: number;
  messageId: string | Buffer;
  timestampSeconds: number;
  ttlSeconds: number;
  latitude?: number | null;
  longitude?: number | null;
  payload: Buffer | string | Record<string, unknown>;
}): Buffer {
  const payloadBuf = Buffer.isBuffer(packet.payload)
    ? packet.payload
    : typeof packet.payload === 'string'
      ? Buffer.from(packet.payload, 'utf8')
      : Buffer.from(JSON.stringify(packet.payload), 'utf8');

  if (payloadBuf.length > MAX_PAYLOAD_SIZE) {
    throw new PacketIntegrityError(
      `Payload size exceeds ${MAX_PAYLOAD_SIZE} bytes (got ${payloadBuf.length})`
    );
  }

  const idBuf = normalizeMessageId(packet.messageId);

  const buf = Buffer.alloc(29 + payloadBuf.length);
  buf.writeUInt8(packet.version ?? 1, 0);
  buf.writeUInt8(packet.priority, 1);
  buf.writeUInt16BE(packet.hopCount ?? 0, 2);
  idBuf.copy(buf, 4, 0, 8);
  buf.writeUInt32BE(packet.timestampSeconds, 12);
  buf.writeUInt32BE(packet.ttlSeconds, 16);
  buf.writeFloatBE(packet.latitude != null ? packet.latitude : NaN, 20);
  buf.writeFloatBE(packet.longitude != null ? packet.longitude : NaN, 24);
  buf.writeUInt8(payloadBuf.length, 28);
  payloadBuf.copy(buf, 29);

  return buf;
}

/**
 * Serializes packet into binary wire format (93 bytes header + payload)
 */
export function encodeWirePacket(packet: EncodePacketOptions): Buffer {
  const version = packet.version ?? 1;
  const hopCount = packet.hopCount ?? 0;
  const signature = packet.signature ?? Buffer.alloc(64);
  if (signature.length !== 64) {
    throw new PacketIntegrityError(`Signature must be exactly 64 bytes (got ${signature.length})`);
  }

  const payloadBuf = Buffer.isBuffer(packet.payload)
    ? packet.payload
    : typeof packet.payload === 'string'
      ? Buffer.from(packet.payload, 'utf8')
      : Buffer.from(JSON.stringify(packet.payload), 'utf8');

  if (payloadBuf.length > MAX_PAYLOAD_SIZE) {
    throw new PacketIntegrityError(
      `Payload size exceeds ${MAX_PAYLOAD_SIZE} bytes (got ${payloadBuf.length})`
    );
  }

  const idBuf = normalizeMessageId(packet.messageId);

  const buf = Buffer.alloc(HEADER_SIZE + payloadBuf.length);
  buf.writeUInt8(version, 0);
  buf.writeUInt8(packet.priority, 1);
  buf.writeUInt16BE(hopCount, 2);
  idBuf.copy(buf, 4, 0, 8);
  buf.writeUInt32BE(packet.timestampSeconds, 12);
  buf.writeUInt32BE(packet.ttlSeconds, 16);
  buf.writeFloatBE(packet.latitude != null ? packet.latitude : NaN, 20);
  buf.writeFloatBE(packet.longitude != null ? packet.longitude : NaN, 24);
  buf.writeUInt8(payloadBuf.length, 28);
  signature.copy(buf, 29, 0, 64);
  payloadBuf.copy(buf, 93);

  return buf;
}

/**
 * Signs a packet or packet options with an Ed25519 private key
 */
export function signWirePacket(
  packet: EncodePacketOptions,
  privateKey: crypto.KeyObject | Buffer | string
): Buffer {
  const signable = getSignableBytes(packet);
  const keyObj = typeof privateKey === 'object' && 'type' in privateKey
    ? (privateKey as crypto.KeyObject)
    : crypto.createPrivateKey(privateKey);
  const signature = crypto.sign(null, signable, keyObj);
  return encodeWirePacket({
    ...packet,
    signature
  });
}

/**
 * Deserializes wire binary bytes into a MeshAidWirePacket and verifies Ed25519 signature & TTL
 */
export function decodeWirePacket(
  rawBytes: Buffer | Uint8Array,
  options?: DecodePacketOptions
): MeshAidWirePacket {
  const bytes = Buffer.isBuffer(rawBytes) ? rawBytes : Buffer.from(rawBytes);

  if (bytes.length < HEADER_SIZE) {
    throw new PacketIntegrityError(
      `Packet length ${bytes.length} is less than minimum header size (${HEADER_SIZE})`
    );
  }

  const version = bytes.readUInt8(0);
  if (version !== 1) {
    throw new PacketIntegrityError(`Unsupported protocol version: ${version}`);
  }

  const priorityTier = bytes.readUInt8(1);
  if (priorityTier < 0 || priorityTier > 3) {
    throw new PacketIntegrityError(`Invalid priority tier: ${priorityTier}`);
  }
  const priority = priorityTier as Priority;

  const hopCount = bytes.readUInt16BE(2);
  const messageIdBytes = bytes.subarray(4, 12);
  const messageId = messageIdBytes.toString('hex');

  const timestampSeconds = bytes.readUInt32BE(12);
  const ttlSeconds = bytes.readUInt32BE(16);

  const rawLat = bytes.readFloatBE(20);
  const latitude = Number.isNaN(rawLat) ? null : rawLat;

  const rawLng = bytes.readFloatBE(24);
  const longitude = Number.isNaN(rawLng) ? null : rawLng;

  const payloadLength = bytes.readUInt8(28);
  const signature = bytes.subarray(29, 93);
  const signatureHex = signature.toString('hex');

  const remainingBytes = bytes.length - HEADER_SIZE;
  if (remainingBytes !== payloadLength) {
    throw new PacketIntegrityError(
      `Payload length mismatch: header declares ${payloadLength} bytes, but buffer contains ${remainingBytes} bytes`
    );
  }

  const payload = bytes.subarray(93, 93 + payloadLength);

  // Parse JSON payload if possible
  let payloadJson: Record<string, unknown> | null = null;
  try {
    const text = payload.toString('utf8');
    payloadJson = JSON.parse(text);
  } catch {
    payloadJson = null;
  }

  // TTL expiration check
  const nowSeconds = options?.currentTimeSeconds ?? Math.floor(Date.now() / 1000);
  if (nowSeconds >= (timestampSeconds + ttlSeconds)) {
    throw new ExpiredPacketError(
      `Packet TTL has expired (ts=${timestampSeconds}, ttl=${ttlSeconds}, now=${nowSeconds})`
    );
  }

  // Signature validation
  const requireSignature = options?.requireSignature ?? true;
  const isUnsigned = signature.every(b => b === 0);

  if (requireSignature) {
    if (isUnsigned) {
      throw new PacketIntegrityError('Packet is unsigned (all 64 signature bytes are zero)');
    }

    // Resolve public key: options -> payload -> keyRegistry
    let pubKey = options?.publicKey;

    if (!pubKey && payloadJson) {
      const candidate = (payloadJson.publicKey ?? payloadJson.senderPublicKey ?? payloadJson.pubKey) as
        | string
        | undefined;
      if (candidate && typeof candidate === 'string') {
        pubKey = candidate;
      }
    }

    if (!pubKey) {
      pubKey = keyRegistry.get(messageId);
    }

    if (!pubKey) {
      throw new PacketIntegrityError(
        'Missing public key for Ed25519 signature verification (not in options, payload, or registry)'
      );
    }

    const keyObj = toPublicKeyObject(pubKey);
    // Canonical signable bytes: 29 bytes header + payload
    const signableBytes = Buffer.concat([bytes.subarray(0, 29), bytes.subarray(93)]);
    const isValid = crypto.verify(null, signableBytes, keyObj, signature);
    if (!isValid) {
      throw new PacketIntegrityError(
        'Ed25519 signature verification failed: packet has been tampered with'
      );
    }
  }

  return {
    version,
    priority,
    hopCount,
    messageId,
    messageIdBytes,
    timestampSeconds,
    ttlSeconds,
    latitude,
    longitude,
    payloadLength,
    signature,
    signatureHex,
    payload,
    payloadJson
  };
}
