import React from 'react';
import { Shield } from 'lucide-react';

export const ProtocolDocs: React.FC = () => {
  return (
    <article className="max-w-4xl mx-auto py-12 px-6 text-zinc-300 overflow-y-auto w-full">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Protocol Specification</h1>
      <p className="text-sm text-zinc-400 mt-1 mb-12 max-w-2xl">
        MeshAid operates on a strictly deterministic, non-AI delay-tolerant networking (DTN) architecture.
        Field nodes ingest cryptographically signed telemetry over Bluetooth Low Energy, cache it locally in a
        priority-evicted SQLite database, and physically carry the data until they bridge an edge uplink or
        encounter another peer.
      </p>

      {/* 96-Byte Wire Header */}
      <h2 className="text-xl font-medium text-zinc-50 mt-12 mb-4 border-b border-zinc-800 pb-2">
        96-Byte Wire Header Map
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse mt-4">
          <thead className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="py-3 font-medium pr-4">Offset</th>
              <th className="py-3 font-medium pr-4">Size</th>
              <th className="py-3 font-medium pr-4">Field</th>
              <th className="py-3 font-medium pr-4">Type</th>
              <th className="py-3 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['00..01', '2B', 'Magic Bytes', '0x4D 0x41', "ASCII 'MA' framing identifier"],
              ['02', '1B', 'Version', 'UInt8', 'Fixed to 0x01'],
              ['03', '1B', 'Priority Tier', 'UInt8', '0 = P0, 1 = P1, 2 = P2, 3 = P3'],
              ['04..05', '2B', 'Hop Count', 'UInt16 BE', 'Increments each hop. Dropped if ≥ 7'],
              ['06..13', '8B', 'Message ID', 'Truncated Hash', 'SHA-256 (PubKey + Timestamp + Payload)'],
              ['14..17', '4B', 'Timestamp', 'UInt32 BE', 'Epoch seconds of creation'],
              ['18..21', '4B', 'TTL', 'UInt32 BE', 'Duration in seconds until expiration'],
              ['22..25', '4B', 'Latitude', 'Float32 BE', 'WGS84 Latitude IEEE 754'],
              ['26..29', '4B', 'Longitude', 'Float32 BE', 'WGS84 Longitude IEEE 754'],
              ['30..31', '2B', 'Payload Length', 'UInt16 BE', 'Byte length (N) of variable JSON'],
              ['32..95', '64B', 'Ed25519 Signature', '64 Bytes', 'Cryptographic binding over [00..31] + payload'],
              ['96..End', 'NB', 'JSON Payload', 'UTF-8', '{"situation":"...","headcount":4}'],
            ].map(([offset, size, field, type, desc], i) => (
              <tr key={i} className="group">
                <td className="py-3 border-b border-zinc-800/50 font-mono text-zinc-400 pr-4">{offset}</td>
                <td className="py-3 border-b border-zinc-800/50 font-mono text-zinc-500 pr-4">{size}</td>
                <td className="py-3 border-b border-zinc-800/50 font-mono text-zinc-50 pr-4 flex items-center gap-1.5">
                  {field === 'Ed25519 Signature' && <Shield size={13} className="text-zinc-500" />}
                  {field}
                </td>
                <td className="py-3 border-b border-zinc-800/50 font-mono text-zinc-500 pr-4">{type}</td>
                <td className="py-3 border-b border-zinc-800/50 text-zinc-400">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Priority Triage Matrix */}
      <h2 className="text-xl font-medium text-zinc-50 mt-12 mb-4 border-b border-zinc-800 pb-2">
        Priority Triage Matrix
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-purple-400">P0 — Authority</span>
            <span className="text-xs text-zinc-500 font-mono">TTL 72h · 12 hops</span>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Evacuation orders and official alerts. Never evicted from local buffer. Highest transmission priority across all relay nodes.
          </p>
        </div>

        <div className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-red-400">P1 — Civilian SOS</span>
            <span className="text-xs text-zinc-500 font-mono">TTL 48h · 7 hops</span>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Critical distress signals. Maintained during memory pressure until TTL expires. Second-highest eviction protection.
          </p>
        </div>

        <div className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-amber-400">P2 — Logistics</span>
            <span className="text-xs text-zinc-500 font-mono">TTL 24h · 4 hops</span>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Supply and resource requests. Evicted first under heavy storage load exceeding 10,000 local records.
          </p>
        </div>

        <div className="p-5 rounded-lg border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-emerald-400">P3 — General Info</span>
            <span className="text-xs text-zinc-500 font-mono">TTL 12h · 2 hops</span>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Welfare checks and road reports. Aggressively purged to preserve bandwidth and storage for P0/P1 traffic.
          </p>
        </div>
      </div>

      {/* Real-World Limitations */}
      <h2 className="text-xl font-medium text-zinc-50 mt-12 mb-4 border-b border-zinc-800 pb-2">
        Real-World Limitations
      </h2>
      <div className="space-y-6 mt-6">
        <div>
          <h3 className="text-zinc-50 font-medium text-base mb-1">RF Attenuation — 10–40m effective range</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            2.4 GHz BLE signals attenuate severely through rubble, soil, and reinforced concrete.
            Real-world physical bridging relies on the mobility of human data mules, not long-distance
            line-of-sight RF transmission.
          </p>
        </div>
        <div>
          <h3 className="text-zinc-50 font-medium text-base mb-1">Primary channel congestion (Ch 37–39)</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Legacy BLE advertising channels lack CSMA/CA backoff. High node density (&gt;50 nodes) causes
            catastrophic broadcast collision. MeshAid relies on randomized jitter and Extended Advertising
            fallback on secondary channels.
          </p>
        </div>
        <div>
          <h3 className="text-zinc-50 font-medium text-base mb-1">OEM background task killers</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            MIUI, OneUI, and EMUI aggressively terminate BLE scanning when the screen is locked, despite
            Foreground Services and WakeLocks. Users must manually disable battery optimization through
            vendor-specific settings.
          </p>
        </div>
      </div>
    </article>
  );
};
