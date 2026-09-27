import React, { useState } from 'react';
import { PrivacyPolicyModal, RfDisclaimerModal } from './LegalModals';

export const Footer: React.FC = () => {
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isRfOpen, setIsRfOpen] = useState(false);

  return (
    <>
      <footer className="h-8 border-t border-slate-800 bg-[#080c14] flex items-center justify-between px-4 text-[10px] font-mono text-slate-500 shrink-0 z-40">
        <div className="flex gap-4">
          <span className="text-slate-400 font-bold">MESHAID v1.0.0</span>
          <span className="hidden sm:inline">EDGE-TO-CLOUD DTN GATEWAY</span>
        </div>
        
        <div className="flex gap-3 sm:gap-6">
          <button onClick={() => setIsPrivacyOpen(true)} className="hover:text-cyan-400 transition-colors">
            [ PRIVACY POLICY ]
          </button>
          <button onClick={() => setIsRfOpen(true)} className="hover:text-cyan-400 transition-colors">
            [ RF BROADCAST DISCLAIMER ]
          </button>
          <a href="https://github.com/Dannyo6/meshaid" target="_blank" rel="noreferrer" className="hover:text-cyan-400 transition-colors hidden md:inline">
            [ LICENSE ]
          </a>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline hover:text-white transition-colors cursor-pointer">
            <a href="https://github.com/Dannyo6/meshaid" target="_blank" rel="noreferrer">GITHUB REPOSITORY</a>
          </span>
          <span className="text-emerald-500 font-bold ml-2">ALL SYSTEMS NOMINAL</span>
        </div>
      </footer>

      <PrivacyPolicyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <RfDisclaimerModal isOpen={isRfOpen} onClose={() => setIsRfOpen(false)} />
    </>
  );
};
