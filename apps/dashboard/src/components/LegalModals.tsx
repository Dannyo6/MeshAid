import React from 'react';
import { X, ShieldAlert, RadioTower } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b0f17] border border-slate-700 w-full max-w-2xl rounded-sm shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-slate-200 font-bold font-mono flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-500" />
            PRIVACY & DATA RETENTION POLICY
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto text-sm text-slate-300 font-sans leading-relaxed space-y-4">
          <p>
            <strong>1. Ephemeral Telemetry Storage</strong><br />
            MeshAid is an emergency incident command telemetry system. All localized data, including GPS coordinates, distress signatures, and field annotations, are stored in an ephemeral SQLite database. Data is automatically evicted based on strict Priority Time-To-Live (TTL) policies (e.g., P3 General Info is purged after 12 hours).
          </p>
          <p>
            <strong>2. Zero Third-Party Analytics</strong><br />
            This application does not bundle Google Analytics, Meta Pixels, or any commercial telemetry tracking. The tactical dashboard communicates strictly with the designated WebSocket/REST API endpoint on the host base station.
          </p>
          <p>
            <strong>3. Public Broadcast Nature</strong><br />
            Emergency distress packets (P1 SOS) transmitted via BLE Extended Advertising are unencrypted, public broadcasts. The Ed25519 cryptographic signature guarantees <strong>integrity and non-repudiation</strong>, NOT confidentiality. Do not transmit sensitive Personal Identifiable Information (PII) beyond what is strictly necessary for search-and-rescue triage operations.
          </p>
        </div>
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-mono transition-colors">
            ACKNOWLEDGE
          </button>
        </div>
      </div>
    </div>
  );
};

export const RfDisclaimerModal: React.FC<ModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b0f17] border border-slate-700 w-full max-w-2xl rounded-sm shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
          <h2 className="text-slate-200 font-bold font-mono flex items-center gap-2">
            <RadioTower size={18} className="text-red-500" />
            RF BROADCAST & FCC COMPLIANCE DISCLAIMER
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto text-sm text-slate-300 font-sans leading-relaxed space-y-4">
          <p>
            <strong>1. ISM Band Usage</strong><br />
            The MeshAid mobile application utilizes the 2.4 GHz Industrial, Scientific, and Medical (ISM) radio band via standard Bluetooth Low Energy (BLE). It strictly adheres to local regulatory limits on transmission power as defined by the underlying Android OS and baseband firmware.
          </p>
          <p>
            <strong>2. Not a Substitute for Emergency Services</strong><br />
            MeshAid is an experimental, delay-tolerant mesh network designed for environments where traditional infrastructure has collapsed. It is <strong>NOT</strong> a certified replacement for E911, PLB (Personal Locator Beacons), or EPIRB (Emergency Position-Indicating Radio Beacons).
          </p>
          <p>
            <strong>3. Interference Acknowledgment</strong><br />
            Operation on BLE channels 37, 38, and 39 does not utilize Carrier-Sense Multiple Access (CSMA) backoffs. High-density deployments may cause temporary localized interference on the 2.4 GHz spectrum.
          </p>
        </div>
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-mono transition-colors">
            ACKNOWLEDGE
          </button>
        </div>
      </div>
    </div>
  );
};
