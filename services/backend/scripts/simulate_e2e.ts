/**
 * MeshAid End-to-End Simulation Runner
 *
 * Simulates an emergency mobile node syncing an offline SOS wire frame to the
 * MeshAid gateway over HTTP /api/mesh/sync, and verifies real-time telemetry
 * broadcast over WebSocket (ws://localhost:3000).
 *
 * Wire specification:
 * - Ed25519 cryptographic keypair via @noble/curves/ed25519
 * - Valid 96-byte wire header framing via @meshaid/protocol/codec.ts
 * - Priority: P1 SOS (0x01)
 * - Message ID: Truncated SHA-256 (16-char hex / 8 bytes)
 * - Location: Lat 12.9716, Lng 77.5946 (Bengaluru Incident Hub)
 * - Payload: { headcount: 4, type: 'STRUCTURAL_COLLAPSE', notes: 'Trapped in basement sector B' }
 */

import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { ed25519 } from '@noble/curves/ed25519';
import {
  encodeWirePacket,
  getSignableBytes,
  decodeWirePacket,
  Priority,
  FIXED_HEADER_SIZE
} from '@meshaid/protocol/codec.ts';

const TARGET_PORT = process.env.GATEWAY_PORT || '3000';
const HTTP_BASE_URL = `http://localhost:${TARGET_PORT}`;
const WS_BASE_URL = `ws://localhost:${TARGET_PORT}`;

async function runSimulation(): Promise<void> {
  console.log('================================================================');
  console.log(' MeshAid Gateway End-to-End Simulation Runner (simulate_e2e.ts)');
  console.log('================================================================');

  let isServerManaged = false;
  let serverInstance: any = null;
  let wssInstance: any = null;
  let wsClient: WebSocket | null = null;

  try {
    // -------------------------------------------------------------------------
    // Step 0: Gateway Server Discovery / In-Process Spinup
    // -------------------------------------------------------------------------
    try {
      const healthRes = await fetch(`${HTTP_BASE_URL}/health`, {
        signal: AbortSignal.timeout(1500)
      });
      if (healthRes.ok) {
        console.log(`[E2E] Found active gateway service at ${HTTP_BASE_URL}`);
      } else {
        throw new Error(`Health check returned status ${healthRes.status}`);
      }
    } catch {
      console.log(`[E2E] No active gateway detected on ${HTTP_BASE_URL}. Launching in-process gateway server...`);
      process.env.PORT = TARGET_PORT;
      const serverModule = await import('../src/server.ts');
      serverInstance = serverModule.server;
      wssInstance = serverModule.wss;
      isServerManaged = true;

      if (!serverInstance.listening) {
        await new Promise<void>((resolve, reject) => {
          serverInstance.listen(parseInt(TARGET_PORT, 10), () => resolve());
          serverInstance.once('error', reject);
        });
      }
      console.log(`[E2E] In-process gateway server listening on ${HTTP_BASE_URL} and ${WS_BASE_URL}`);
    }

    // -------------------------------------------------------------------------
    // Step 1: Generate Authentic Ed25519 Keypair using @noble/curves/ed25519
    // -------------------------------------------------------------------------
    console.log('\n[1/5] Generating authentic Ed25519 keypair via @noble/curves/ed25519...');
    const privateKey = ed25519.utils.randomPrivateKey(); // Uint8Array(32)
    const publicKey = ed25519.getPublicKey(privateKey); // Uint8Array(32)
    const publicKeyHex = Buffer.from(publicKey).toString('hex');

    assert.equal(privateKey.length, 32, 'Private key must be 32 bytes');
    assert.equal(publicKey.length, 32, 'Public key must be 32 bytes');
    console.log(`      Ed25519 Public Key: ${publicKeyHex}`);

    // -------------------------------------------------------------------------
    // Step 2: Encode Valid 96-Byte Wire Frame using @meshaid/protocol/codec.ts
    // -------------------------------------------------------------------------
    console.log('\n[2/5] Constructing emergency wire frame (Priority: P1 SOS, Lat: 12.9716, Lng: 77.5946)...');

    // Message ID: Truncated SHA-256 (16-char hex / 8 bytes)
    const entropySeed = `meshaid-bengaluru-sos-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const messageId = crypto.createHash('sha256').update(entropySeed).digest('hex').slice(0, 16);

    const timestampSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = 3600; // 1 hour TTL
    const latitude = 12.9716; // Bengaluru Incident Hub
    const longitude = 77.5946;

    // Payload: JSON with headcount, type, notes, and node publicKey
    const payloadObj = {
      headcount: 4,
      type: 'STRUCTURAL_COLLAPSE',
      notes: 'Trapped in basement sector B',
      publicKey: publicKeyHex
    };

    const packetOpts = {
      priority: Priority.CIVILIAN_SOS, // 0x01
      hopCount: 1,
      messageId,
      timestampSeconds,
      ttlSeconds,
      latitude,
      longitude,
      payload: payloadObj
    };

    // Calculate canonical signable bytes and sign using @noble/curves/ed25519
    const signableBytes = getSignableBytes(packetOpts);
    const signature = ed25519.sign(signableBytes, privateKey);
    assert.equal(signature.length, 64, 'Ed25519 signature must be exactly 64 bytes');

    // Encode into binary wire format (96-byte header + JSON payload)
    const wireFrameBuffer = encodeWirePacket({
      ...packetOpts,
      signature: Buffer.from(signature)
    });

    const payloadUtf8Bytes = Buffer.from(JSON.stringify(payloadObj), 'utf8');
    assert.equal(FIXED_HEADER_SIZE, 96, 'Fixed header size must be 96 bytes');
    assert.equal(
      wireFrameBuffer.length,
      FIXED_HEADER_SIZE + payloadUtf8Bytes.length,
      'Total wire frame must be 96-byte header + payload length'
    );
    assert.equal(wireFrameBuffer[0], 0x4d, "Magic byte 0 must be 0x4d ('M')");
    assert.equal(wireFrameBuffer[1], 0x41, "Magic byte 1 must be 0x41 ('A')");
    assert.equal(wireFrameBuffer[3], Priority.CIVILIAN_SOS, 'Priority byte must be 0x01 (P1 SOS)');

    // Verify cryptographic decoding locally before transmission
    const preflightDecoded = decodeWirePacket(wireFrameBuffer);
    assert.equal(preflightDecoded.messageId, messageId);
    assert.equal(preflightDecoded.priority, Priority.CIVILIAN_SOS);
    console.log(`      Message ID (truncated SHA-256): ${messageId}`);
    console.log(`      Wire Frame Length: ${wireFrameBuffer.length} bytes (96B Header + ${payloadUtf8Bytes.length}B Payload)`);

    // Base64-encode raw wire frame
    const base64Packet = wireFrameBuffer.toString('base64');
    console.log(`      Base64 Wire Packet: ${base64Packet.slice(0, 48)}...`);

    // -------------------------------------------------------------------------
    // Step 3: Connect WebSocket Client to ws://localhost:3000
    // -------------------------------------------------------------------------
    console.log(`\n[3/5] Connecting WebSocket client to ${WS_BASE_URL} ...`);
    wsClient = new WebSocket(WS_BASE_URL);

    await new Promise<void>((resolve, reject) => {
      const openTimeout = setTimeout(() => reject(new Error('WebSocket connection timed out')), 5000);
      wsClient!.once('open', () => {
        clearTimeout(openTimeout);
        console.log(`      Connected to WebSocket live feed on ${WS_BASE_URL}`);
        resolve();
      });
      wsClient!.once('error', (err) => {
        clearTimeout(openTimeout);
        reject(err);
      });
    });

    // Arm event listener for EVENT_NEW_INCIDENT
    const incidentReceivedPromise = new Promise<{ event: string; incident: any }>((resolve, reject) => {
      const msgTimeout = setTimeout(() => {
        reject(new Error(`Timeout (8000ms) waiting for EVENT_NEW_INCIDENT with messageId ${messageId}`));
      }, 8000);

      wsClient!.on('message', (rawData) => {
        try {
          const parsed = JSON.parse(rawData.toString());
          const incident = parsed.data || parsed.incident;
          if (
            (parsed.event === 'EVENT_NEW_INCIDENT' || parsed.type === 'EVENT_NEW_INCIDENT') &&
            incident?.messageId === messageId
          ) {
            clearTimeout(msgTimeout);
            resolve({ event: parsed.event || parsed.type, incident });
          }
        } catch {
          // Ignore parse errors from non-incident messages
        }
      });
    });

    // -------------------------------------------------------------------------
    // Step 4: Send HTTP POST to http://localhost:3000/api/mesh/sync
    // -------------------------------------------------------------------------
    console.log(`\n[4/5] Sending HTTP POST to ${HTTP_BASE_URL}/api/mesh/sync ...`);
    const syncResponse = await fetch(`${HTTP_BASE_URL}/api/mesh/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        packets: [base64Packet]
      })
    });

    assert.equal(
      syncResponse.status,
      200,
      `Expected HTTP 200 from /api/mesh/sync, received ${syncResponse.status}`
    );

    const syncBody = (await syncResponse.json()) as {
      status: string;
      ingested: number;
      duplicates: number;
      totalIncidents: number;
    };
    console.log('      Sync Response:', syncBody);
    assert.equal(syncBody.status, 'ok', 'Response status must be "ok"');
    assert.ok(syncBody.ingested >= 1, 'Ingestion count must be at least 1');

    // -------------------------------------------------------------------------
    // Step 5: Verify EVENT_NEW_INCIDENT Broadcast & Matching Telemetry
    // -------------------------------------------------------------------------
    console.log('\n[5/5] Awaiting EVENT_NEW_INCIDENT WebSocket broadcast...');
    const { event, incident } = await incidentReceivedPromise;
    console.log(`      Received Event: ${event}`);
    console.log('      Received Incident Telemetry:', incident);

    // Verify all telemetry fields
    assert.equal(event, 'EVENT_NEW_INCIDENT', 'Event name must be EVENT_NEW_INCIDENT');
    assert.equal(incident.messageId, messageId, 'Telemetry messageId must match generated packet');
    assert.equal(incident.priority, Priority.CIVILIAN_SOS, 'Telemetry priority must be P1 SOS (0x01)');
    assert.equal(incident.hopCount, 1, 'Hop count must match');
    assert.ok(
      incident.lat !== null && Math.abs(incident.lat - 12.9716) < 0.001,
      `Latitude must match 12.9716 (got ${incident.lat})`
    );
    assert.ok(
      incident.lng !== null && Math.abs(incident.lng - 77.5946) < 0.001,
      `Longitude must match 77.5946 (got ${incident.lng})`
    );

    // Verify incident payload
    const payload = typeof incident.payload === 'string' ? JSON.parse(incident.payload) : incident.payload;
    assert.equal(payload.headcount, 4, 'Payload headcount must be 4');
    assert.equal(payload.type, 'STRUCTURAL_COLLAPSE', 'Payload type must be STRUCTURAL_COLLAPSE');
    assert.equal(payload.notes, 'Trapped in basement sector B', 'Payload notes must match');
    assert.equal(payload.publicKey, publicKeyHex, 'Payload public key must match generated key');

    // Verify persistence in GET /api/mesh/telemetry
    const telemetryRes = await fetch(`${HTTP_BASE_URL}/api/mesh/telemetry`);
    assert.equal(telemetryRes.status, 200, 'GET /api/mesh/telemetry must return 200');
    const telemetryData = (await telemetryRes.json()) as any;
    const list = Array.isArray(telemetryData) ? telemetryData : telemetryData.incidents;
    const stored = list.find((rec: any) => rec.messageId === messageId);
    assert.ok(stored, 'Stored telemetry record must exist in telemetry repository');

    console.log('\n================================================================');
    console.log(' [OK] End-to-end simulation runner finished successfully!');
    console.log(`      - Ed25519 keypair validated`);
    console.log(`      - 96-byte wire frame encoded & signed`);
    console.log(`      - HTTP POST /api/mesh/sync verified (200 OK)`);
    console.log(`      - WebSocket EVENT_NEW_INCIDENT verified with matching telemetry`);
    console.log('================================================================\n');
  } finally {
    // Graceful teardown
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        wsClient!.once('close', () => resolve());
        wsClient!.close();
      });
    }

    if (isServerManaged) {
      if (wssInstance) {
        for (const client of wssInstance.clients) {
          client.terminate();
        }
        await new Promise<void>((resolve) => {
          wssInstance.close(() => resolve());
        });
      }
      if (serverInstance && serverInstance.listening) {
        serverInstance.closeAllConnections?.();
        await new Promise<void>((resolve) => {
          serverInstance.close(() => resolve());
        });
      }
    }
  }
}

runSimulation()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    console.error('\n[FAIL] Simulation runner encountered an error:', err);
    process.exit(1);
  });
