import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { WebSocket } from 'ws';

import {
  Priority,
  encodeWirePacket,
  signWirePacket
} from '@meshaid/protocol';
import { server, clearStores, wss } from '../src/server.ts';

// Helper to create an Ed25519 keypair and public key hex
function createTestKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  return {
    publicKey,
    privateKey,
    publicKeyHex: rawPub.toString('hex')
  };
}

// Helper to generate a valid signed wire packet Buffer
function createSignedTestPacket(options: {
  priority?: Priority;
  messageId?: string;
  hopCount?: number;
  timestampSeconds?: number;
  ttlSeconds?: number;
  lat?: number;
  lng?: number;
  payloadData?: Record<string, unknown>;
  keyPair?: ReturnType<typeof createTestKeyPair>;
}): { buffer: Buffer; base64: string; messageId: string; keyPair: ReturnType<typeof createTestKeyPair> } {
  const kp = options.keyPair ?? createTestKeyPair();
  const messageId = options.messageId ?? crypto.randomBytes(8).toString('hex');
  const timestampSeconds = options.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = options.ttlSeconds ?? 3600;

  const payload = {
    category: 'MEDICAL_EMERGENCY',
    details: 'Trapped victim requiring urgent evacuation',
    injuredCount: 2,
    publicKey: kp.publicKeyHex,
    ...(options.payloadData ?? {})
  };

  const buffer = signWirePacket(
    {
      priority: options.priority ?? Priority.CIVILIAN_SOS,
      hopCount: options.hopCount ?? 1,
      messageId,
      timestampSeconds,
      ttlSeconds,
      latitude: options.lat ?? 12.9716,
      longitude: options.lng ?? 77.5946,
      payload
    },
    kp.privateKey
  );

  return {
    buffer,
    base64: buffer.toString('base64'),
    messageId,
    keyPair: kp
  };
}

describe('Gateway Ingestion Service & Telemetry API', () => {
  beforeEach(() => {
    clearStores();
  });

  after(() => {
    wss.close();
    if (server.listening) {
      server.close();
    }
  });

  test('valid signed packet ingestion returning 200 OK and persists telemetry', async () => {
    const { base64, messageId } = createSignedTestPacket({
      priority: Priority.CIVILIAN_SOS,
      lat: 12.9716,
      lng: 77.5946
    });

    const res = await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [base64] })
      .expect(200);

    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.ingested, 1);
    assert.equal(res.body.duplicates, 0);

    // Verify telemetry retrieval
    const telemetryRes = await request(server)
      .get('/api/mesh/telemetry')
      .expect(200);

    const incidents = Array.isArray(telemetryRes.body)
      ? telemetryRes.body
      : telemetryRes.body.incidents;

    assert.equal(incidents.length, 1);
    const incident = incidents[0];
    assert.equal(incident.messageId, messageId);
    assert.equal(incident.priority, Priority.CIVILIAN_SOS);
    assert.equal(incident.hopCount, 1);
    assert.ok(incident.lat !== null && Math.abs(incident.lat - 12.9716) < 0.001);
    assert.ok(incident.lng !== null && Math.abs(incident.lng - 77.5946) < 0.001);
    assert.ok(incident.receivedAt > 0);
    assert.equal(typeof incident.payload, 'object');
    assert.equal(incident.payload.category, 'MEDICAL_EMERGENCY');
  });

  test('tampered/unsigned packet rejection returning 400 Bad Request', async () => {
    // 1. Unsigned packet (all-zero signature)
    const unsignedBuffer = encodeWirePacket({
      priority: Priority.CIVILIAN_SOS,
      messageId: '0102030405060708',
      timestampSeconds: Math.floor(Date.now() / 1000),
      ttlSeconds: 3600,
      payload: { alert: 'Unsigned SOS' }
    });

    await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [unsignedBuffer.toString('base64')] })
      .expect(400);

    // 2. Tampered payload content
    const valid = createSignedTestPacket({
      payloadData: { note: 'Safe and authentic payload' }
    });
    const tamperedPayloadBuf = Buffer.from(valid.buffer);
    const noteIdx = tamperedPayloadBuf.indexOf(Buffer.from('Safe'));
    assert.ok(noteIdx > 0);
    tamperedPayloadBuf[noteIdx] = 'X'.charCodeAt(0); // Tamper payload character

    await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [tamperedPayloadBuf.toString('base64')] })
      .expect(400);

    // 3. Tampered header field (modifying hop count or priority)
    const tamperedHeaderBuf = Buffer.from(valid.buffer);
    tamperedHeaderBuf[1] = Priority.EMERGENCY_AUTHORITY; // Alter priority byte

    await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [tamperedHeaderBuf.toString('base64')] })
      .expect(400);

    // 4. Tampered signature bytes
    const tamperedSigBuf = Buffer.from(valid.buffer);
    tamperedSigBuf[35] ^= 0xff; // Invert signature bit

    await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [tamperedSigBuf.toString('base64')] })
      .expect(400);

    // 5. Expired packet based on TTL
    const now = Math.floor(Date.now() / 1000);
    const expired = createSignedTestPacket({
      timestampSeconds: now - 5000,
      ttlSeconds: 3600
    });

    await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [expired.base64] })
      .expect(400);

    // 6. Corrupted/truncated packet
    const truncated = Buffer.alloc(40);
    await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [truncated.toString('base64')] })
      .expect(400);

    // 7. Malformed request format
    await request(server)
      .post('/api/mesh/sync')
      .send({ invalidField: true })
      .expect(400);
  });

  test('duplicate packet submission is idempotently handled without duplicate broadcasting', async () => {
    // Start HTTP and WebSocket listener on an ephemeral port if not already listening
    if (!server.listening) {
      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });
    }
    const port = (server.address() as AddressInfo).port;

    // Connect WebSocket client
    const wsClient = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      wsClient.on('open', () => resolve());
      wsClient.on('error', reject);
    });

    const receivedWsMessages: Array<{ event: string; data: { messageId: string } }> = [];
    wsClient.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        receivedWsMessages.push(parsed);
      } catch {
        // ignore parse error
      }
    });

    // Create a valid signed packet
    const { base64, messageId } = createSignedTestPacket({
      priority: Priority.CIVILIAN_SOS
    });

    // 1. Initial submission -> 200 OK, ingested: 1, duplicates: 0
    const res1 = await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [base64] })
      .expect(200);

    assert.equal(res1.body.status, 'ok');
    assert.equal(res1.body.ingested, 1);
    assert.equal(res1.body.duplicates, 0);

    // Wait for WebSocket event delivery
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(receivedWsMessages.length, 1);
    assert.equal(receivedWsMessages[0].event, 'EVENT_NEW_INCIDENT');
    assert.equal(receivedWsMessages[0].data.messageId, messageId);

    // 2. Duplicate submission with identical messageId -> 200 OK, ingested: 0, duplicates: 1
    const res2 = await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [base64] })
      .expect(200);

    assert.equal(res2.body.status, 'ok');
    assert.equal(res2.body.ingested, 0);
    assert.equal(res2.body.duplicates, 1);

    // Ensure NO additional WebSocket broadcast was emitted
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(
      receivedWsMessages.length,
      1,
      'Duplicate packet ingestion must not broadcast duplicate EVENT_NEW_INCIDENT'
    );

    // Telemetry store still contains exactly 1 instance of the incident
    const telemetryRes = await request(server).get('/api/mesh/telemetry').expect(200);
    const incidents = Array.isArray(telemetryRes.body)
      ? telemetryRes.body
      : telemetryRes.body.incidents;
    assert.equal(incidents.length, 1);

    // Clean up WebSocket client
    wsClient.close();
  });

  test('telemetry endpoint returns emergency incidents sorted by priority (P0 -> P3) and timestamp', async () => {
    const now = Math.floor(Date.now() / 1000);

    // Ingest packets in mixed order: P3, P1, P0, P2
    const p3Packet = createSignedTestPacket({
      priority: Priority.GENERAL_INFO, // P3
      messageId: '3333333333333333',
      timestampSeconds: now - 100,
      payloadData: { text: 'P3 bulletin: Road clearance info' }
    });

    const p1Packet = createSignedTestPacket({
      priority: Priority.CIVILIAN_SOS, // P1
      messageId: '1111111111111111',
      timestampSeconds: now - 50,
      payloadData: { text: 'P1 SOS: Medical emergency' }
    });

    const p0Packet = createSignedTestPacket({
      priority: Priority.EMERGENCY_AUTHORITY, // P0
      messageId: '0000000000000000',
      timestampSeconds: now - 200,
      payloadData: { text: 'P0 ALERT: Tsunami evacuation order' }
    });

    const p2Packet = createSignedTestPacket({
      priority: Priority.RESOURCE_LOGISTICS, // P2
      messageId: '2222222222222222',
      timestampSeconds: now - 30,
      payloadData: { text: 'P2 REQ: 10 units O+ blood' }
    });

    await request(server)
      .post('/api/mesh/sync')
      .send({ packets: [p3Packet.base64, p1Packet.base64, p0Packet.base64, p2Packet.base64] })
      .expect(200);

    const res = await request(server).get('/api/mesh/telemetry').expect(200);
    const list = Array.isArray(res.body) ? res.body : res.body.incidents;

    assert.equal(list.length, 4);
    assert.equal(list[0].priority, Priority.EMERGENCY_AUTHORITY, 'First incident must be P0');
    assert.equal(list[1].priority, Priority.CIVILIAN_SOS, 'Second incident must be P1');
    assert.equal(list[2].priority, Priority.RESOURCE_LOGISTICS, 'Third incident must be P2');
    assert.equal(list[3].priority, Priority.GENERAL_INFO, 'Fourth incident must be P3');
  });
});
