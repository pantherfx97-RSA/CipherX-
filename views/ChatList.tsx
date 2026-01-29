
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppMode, User, ContactRequest, ContactRecord } from '../types.js';
import { backend } from '../services/backendService.js';
import { performIntegrityAudit } from '../services/integrityService.js';

interface ChatListProps {
  mode: AppMode;
  currentUser: User;
  onLogout: () => void;
  onUpdateUser: (fields: Partial<User>) => void;
}

const ChatList: React.FC<ChatListProps> = ({ mode, currentUser, onLogout, onUpdateUser }) => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<{user: User, record: ContactRecord}[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showManifesto, setShowManifesto] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [audit, setAudit] = useState(performIntegrityAudit());

  useEffect(() => {
    if (mode === AppMode.DECOY_ONLY) return;

    // Load initial contacts
    const loadContacts = async () => {
      const cList = await backend.getContacts(currentUser.id);
      setContacts(cList);
    };
    loadContacts();

    // Subscribe to real-time handshake requests
    const unsubscribeRequests = backend.subscribeRequests(currentUser.id, (reqs) => {
      setRequests(reqs);
      // If a request was accepted (it's gone from requests), refresh contact list
      loadContacts();
    });

    const auditInterval = setInterval(() => {
      setAudit(performIntegrityAudit());
    }, 10000);

    return () => {
      unsubscribeRequests();
      clearInterval(auditInterval);
    };
  }, [currentUser.id, mode]);

  const handleSendRequest = async () => {
    if (!searchQuery.trim()) return;
    try {
      await backend.sendContactRequest(currentUser.id, searchQuery);
      setSearchQuery('');
      setShowAddModal(false);
      alert("Handshake pending verification.");
    } catch (err: any) { alert("Target identity not indexed."); }
  };

  const handleResponse = async (reqId: string, status: 'accepted' | 'ignored') => {
    await backend.respondToRequest(reqId, currentUser.id, status);
  };

  return (
    <div className="h-full flex flex-col bg-black">
      <header className="px-6 py-6 flex justify-between items-center border-b border-gray-900 bg-black/80 backdrop-blur-xl sticky top-0 z-30">
        <div>
          <h1 className="text-sm font-bold tracking-[0.3em] uppercase text-white">Workspace</h1>
          <p className="text-[8px] text-gray-600 uppercase font-black tracking-widest mt-1">Node: Online</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setShowAddModal(true)} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white relative transition-colors"><i className="fa-solid fa-plus text-lg"></i>{requests.length > 0 && <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span>}</button>
          <button onClick={() => setShowSettings(true)} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white transition-colors"><i className="fa-solid fa-sliders text-lg"></i></button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {requests.length > 0 && (
          <div className="px-6 py-4 bg-gray-900/30 border-b border-gray-900/50 animate-fade-in">
            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500 mb-3">Pending Handshakes</h4>
            <div className="space-y-3">
              {requests.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-black border border-gray-800 p-3 rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">@{r.senderUsername}</span>
                    <span className="text-[8px] text-gray-600 uppercase font-bold tracking-tighter mt-0.5">Hash: {r.fingerprint}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleResponse(r.id, 'ignored')} className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-gray-500 transition-colors hover:bg-gray-800"><i className="fa-solid fa-xmark text-xs"></i></button>
                    <button onClick={() => handleResponse(r.id, 'accepted')} className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-black transition-transform active:scale-90"><i className="fa-solid fa-check text-xs"></i></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-900/30">
          {contacts.map(({user: contact}) => (
            <div key={contact.id} onClick={() => navigate(`/chat/${contact.id}`)} className="flex items-center gap-5 p-6 hover:bg-gray-900/30 cursor-pointer transition-all active:bg-gray-900/60 group">
              <div className="w-12 h-12 rounded-2xl bg-gray-900 overflow-hidden border border-gray-800 grayscale group-hover:grayscale-0 transition-all duration-500">
                <img src={contact.avatar} className="w-full h-full object-cover" alt="" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-baseline">
                  <h3 className="text-[11px] font-black text-gray-300 uppercase tracking-[0.2em]">@{contact.username}</h3>
                  <span className="text-[7px] text-gray-700 uppercase font-black tracking-[0.2em]">E2EE Verified</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                  <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">Status: Active Node</p>
                </div>
              </div>
            </div>
          ))}
          {contacts.length === 0 && requests.length === 0 && (
            <div className="py-32 text-center">
              <div className="w-12 h-12 border border-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-6 text-gray-800">
                <i className="fa-solid fa-ghost text-xl"></i>
              </div>
              <p className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-800">No established channels</p>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/95 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl p-10 animate-slide-up shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2 uppercase tracking-[0.2em]">Add Remote Node</h3>
            <p className="text-[9px] text-gray-500 mb-10 uppercase tracking-widest font-bold leading-relaxed">Identity discovery requires exact handle matching. No directory indexing is performed.</p>
            <div className="relative">
              <input 
                type="text" 
                autoFocus
                value={searchQuery} 
                onChange={e => setSearchQuery(e.target.value)} 
                placeholder="Identity identifier (e.g. alice)" 
                className="w-full bg-black border border-gray-800 rounded-xl py-4 px-5 text-sm text-white placeholder-gray-800 outline-none focus:border-gray-500 transition-all" 
                onKeyDown={(e) => e.key === 'Enter' && handleSendRequest()}
              />
              <button onClick={handleSendRequest} className="absolute right-2 top-2 bottom-2 px-5 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-lg active:scale-95 transition-all">Verify</button>
            </div>
            <button onClick={() => setShowAddModal(false)} className="w-full mt-8 py-4 text-gray-600 font-black uppercase text-[10px] tracking-[0.3em] hover:text-gray-400 transition-colors">Return</button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/90 backdrop-blur-xl p-4 animate-fade-in">
          <div className="w-full max-w-md bg-gray-900 rounded-3xl p-10 border border-gray-800 animate-slide-up overflow-y-auto max-h-[90vh] shadow-2xl shadow-black/80">
            <h3 className="text-lg font-bold text-white mb-1 uppercase tracking-[0.2em]">Protocol Management</h3>
            <p className="text-[9px] text-gray-500 mb-10 uppercase tracking-widest font-bold">Authenticated Identity: @{currentUser.username}</p>
            
            <div className="space-y-4">
              <button onClick={() => setShowManifesto(true)} className="w-full p-5 bg-black rounded-xl border border-gray-800 flex justify-between items-center group active:bg-white/5 transition-all">
                <div className="flex flex-col items-start">
                  <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Security Manual</span>
                  <span className="text-[8px] text-gray-700 uppercase font-bold mt-1">Operational Commitments</span>
                </div>
                <i className="fa-solid fa-chevron-right text-gray-700 group-hover:text-white transition-colors"></i>
              </button>
              
              <div className="p-6 bg-black rounded-xl border border-gray-800 space-y-4">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                  <span className="text-gray-600">Integrity Health</span>
                  <span className={audit.isIntegrityOk ? 'text-green-500' : 'text-red-500'}>{audit.isIntegrityOk ? 'SECURE' : 'COMPROMISED'}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                  <span className="text-gray-600">Hardware Fingerprint</span>
                  <span className="text-gray-500 font-mono tracking-tighter">{audit.deviceFingerprint.slice(0, 16)}...</span>
                </div>
              </div>

              <button onClick={() => { setShowSettings(false); onLogout(); }} className="w-full p-6 bg-red-950/20 rounded-xl border border-red-900/30 text-red-500 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-red-900/20 active:scale-[0.98] transition-all">Destroy Local Session</button>
            </div>
            
            <button onClick={() => setShowSettings(false)} className="w-full mt-10 py-5 border border-gray-800 text-gray-500 font-black rounded-xl uppercase tracking-[0.3em] text-[10px] hover:border-gray-600 transition-all">Close Console</button>
          </div>
        </div>
      )}

      {showManifesto && (
        <div className="absolute inset-0 z-[60] bg-black p-8 overflow-y-auto animate-fade-in custom-scrollbar">
           <header className="flex justify-between items-center mb-12 sticky top-0 bg-black py-6 border-b border-gray-900 z-10">
              <h3 className="text-sm font-black uppercase tracking-[0.4em] text-white">Operational Manifesto</h3>
              <button onClick={() => setShowManifesto(false)} className="w-12 h-12 flex items-center justify-center text-gray-500 hover:text-white transition-colors"><i className="fa-solid fa-xmark text-xl"></i></button>
           </header>
           
           <div className="max-w-xl mx-auto space-y-12 text-gray-400 text-[12px] leading-relaxed pb-32">
              <section className="bg-gray-900/30 p-10 rounded-3xl border border-gray-800/50 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                   <i className="fa-solid fa-quote-right text-6xl"></i>
                </div>
                <h4 className="text-white uppercase font-black mb-8 tracking-[0.3em] text-[11px] border-b border-gray-800 pb-3">Founder Letter</h4>
                <div className="space-y-6 opacity-90 font-serif leading-loose text-gray-300">
                  <p className="font-sans font-black text-white uppercase text-[10px] tracking-widest mb-4">From the Founders of CipherX Inc</p>
                  <p>Communication should not be dangerous. Yet in today’s world, it often is.</p>
                  <p>We built CipherX because we saw a growing gap between how people think digital communication works and how it actually works. Messages feel private, but they are copied. Conversations feel temporary, but they are archived. Silence feels possible, yet data lingers.</p>
                  <p>CipherX was not created to make people invisible. It was created to make communication less exposed.</p>
                  <p>From day one, we made deliberate choices:</p>
                  <ul className="list-disc pl-5 space-y-2 font-sans text-[11px] font-bold uppercase tracking-widest not-italic text-gray-500">
                    <li>Not to store what we don’t need</li>
                    <li>Not to promise what cannot be guaranteed</li>
                    <li>Not to design systems that depend on blind trust</li>
                  </ul>
                  <p>We assume compromise is always possible. Networks fail. Devices are lost. Pressure exists. Security must still hold when conditions are imperfect.</p>
                  <p>That belief shaped every decision behind CipherX: Messages are encrypted before leaving your device; We do not retain plaintext; We do not hold master keys; We cannot read your conversations, even if we wanted to.</p>
                  <p>Decoy messaging and one-time reveal were built for reality: sometimes people are watched, questioned, or forced to unlock their phones. CipherX gives users a way to remain safe without escalation.</p>
                  <p>We believe security should be quiet. It should not announce itself. It should simply work, and leave as little behind as possible.</p>
                  <p className="pt-10 font-sans not-italic font-black text-white text-[10px] tracking-[0.4em] uppercase border-t border-gray-800/50 mt-10">
                    Signed,<br/><br/>
                    CipherX Inc<br/>
                    Founders & Security Architects<br/>
                    “Private communication, by design”
                  </p>
                </div>
              </section>

              <section className="px-4">
                 <h4 className="text-white uppercase font-black mb-5 tracking-[0.2em] text-[10px]">Zero-Exposure Model</h4>
                 <p>All communication payloads are cryptographically isolated. The central node acts as a blind relay, never gaining visibility into the decrypted state of any transaction. Forensic artifacts are minimal by design.</p>
              </section>

              <section className="px-4">
                 <h4 className="text-white uppercase font-black mb-5 tracking-[0.2em] text-[10px]">Coercion Defense</h4>
                 <p>The Secondary OS environment (Decoy Mode) provides plausible deniability under physical duress. Entering the Decoy PIN sanitizes the user experience, providing a standard chat interface with non-critical AI-simulated content.</p>
              </section>

              <section className="px-4 pt-10 border-t border-gray-900/50 text-center opacity-40">
                 <p className="text-[8px] uppercase font-black tracking-[0.5em]">Protocol v1.0.4-Pilot-Secure</p>
              </section>
           </div>
        </div>
      )}

      <style>{`
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 10px; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media print { .h-full { display: none !important; } body::after { content: "SCREENSHOTS PROHIBITED - CIPHERX SECURITY POLICY"; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; font-weight: bold; background: black; color: white; } }
      `}</style>
    </div>
  );
};

export default ChatList;
