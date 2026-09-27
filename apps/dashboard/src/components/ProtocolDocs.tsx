import React from 'react';
import { Database, Shield, Radio, Activity } from 'lucide-react';

export const ProtocolDocs: React.FC = () => {
  return (
    <div className="flex flex-col gap-8 text-slate-300 font-sans p-6 overflow-y-auto max-w-7xl mx-auto w-full">
      <div className="flex flex-col gap-2 border-b border-slate-800 pb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Database size={24} className="text-cyan-400" />
          PROTOCOL SPECIFICATION // DTN STORE-CARRY-FORWARD
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed max-w-3xl">
          MeshAid operates on a strictly deterministic, non-AI delay-tolerant networking (DTN) architecture.
          Field nodes ingest cryptographically signed telemetry over Bluetooth Low Energy, cache it locally in a
          priority-evicted SQLite database, and physically carry the data until they bridge an edge uplink or
          encounter another peer.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-slate-200 border-l-4 border-cyan-500 pl-3">96-BYTE WIRE HEADER MAP</h2>
        <div className="bg-[#0f141e] border border-slate-800 rounded p-1 overflow-x-auto">
          <table className="w-full text-left text-sm font-mono whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="p-3 font-normal">OFFSET</th>
                <th className="p-3 font-normal">SIZE</th>
                <th className="p-3 font-normal">FIELD NAME</th>
                <th className="p-3 font-normal">TYPE</th>
                <th className="p-3 font-normal w-1/2">DESCRIPTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">00..01</td><td className="p-3">2B</td>
                <td className="p-3 text-white">MAGIC BYTES</td><td className="p-3 text-emerald-400">0x4D 0x41</td>
                <td className="p-3 text-slate-400">ASCII 'MA' framing identifier</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">02</td><td className="p-3">1B</td>
                <td className="p-3 text-white">VERSION</td><td className="p-3 text-emerald-400">UInt8</td>
                <td className="p-3 text-slate-400">Fixed to 0x01</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">03</td><td className="p-3">1B</td>
                <td className="p-3 text-white">PRIORITY TIER</td><td className="p-3 text-emerald-400">UInt8</td>
                <td className="p-3 text-slate-400">0=P0, 1=P1, 2=P2, 3=P3</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">04..05</td><td className="p-3">2B</td>
                <td className="p-3 text-white">HOP COUNT</td><td className="p-3 text-emerald-400">UInt16 BE</td>
                <td className="p-3 text-slate-400">Increments each hop. Dropped if &ge; 7</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">06..13</td><td className="p-3">8B</td>
                <td className="p-3 text-white">MESSAGE ID</td><td className="p-3 text-emerald-400">Truncated Hash</td>
                <td className="p-3 text-slate-400">SHA-256 (PubKey + Timestamp + Payload)</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">14..17</td><td className="p-3">4B</td>
                <td className="p-3 text-white">TIMESTAMP</td><td className="p-3 text-emerald-400">UInt32 BE</td>
                <td className="p-3 text-slate-400">Epoch seconds of creation</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">18..21</td><td className="p-3">4B</td>
                <td className="p-3 text-white">TTL</td><td className="p-3 text-emerald-400">UInt32 BE</td>
                <td className="p-3 text-slate-400">Duration in seconds until expiration</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">22..25</td><td className="p-3">4B</td>
                <td className="p-3 text-white">LATITUDE</td><td className="p-3 text-emerald-400">Float32 BE</td>
                <td className="p-3 text-slate-400">WGS84 Latitude IEEE 754</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">26..29</td><td className="p-3">4B</td>
                <td className="p-3 text-white">LONGITUDE</td><td className="p-3 text-emerald-400">Float32 BE</td>
                <td className="p-3 text-slate-400">WGS84 Longitude IEEE 754</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">30..31</td><td className="p-3">2B</td>
                <td className="p-3 text-white">PAYLOAD LEN</td><td className="p-3 text-emerald-400">UInt16 BE</td>
                <td className="p-3 text-slate-400">Byte length (N) of variable JSON</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">32..95</td><td className="p-3">64B</td>
                <td className="p-3 text-white flex items-center gap-2"><Shield size={14} className="text-red-400"/> ED25519 SIG</td><td className="p-3 text-emerald-400">Bytes</td>
                <td className="p-3 text-slate-400">Cryptographic binding over [00..31] + payload</td>
              </tr>
              <tr className="hover:bg-slate-800/20">
                <td className="p-3 text-cyan-400">96..End</td><td className="p-3">NB</td>
                <td className="p-3 text-white">JSON PAYLOAD</td><td className="p-3 text-emerald-400">UTF-8</td>
                <td className="p-3 text-slate-400">`{`"situation":"...","headcount":4`}`</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-slate-200 border-l-4 border-amber-500 pl-3 flex items-center gap-2">
            <Activity size={18} /> PRIORITY TRIAGE MATRIX
          </h2>
          <div className="bg-[#0f141e] border border-slate-800 rounded p-4 text-sm font-mono flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-purple-400 font-bold">[P0] AUTHORITY</span>
              <span className="text-slate-500">TTL: 72H | HOPS: 12</span>
            </div>
            <div className="text-slate-400 pb-2">Evacuation orders. Never evicted from local buffer. Highest transmission priority.</div>
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-2 pt-2">
              <span className="text-red-400 font-bold">[P1] CIVILIAN SOS</span>
              <span className="text-slate-500">TTL: 48H | HOPS: 7</span>
            </div>
            <div className="text-slate-400 pb-2">Critical distress. Maintained during memory pressure until TTL expires.</div>

            <div className="flex justify-between items-center border-b border-slate-800 pb-2 pt-2">
              <span className="text-amber-400 font-bold">[P2] LOGISTICS</span>
              <span className="text-slate-500">TTL: 24H | HOPS: 4</span>
            </div>
            <div className="text-slate-400 pb-2">Supply requests. Evicted first under heavy load &gt; 10k local records.</div>

            <div className="flex justify-between items-center pb-2 pt-2">
              <span className="text-emerald-400 font-bold">[P3] GENERAL INFO</span>
              <span className="text-slate-500">TTL: 12H | HOPS: 2</span>
            </div>
            <div className="text-slate-400">Welfare checks. Aggressively purged to preserve bandwidth for P1/P0.</div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-slate-200 border-l-4 border-rose-500 pl-3 flex items-center gap-2">
            <Radio size={18} /> REAL-WORLD LIMITATIONS
          </h2>
          <div className="bg-[#0f141e] border border-slate-800 rounded p-4 text-sm flex flex-col gap-4">
            <div>
              <h3 className="font-bold text-slate-300 mb-1">RF Attenuation (10–40m Range)</h3>
              <p className="text-slate-500 leading-relaxed">
                2.4GHz BLE severely attenuates through rubble, soil, and concrete. Real-world physical bridging relies on mobility of human data mules, not long-distance line-of-sight RF transmission.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-slate-300 mb-1">Primary Channel Congestion</h3>
              <p className="text-slate-500 leading-relaxed">
                Channels 37–39 lack CSMA/CA backoff. High node density (&gt;50 nodes) causes catastrophic broadcast collision. MeshAid relies on jitter and Extended Advertising fallback on secondary channels.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-slate-300 mb-1">OEM Background Killers</h3>
              <p className="text-slate-500 leading-relaxed">
                MIUI, OneUI, and EMUI aggressively terminate BLE scanning when the screen is locked, despite Foreground Services and WakeLocks. Users MUST manually disable battery optimization per OEM idiosyncrasies.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
