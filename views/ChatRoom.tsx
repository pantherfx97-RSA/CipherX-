
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppMode, Message, User } from '../types.js';
import { getDecoySuggestions } from '../services/geminiService.js';
import { generateMessageKey, encryptMessage, decryptMessage, storeLocalKey, getLocalKey } from '../lib/crypto.js';
import { backend } from '../services/backendService.js';

interface ChatRoomProps {
  mode: AppMode;
  user: User;
  onPanic: () => void;
}

const ChatRoom: React.FC<ChatRoomProps> = ({ mode, user, onPanic }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [targetContact, setTargetContact] = useState<User | null>(null);
  const [inputText, setInputText] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showDecoyPicker, setShowDecoyPicker] = useState(false);
  const [pendingRealMessage, setPendingRealMessage] = useState('');
  const [pendingMedia, setPendingMedia] = useState<{data: string, mime: string} | null>(null);
  const [decoys, setDecoys] = useState<string[]>([]);
  const [revealedContent, setRevealedContent] = useState<Record<string, string>>({});
  const [showRevealConfirm, setShowRevealConfirm] = useState<Message | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const init = async () => {
      if (!id) return;
      if (mode === AppMode.DECOY_ONLY) {
        setTargetContact({ id: 'd1', username: 'support', name: 'Workplace Support', avatar: 'https://api.dicebear.com/7.x/shapes/svg?seed=support', publicKey: '', isPilotApproved: true });
        setMessages([{ id: 'm1', senderId: 'd1', receiverId: user.id, decoyContent: 'Welcome to the secure corporate workspace. Your node is active.', encryptedContent: '', iv: '', status: 'sent', timestamp: Date.now(), isOneTime: false }]);
      } else {
        const u = await backend.getUserById(id);
        setTargetContact(u);
        unsubscribe = backend.subscribeMessages(user.id, id, (msgs) => {
          setMessages(msgs);
        });
      }
    };
    init();
    return () => { if (unsubscribe) unsubscribe(); };
  }, [id, mode, user.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, showDecoyPicker, pendingMedia]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingMedia({ data: reader.result as string, mime: file.type });
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (decoyText?: string) => {
    if ((!inputText.trim() && !pendingRealMessage && !pendingMedia) || !id) return;
    
    const realPayload = pendingMedia ? pendingMedia.data : (pendingRealMessage || inputText);
    const finalDecoy = decoyText || (pendingMedia ? "Shared an image." : realPayload);
    
    setIsAiLoading(true);
    try {
      const key = await generateMessageKey();
      const { ciphertext, iv } = await encryptMessage(realPayload, key);
      const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      
      // Persist key locally
      await storeLocalKey(msgId, key);
      const keyJwk = await window.crypto.subtle.exportKey('jwk', key);
      
      const newMessage: Message = { 
        id: msgId, 
        senderId: user.id, 
        receiverId: id, 
        decoyContent: finalDecoy, 
        encryptedContent: ciphertext, 
        mediaMimeType: pendingMedia?.mime,
        iv, 
        status: 'sent', 
        timestamp: Date.now(), 
        isOneTime: true,
        expiration: user.messageExpiration || 15
      };
      
      await backend.sendMessage(newMessage, keyJwk);
      setInputText('');
      setPendingRealMessage('');
      setPendingMedia(null);
      setShowDecoyPicker(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const openDecoySelector = async () => {
    if (!inputText.trim() && !pendingMedia) return;
    setIsAiLoading(true);
    try {
      const suggestions = await getDecoySuggestions();
      setDecoys(suggestions);
      setPendingRealMessage(inputText);
      setShowDecoyPicker(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleReveal = async (msg: Message) => {
    if (revealedContent[msg.id]) return;
    try {
      let key = await getLocalKey(msg.id);
      if (!key) {
        const keyJwk = await backend.getMessageKey(msg.id);
        if (!keyJwk) throw new Error("Key unavailable.");
        key = await window.crypto.subtle.importKey('jwk', keyJwk, { name: 'AES-GCM' }, true, ['decrypt']);
      }
      
      const plaintext = await decryptMessage(msg.encryptedContent, msg.iv, key);
      setRevealedContent(prev => ({ ...prev, [msg.id]: plaintext }));
      await backend.updateMessageStatus(msg.id, 'revealed');
    } catch (err) {
      alert("Decryption failed. Node key mismatch.");
    } finally {
      setShowRevealConfirm(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-black animate-fade-in relative">
      {/* Header */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-gray-900 bg-black/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/chats')} className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-white transition-colors">
            <i className="fa-solid fa-arrow-left"></i>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-900 overflow-hidden border border-gray-800 grayscale">
              <img src={targetContact?.avatar} className="w-full h-full object-cover" alt="" />
            </div>
            <div>
              <h2 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">@{targetContact?.username || 'Loading'}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-1 h-1 bg-green-500 rounded-full"></div>
                <span className="text-[7px] text-gray-600 uppercase font-black tracking-widest">Channel Secure</span>
              </div>
            </div>
          </div>
        </div>
        <button onClick={onPanic} className="w-10 h-10 flex items-center justify-center text-red-900 hover:text-red-500 transition-colors">
          <i className="fa-solid fa-triangle-exclamation"></i>
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8 space-y-8 custom-scrollbar">
        {messages.map((m) => {
          const isMe = m.senderId === user.id;
          const isRevealed = revealedContent[m.id];
          const isDestroyed = m.status === 'destroyed';

          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in`}>
              <div className={`max-w-[85%] space-y-2 ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`px-5 py-4 rounded-2xl border transition-all duration-500 ${isMe ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-900 border-gray-800 text-gray-300'}`}>
                  {isDestroyed ? (
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-900 flex items-center gap-2">
                      <i className="fa-solid fa-skull-crossbones"></i> DATA SCRUBBED
                    </p>
                  ) : isRevealed ? (
                    m.mediaMimeType?.startsWith('image/') ? (
                      <img src={isRevealed} className="rounded-lg max-w-full animate-pulse-once" alt="Decrypted payload" />
                    ) : (
                      <p className="text-sm font-light leading-relaxed whitespace-pre-wrap">{isRevealed}</p>
                    )
                  ) : (
                    <p className="text-sm font-light opacity-50 italic">{m.decoyContent}</p>
                  )}
                </div>
                
                {!isMe && !isRevealed && !isDestroyed && (
                  <button 
                    onClick={() => setShowRevealConfirm(m)}
                    className="text-[8px] font-black uppercase tracking-[0.3em] text-blue-500 hover:text-white transition-colors ml-2 flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-eye-low-beam"></i> Reveal One-Time Payload
                  </button>
                )}
                
                {isRevealed && !isDestroyed && (
                  <div className="flex items-center gap-2 text-[7px] font-black uppercase tracking-widest text-red-900 animate-pulse px-2">
                    <i className="fa-solid fa-fire"></i> Auto-Scrubbing Active
                  </div>
                )}
                
                <span className="text-[7px] text-gray-800 uppercase font-black px-2">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input Area */}
      <div className="p-6 bg-black border-t border-gray-900 safe-area-bottom">
        {pendingMedia && (
          <div className="mb-4 p-3 bg-gray-900 rounded-xl flex items-center justify-between animate-fade-in border border-blue-900/30">
            <div className="flex items-center gap-3">
              <i className="fa-solid fa-file-shield text-blue-500"></i>
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Attachment Armed ({Math.round(pendingMedia.data.length / 1024)} KB)</span>
            </div>
            <button onClick={() => setPendingMedia(null)} className="text-gray-600 hover:text-red-500"><i className="fa-solid fa-xmark"></i></button>
          </div>
        )}
        
        <div className="flex gap-3 items-center">
          <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 flex items-center justify-center bg-gray-900 rounded-xl text-gray-500 hover:text-white transition-all">
            <i className="fa-solid fa-paperclip text-lg"></i>
          </button>
          <input ref={fileInputRef} type="file" onChange={handleFileChange} className="hidden" />
          
          <div className="flex-1 relative">
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Secure Transmission..."
              className="w-full bg-gray-900 border border-gray-800 rounded-xl py-4 px-5 text-sm text-white placeholder-gray-800 outline-none focus:border-gray-600 transition-all"
              onKeyDown={(e) => e.key === 'Enter' && (mode === AppMode.NORMAL ? openDecoySelector() : handleSendMessage())}
            />
            {isAiLoading && <div className="absolute right-4 top-1/2 -translate-y-1/2"><i className="fa-solid fa-circle-notch animate-spin text-gray-600 text-xs"></i></div>}
          </div>

          <button 
            onClick={() => mode === AppMode.NORMAL ? openDecoySelector() : handleSendMessage()}
            className="w-12 h-12 flex items-center justify-center bg-white rounded-xl text-black active:scale-90 transition-all shadow-[0_0_15px_rgba(255,255,255,0.1)]"
          >
            <i className="fa-solid fa-arrow-up text-lg"></i>
          </button>
        </div>
      </div>

      {/* Reveal Confirmation Overlay */}
      {showRevealConfirm && (
        <div className="absolute inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center p-10 animate-fade-in">
          <div className="w-full max-w-xs text-center space-y-10">
            <div className="w-16 h-16 border border-red-900 rounded-3xl flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(127,29,29,0.3)] animate-pulse">
              <i className="fa-solid fa-eye text-red-900 text-2xl"></i>
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-[0.3em] mb-4">Critical Reveal</h3>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest leading-relaxed font-bold">This payload will be decrypted once and then purged from the node forever. Proceed?</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setShowRevealConfirm(null)} className="py-4 border border-gray-800 rounded-xl text-[10px] font-black uppercase text-gray-600 tracking-widest">Abort</button>
              <button onClick={() => handleReveal(showRevealConfirm)} className="py-4 bg-red-950/20 border border-red-900/50 rounded-xl text-[10px] font-black uppercase text-red-500 tracking-widest">Execute</button>
            </div>
          </div>
        </div>
      )}

      {/* Decoy Picker Overlay */}
      {showDecoyPicker && (
        <div className="absolute inset-0 z-[60] bg-black/95 backdrop-blur-xl flex flex-col p-10 animate-fade-in overflow-hidden">
          <div className="mb-12">
            <h3 className="text-lg font-black text-white uppercase tracking-[0.3em]">Decoy Selection</h3>
            <p className="text-[9px] text-gray-600 uppercase font-black tracking-widest mt-2">Choose a harmless cover story for this transmission.</p>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2">
            {decoys.map((d, i) => (
              <button 
                key={i} 
                onClick={() => handleSendMessage(d)}
                className="w-full p-6 text-left bg-gray-900/30 border border-gray-800 rounded-2xl hover:bg-white/5 hover:border-white/20 transition-all animate-slide-up"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed">{d}</p>
              </button>
            ))}
            <button 
                onClick={() => handleSendMessage()}
                className="w-full p-6 text-left bg-blue-950/10 border border-blue-900/30 rounded-2xl hover:bg-blue-900/20 transition-all"
              >
                <p className="text-[11px] text-blue-500 font-black uppercase tracking-widest">No Decoy (Send Plaintext Cover)</p>
              </button>
          </div>
          <button onClick={() => setShowDecoyPicker(false)} className="mt-10 py-5 text-gray-600 font-black uppercase tracking-[0.3em] text-[10px]">Return to Editor</button>
        </div>
      )}
      
      <style>{`
        .animate-pulse-once { animation: pulseOnce 1s ease-out; }
        @keyframes pulseOnce { 0% { opacity: 0; transform: scale(0.98); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
};

export default ChatRoom;
