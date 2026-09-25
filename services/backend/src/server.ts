/**
 * MeshAid Gateway Synchronization & Telemetry Server
 * Ingests bundles uploaded by nodes that regain cellular / Wi-Fi internet,
 * validates cryptographic signatures, deduplicates, and broadcasts live feeds over WebSocket.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  decodeWirePacket,
  PacketIntegrityError,
  ExpiredPacketError,
  Priority
} from '@meshaid/protocol';
import type { MeshAidWirePacket } from '@meshaid/protocol';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

export interface MeshTelemetryRecord {
  messageId: string;
  priority: number;
  hopCount: number;
  timestamp: number;
  lat: number | null;
  lng: number | null;
  payload: Record<string, unknown> | string;
  receivedAt: number;
}

// In-memory deduplication cache for message IDs
const seenMessageIds = new Set<string>();

// Central repository for ingested valid emergency incidents & telemetry
const telemetryStore = new Map<string, MeshTelemetryRecord>();
const centralIncidents = new Map<string, Record<string, unknown>>();

export function clearStores(): void {
  seenMessageIds.clear();
  telemetryStore.clear();
  centralIncidents.clear();
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);

  // CORS headers for responder dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'meshaid-gateway', timestamp: Date.now() }));
    return;
  }

  // Legacy incidents endpoint for Responder Dashboard
  if (req.method === 'GET' && url.pathname === '/api/v1/incidents') {
    const list = Array.from(centralIncidents.values());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: list.length, incidents: list }));
    return;
  }

  // GET /api/mesh/telemetry: Return all ingested valid emergency incidents sorted by priority (P0 -> P3) and timestamp
  if (req.method === 'GET' && url.pathname === '/api/mesh/telemetry') {
    const incidents = Array.from(telemetryStore.values()).sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // P0 -> P3
      }
      return b.timestamp - a.timestamp; // Most recent first for matching priority
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (url.searchParams.get('format') === 'envelope' || url.searchParams.get('envelope') === 'true') {
      res.end(JSON.stringify({ count: incidents.length, incidents }));
    } else {
      res.end(JSON.stringify(incidents));
    }
    return;
  }

  // POST /api/mesh/sync: Ingestion pipeline for base64 wire packets
  if (req.method === 'POST' && url.pathname === '/api/mesh/sync') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        if (!body || !body.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing request body: expected { packets: string[] }' }));
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Malformed JSON payload', details: String(err) }));
          return;
        }

        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !('packets' in parsed) ||
          !Array.isArray((parsed as { packets: unknown }).packets)
        ) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ error: 'Invalid payload: "packets" must be an array of base64 wire strings' })
          );
          return;
        }

        const packetsArray = (parsed as { packets: unknown[] }).packets;
        const decodedPackets: MeshAidWirePacket[] = [];

        // Phase 1: Verify each wire packet before mutating storage
        for (let i = 0; i < packetsArray.length; i++) {
          const packetStr = packetsArray[i];
          if (typeof packetStr !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Packet at index ${i} is not a string` }));
            return;
          }

          let packetBuffer: Buffer;
          try {
            packetBuffer = Buffer.from(packetStr, 'base64');
            if (packetBuffer.length === 0 && packetStr.length > 0) {
              throw new Error('Decoded base64 buffer is empty');
            }
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Packet at index ${i} is invalid base64`, details: String(err) }));
            return;
          }

          try {
            const wirePacket = decodeWirePacket(packetBuffer, {
              requireSignature: true
            });
            decodedPackets.push(wirePacket);
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                error: 'Corrupted, expired, or tampered packet rejected',
                details: (err as Error).message,
                index: i
              })
            );
            return;
          }
        }

        // Phase 2: Deduplicate and store valid telemetry
        let ingested = 0;
        let duplicates = 0;
        const receivedAt = Date.now();

        for (const wirePacket of decodedPackets) {
          if (seenMessageIds.has(wirePacket.messageId)) {
            duplicates++;
            continue;
          }

          seenMessageIds.add(wirePacket.messageId);

          const telemetry: MeshTelemetryRecord = {
            messageId: wirePacket.messageId,
            priority: wirePacket.priority,
            hopCount: wirePacket.hopCount,
            timestamp: wirePacket.timestampSeconds,
            lat: wirePacket.latitude,
            lng: wirePacket.longitude,
            payload: wirePacket.payloadJson ?? wirePacket.payload.toString('utf8'),
            receivedAt
          };

          telemetryStore.set(wirePacket.messageId, telemetry);
          centralIncidents.set(wirePacket.messageId, {
            ...telemetry,
            id: wirePacket.messageId,
            ingestedAt: receivedAt
          });

          // Broadcast to connected WebSocket clients
          broadcastIncident(telemetry);
          ingested++;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            ingested,
            duplicates,
            totalIncidents: telemetryStore.size
          })
        );
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ingestion pipeline error', details: String(err) }));
      }
    });
    return;
  }

  // Legacy JSON ingestion endpoint for gateway mobile nodes syncing raw bundles
  if (req.method === 'POST' && url.pathname === '/api/v1/sync/ingest') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const bundles = Array.isArray(payload) ? payload : [payload];
        let ingested = 0;

        for (const bundle of bundles) {
          if (bundle.id && !centralIncidents.has(bundle.id)) {
            centralIncidents.set(bundle.id, {
              ...bundle,
              ingestedAt: Date.now()
            });
            ingested++;
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            ingestedCount: ingested,
            totalIncidents: centralIncidents.size
          })
        );
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload', details: String(err) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// Attach WebSocket live feed server to the HTTP listener
const wss = new WebSocketServer({ server });

export function broadcastIncident(incident: MeshTelemetryRecord): void {
  const message = JSON.stringify({
    event: 'EVENT_NEW_INCIDENT',
    type: 'EVENT_NEW_INCIDENT',
    data: incident,
    incident
  });

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (ws: WebSocket) => {
  // Connected client live feed established
});

const isTesting =
  process.env.NODE_ENV === 'test' ||
  process.argv.includes('--test') ||
  Boolean(process.env.NODE_TEST_CONTEXT);

if (!isTesting) {
  server.listen(PORT, () => {
    console.log(`[MeshAid Gateway] Listening on http://localhost:${PORT}`);
  });
}

export {
  server,
  wss,
  telemetryStore,
  seenMessageIds,
  centralIncidents
};
