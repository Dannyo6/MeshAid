import React from 'react';
import { Download, ShieldAlert } from 'lucide-react';

export const FieldSetup: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto pt-12 pb-24 px-6 text-zinc-300 overflow-y-auto w-full">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 mb-3">
        Field APK &amp; Setup
      </h1>
      <p className="text-zinc-400 text-base leading-relaxed mb-8 max-w-2xl">
        Instructions for provisioning offline Android edge devices. The MeshAid mobile agent requires
        extensive, non-standard runtime permissions to operate continuously in a disconnected
        physical environment using BLE background scanning.
      </p>

      <a
        href="/downloads/app-debug.apk"
        download
        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-zinc-50 text-zinc-900 hover:bg-zinc-200 h-10 px-4 py-2 mt-4 mb-8 gap-2"
      >
        <Download size={16} />
        Download app-debug.apk
      </a>
      <p className="text-xs text-zinc-500 -mt-6 mb-10 font-mono">v1.0.0-rc1 · 4.2 MB · SHA-256 verified</p>

      {/* Step 1 */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold">1</span>
          <h3 className="text-zinc-50 font-medium text-lg">ADB Sideload Deployment</h3>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed mb-3 ml-9">
          Enable Developer Options and USB Debugging on the target Android device. Connect via USB and sideload the APK:
        </p>
        <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mt-3 mb-6 overflow-x-auto ml-9">
          <code className="text-sm font-mono text-zinc-300">adb install -r app-debug.apk</code>
        </pre>
      </div>

      {/* Step 2 */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold">2</span>
          <h3 className="text-zinc-50 font-medium text-lg">Grant Runtime Permissions</h3>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed mb-3 ml-9">
          Grant hazardous permissions directly via ADB to avoid user prompt fatigue and guarantee background operation.
        </p>
        <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mt-3 mb-6 overflow-x-auto ml-9">
          <code className="text-sm font-mono text-zinc-300">{`adb shell pm grant dev.meshaid.app android.permission.BLUETOOTH_SCAN
adb shell pm grant dev.meshaid.app android.permission.BLUETOOTH_ADVERTISE
adb shell pm grant dev.meshaid.app android.permission.ACCESS_FINE_LOCATION
adb shell pm grant dev.meshaid.app android.permission.POST_NOTIFICATIONS`}</code>
        </pre>
      </div>

      {/* Step 3 */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold">3</span>
          <h3 className="text-zinc-50 font-medium text-lg">OEM Battery Exemption</h3>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed mb-3 ml-9">
          Bypass Android Doze mode and proprietary OEM task killers. Without this, BLE radio halts after
          approximately 5 minutes of screen-off.
        </p>
        <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mt-3 mb-3 overflow-x-auto ml-9">
          <code className="text-sm font-mono text-zinc-300">adb shell dumpsys deviceidle whitelist +dev.meshaid.app</code>
        </pre>
        <p className="text-xs text-zinc-500 ml-9 flex items-center gap-1.5">
          <ShieldAlert size={12} />
          Samsung OneUI / Xiaomi MIUI: Manual toggle required in Settings → Battery → Unrestricted.
        </p>
      </div>

      {/* Step 4 */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold">4</span>
          <h3 className="text-zinc-50 font-medium text-lg">3-Node Physical Testbed</h3>
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed mb-4 ml-9">
          Verify protocol fidelity using three physically isolated handsets:
        </p>
        <div className="space-y-3 ml-9">
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <p className="text-sm"><span className="text-zinc-50 font-medium">Node A — Victim:</span>{' '}
              <span className="text-zinc-400">Disable Wi-Fi and LTE. Trigger a P1 SOS distress signal.</span></p>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <p className="text-sm"><span className="text-zinc-50 font-medium">Node B — Relay:</span>{' '}
              <span className="text-zinc-400">Walk into Node A's BLE range. Receive telemetry in background. Walk toward Node C.</span></p>
          </div>
          <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900/50">
            <p className="text-sm"><span className="text-zinc-50 font-medium">Node C — Sink:</span>{' '}
              <span className="text-zinc-400">Must have internet. Will ingest from Node B and automatically sync to this dashboard.</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};
