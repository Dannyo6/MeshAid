import React from 'react';
import { Download, ShieldAlert } from 'lucide-react';

export const RunbookView: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto my-6 p-8 bg-[#0d1527]/80 border border-slate-800 rounded-xl shadow-lg shadow-black/40 overflow-y-auto">
      <h1 className="text-2xl font-bold text-slate-100">Android Field Deployment Runbook</h1>
      <p className="text-sm text-slate-400 mt-1 max-w-2xl mb-8">
        Instructions for provisioning offline Android edge devices. The MeshAid mobile agent requires
        extensive, non-standard runtime permissions to operate continuously in a disconnected
        physical environment using BLE background scanning.
      </p>

      <div className="flex flex-col gap-2 mb-10">
        <a
          href="/downloads/app-debug.apk"
          download
          className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-all bg-blue-600 hover:bg-blue-500 text-white h-10 px-4 py-2 w-fit gap-2 shadow-sm shadow-blue-900/20 border border-blue-500/50"
        >
          <Download size={16} />
          Download app-debug.apk
        </a>
        <p className="text-xs text-slate-500 font-mono mt-2">v1.0.0-rc1 · 4.2 MB · SHA-256 verified</p>
      </div>

      {/* Step 1 */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold">1</span>
          <h3 className="text-slate-100 font-medium text-lg">ADB Sideload Deployment</h3>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed mb-3 ml-9">
          Enable Developer Options and USB Debugging on the target Android device. Connect via USB and sideload the APK:
        </p>
        <pre className="bg-[#0a101f] border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto mt-3 ml-9 shadow-inner">
          <code>adb install -r app-debug.apk</code>
        </pre>
      </div>

      {/* Step 2 */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold">2</span>
          <h3 className="text-slate-100 font-medium text-lg">Grant Runtime Permissions</h3>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed mb-3 ml-9">
          Grant hazardous permissions directly via ADB to avoid user prompt fatigue and guarantee background operation.
        </p>
        <pre className="bg-[#0a101f] border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto mt-3 ml-9 shadow-inner">
          <code>{`adb shell pm grant dev.meshaid.app android.permission.BLUETOOTH_SCAN
adb shell pm grant dev.meshaid.app android.permission.BLUETOOTH_ADVERTISE
adb shell pm grant dev.meshaid.app android.permission.ACCESS_FINE_LOCATION
adb shell pm grant dev.meshaid.app android.permission.POST_NOTIFICATIONS`}</code>
        </pre>
      </div>

      {/* Step 3 */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold">3</span>
          <h3 className="text-slate-100 font-medium text-lg">OEM Battery Exemption</h3>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed mb-3 ml-9">
          Bypass Android Doze mode and proprietary OEM task killers. Without this, BLE radio halts after
          approximately 5 minutes of screen-off.
        </p>
        <pre className="bg-[#0a101f] border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-x-auto mt-3 ml-9 shadow-inner">
          <code>adb shell dumpsys deviceidle whitelist +dev.meshaid.app</code>
        </pre>
        <p className="text-xs text-amber-500/80 ml-9 mt-3 flex items-center gap-1.5 font-medium">
          <ShieldAlert size={12} />
          Samsung OneUI / Xiaomi MIUI: Manual toggle required in Settings → Battery → Unrestricted.
        </p>
      </div>

      {/* Step 4 */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-semibold">4</span>
          <h3 className="text-slate-100 font-medium text-lg">3-Node Physical Testbed</h3>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed mb-4 ml-9">
          Verify protocol fidelity using three physically isolated handsets:
        </p>
        <div className="space-y-3 ml-9">
          <div className="p-4 rounded-lg border border-slate-800 bg-[#0a101f] shadow-inner">
            <p className="text-sm"><span className="text-slate-200 font-medium">Node A — Victim:</span>{' '}
              <span className="text-slate-400">Disable Wi-Fi and LTE. Trigger a P1 SOS distress signal.</span></p>
          </div>
          <div className="p-4 rounded-lg border border-slate-800 bg-[#0a101f] shadow-inner">
            <p className="text-sm"><span className="text-slate-200 font-medium">Node B — Relay:</span>{' '}
              <span className="text-slate-400">Walk into Node A's BLE range. Receive telemetry in background. Walk toward Node C.</span></p>
          </div>
          <div className="p-4 rounded-lg border border-slate-800 bg-[#0a101f] shadow-inner">
            <p className="text-sm"><span className="text-slate-200 font-medium">Node C — Sink:</span>{' '}
              <span className="text-slate-400">Must have internet. Will ingest from Node B and automatically sync to this dashboard.</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};
