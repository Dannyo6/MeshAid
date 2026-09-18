/**
 * MeshAid Gateway Synchronization Server
 * Ingests bundles uploaded by nodes that regain cellular / Wi-Fi internet
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// Central in-memory repository for ingested disaster incidents
const centralIncidents: Map<string, Record<string, unknown>> = new Map();

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

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

  // Retrieve active incidents for Responder Dashboard
  if (req.method === 'GET' && url.pathname === '/api/v1/incidents') {
    const list = Array.from(centralIncidents.values());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ count: list.length, incidents: list }));
    return;
  }

  // Ingestion endpoint for gateway mobile nodes syncing bundles
  if (req.method === 'POST' && url.pathname === '/api/v1/sync/ingest') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
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
        res.end(JSON.stringify({ status: 'success', ingestedCount: ingested, totalIncidents: centralIncidents.size }));
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

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[MeshAid Gateway] Listening on http://localhost:${PORT}`);
  });
}

export { server, centralIncidents };
