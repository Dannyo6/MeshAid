import React, { useState } from 'react';
import { PrivacyPolicyModal, RfDisclaimerModal } from './LegalModals';

export const Footer: React.FC = () => {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isRfOpen, setIsRfOpen] = useState(false);

  return (
    <>
      <footer className="border-t border-zinc-800 bg-zinc-950 py-6 px-6 flex flex-col md:flex-row items-center justify-between text-xs text-zinc-500 gap-4 shrink-0 z-40">
        <div className="flex items-center gap-3">
          <span className="text-zinc-400 font-medium">MeshAid v1.0.0</span>
          <span className="hidden sm:inline text-zinc-600">·</span>
          <span className="hidden sm:inline">Edge-to-Cloud DTN Gateway</span>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-zinc-300 transition-colors">
            Privacy Policy
          </button>
          <span className="text-zinc-700">·</span>
          <button onClick={() => setIsRfOpen(true)} className="hover:text-zinc-300 transition-colors">
            RF Disclaimer
          </button>
          <span className="text-zinc-700">·</span>
          <a href="https://github.com/Dannyo6/meshaid" target="_blank" rel="noreferrer" className="hover:text-zinc-300 transition-colors">
            License
          </a>
        </div>

        <div className="flex items-center gap-3">
          <a href="https://github.com/Dannyo6/meshaid" target="_blank" rel="noreferrer" className="hidden sm:inline hover:text-zinc-300 transition-colors">
            GitHub
          </a>
          <span className="hidden sm:inline text-zinc-700">·</span>
          <span className="text-emerald-500 font-medium">All systems nominal</span>
        </div>
      </footer>

      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <RfDisclaimerModal isOpen={isRfOpen} onClose={() => setIsRfOpen(false)} />
    </>
  );
};
