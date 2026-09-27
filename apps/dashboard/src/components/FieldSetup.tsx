import React from 'react';
import { Download, Smartphone, ShieldAlert, Zap, Network } from 'lucide-react';

export const FieldSetup: React.FC = () => {
  return (
    <div className="flex flex-col gap-8 text-slate-300 font-sans p-6 overflow-y-auto max-w-7xl mx-auto w-full">
      <div className="flex flex-col gap-2 border-b border-slate-800 pb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Smartphone size={24} className="text-cyan-400" />
          FIELD APK & SETUP RUNBOOK
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed max-w-3xl">
          Instructions for provisioning offline Android edge devices. The MeshAid mobile agent requires 
          extensive, non-standard runtime permissions to operate continuously in a completely disconnected 
          physical environment using BLE background scanning.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <a 
          href="/downloads/app-debug.apk" 
          download 
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-6 rounded transition-colors font-mono"
        >
          <Download size={18} />
          DOWNLOAD APP-DEBUG.APK
        </a>
        <span className="text-slate-500 text-sm font-mono">v1.0.0-rc1 | 4.2 MB | SHA-256 verified</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        {/* Step 1 */}
        <div className="bg-[#0f141e] border border-slate-800 p-5 rounded relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-slate-700 group-hover:bg-cyan-500 transition-colors"></div>
          <h3 className="text-white font-bold mb-3 flex items-center gap-2">
            <span className="bg-slate-800 text-cyan-400 font-mono text-xs px-2 py-1 rounded">STEP 1</span>
            ADB Sideload Deployment
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Enable Developer Options and USB Debugging on the target Android device. Sideload the package via command line:
          </p>
          <div className="bg-black/50 p-3 rounded border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto">
            adb install -r app-debug.apk
          </div>
        </div>

        {/* Step 2 */}
        <div className="bg-[#0f141e] border border-slate-800 p-5 rounded relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-slate-700 group-hover:bg-red-500 transition-colors"></div>
          <h3 className="text-white font-bold mb-3 flex items-center gap-2">
            <span className="bg-slate-800 text-red-400 font-mono text-xs px-2 py-1 rounded">STEP 2</span>
            Grant Runtime Privileges
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Grant hazardous permissions directly via ADB to avoid user prompt fatigue and guarantee background operation.
          </p>
          <div className="bg-black/50 p-3 rounded border border-slate-800 font-mono text-xs text-slate-300 flex flex-col gap-1 overflow-x-auto">
            <span>adb shell pm grant dev.meshaid.app android.permission.BLUETOOTH_SCAN</span>
            <span>adb shell pm grant dev.meshaid.app android.permission.BLUETOOTH_ADVERTISE</span>
            <span>adb shell pm grant dev.meshaid.app android.permission.ACCESS_FINE_LOCATION</span>
            <span>adb shell pm grant dev.meshaid.app android.permission.POST_NOTIFICATIONS</span>
          </div>
        </div>

        {/* Step 3 */}
        <div className="bg-[#0f141e] border border-slate-800 p-5 rounded relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-slate-700 group-hover:bg-amber-500 transition-colors"></div>
          <h3 className="text-white font-bold mb-3 flex items-center gap-2">
            <span className="bg-slate-800 text-amber-400 font-mono text-xs px-2 py-1 rounded">STEP 3</span>
            OEM Battery Exemption
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Bypass Android Doze mode and proprietary OEM task killers (MIUI, OneUI). Without this, BLE radio halts after 5 minutes of screen-off.
          </p>
          <div className="bg-black/50 p-3 rounded border border-slate-800 font-mono text-xs text-amber-300 overflow-x-auto">
            adb shell dumpsys deviceidle whitelist +dev.meshaid.app
          </div>
          <p className="text-xs text-slate-500 mt-3 flex items-center gap-1">
            <ShieldAlert size={12} /> Samsung/Xiaomi: Manual toggle required in Settings &gt; Battery &gt; Unrestricted.
          </p>
        </div>

        {/* Step 4 */}
        <div className="bg-[#0f141e] border border-slate-800 p-5 rounded relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-slate-700 group-hover:bg-purple-500 transition-colors"></div>
          <h3 className="text-white font-bold mb-3 flex items-center gap-2">
            <span className="bg-slate-800 text-purple-400 font-mono text-xs px-2 py-1 rounded">STEP 4</span>
            3-Node Physical Testbed Verification
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            Verify protocol fidelity using 3 isolated handsets.
          </p>
          <ul className="text-xs text-slate-400 space-y-2 font-mono">
            <li className="flex items-center gap-2"><Network size={12} className="text-slate-500"/> <b>NODE A (Victim):</b> Disable Wi-Fi/LTE. Trigger P1 SOS.</li>
            <li className="flex items-center gap-2"><Network size={12} className="text-slate-500"/> <b>NODE B (Relay):</b> Walk into Node A's range. Receive telemetry in background. Walk to Node C.</li>
            <li className="flex items-center gap-2"><Zap size={12} className="text-emerald-400"/> <b>NODE C (Sink):</b> Must have internet. Will ingest from Node B and sync to this dashboard.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
