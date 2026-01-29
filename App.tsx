
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppMode, User, SecurityStatus } from './types.js';
import Login from './views/Login.js';
import ChatList from './views/ChatList.js';
import ChatRoom from './views/ChatRoom.js';
import Splash from './views/Splash.js';
import { performIntegrityAudit, getDeviceIdentity } from './services/integrityService.js';
import { isBackendReady } from './services/backendService.js';

const PrivacyShield = ({ visible }: { visible: boolean }) => (
  <div className={`fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center transition-opacity duration-300 pointer-events-none ${visible ? 'opacity-100' : 'opacity-0'}`}>
    <div className="w-12 h-12 border border-white/20 rounded-2xl flex items-center justify-center mb-6">
      <i className="fa-solid fa-shield-halved text-white text-xl"></i>
    </div>
    <p className="text-[10px] text-gray-500 uppercase tracking-[0.5em] font-black">Secure Environment Active</p>
    <p className="text-[8px] text-gray-700 uppercase tracking-[0.2em] mt-2">Content Obscured for Privacy</p>
  </div>
);

const ConfigErrorView = () => (
  <div className="h-screen w-full bg-black flex flex-col items-center justify-center p-12 text-center animate-fade-in">
    <div className="w-16 h-16 border border-red-900/30 rounded-3xl flex items-center justify-center mb-10 shadow-[0_0_40px_rgba(127,29,29,0.2)]">
      <i className="fa-solid fa-triangle-exclamation text-red-600 text-2xl"></i>
    </div>
    <h2 className="text-sm font-black text-white mb-6 uppercase tracking-[0.4em]">Node Configuration Error</h2>
    <div className="max-w-xs space-y-4 text-[10px] text-gray-500 uppercase tracking-widest leading-relaxed font-bold">
      <p>The secure relay (Firebase) is not initialized.</p>
      <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-800 text-left space-y-2">
        <p className="text-gray-400">Required Environment Variables:</p>
        <ul className="list-disc pl-4 space-y-1 text-gray-600">
          <li>VITE_FIREBASE_API_KEY</li>
          <li>VITE_FIREBASE_PROJECT_ID</li>
          <li>API_KEY (for Gemini)</li>
        </ul>
      </div>
      <p className="pt-4 text-gray-700">Check Vercel Project Settings > Environment Variables and ensure values are propagated.</p>
    </div>
  </div>
);

const App: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>(AppMode.LOCKED);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isDisclosureAccepted, setIsDisclosureAccepted] = useState(false);
  const [isAppBlurred, setIsAppBlurred] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus>({
    isEmulator: false,
    isDebug: false,
    isIntegrityOk: true,
    lastAudit: Date.now(),
    deviceFingerprint: ''
  });
  
  const lastActivityRef = useRef<number>(Date.now());

  const runAudit = useCallback(() => {
    const status = performIntegrityAudit();
    setSecurityStatus(status);
    if (!status.isIntegrityOk && isAuthenticated && appMode === AppMode.NORMAL) {
      setAppMode(AppMode.DECOY_ONLY);
    }
    return status;
  }, [isAuthenticated, appMode]);

  const lockApp = useCallback(() => {
    if (isAuthenticated) {
      setIsAuthenticated(false);
      setAppMode(AppMode.LOCKED);
      setCurrentUser(null);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setIsAppBlurred(true);
        lockApp();
      } else {
        setIsAppBlurred(false);
      }
    };
    
    const handleFocusBlur = (e: Event) => {
      if (e.type === 'blur') setIsAppBlurred(true);
      else setIsAppBlurred(false);
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4'))) {
        setIsAppBlurred(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleFocusBlur);
    window.addEventListener('focus', handleFocusBlur);
    window.addEventListener('keydown', handleKeydown);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleFocusBlur);
      window.removeEventListener('focus', handleFocusBlur);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, [lockApp]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;
    const timeoutMs = (currentUser.sessionTimeout || 5) * 60 * 1000;
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > timeoutMs) lockApp();
    }, 10000);
    const updateActivity = () => lastActivityRef.current = Date.now();
    window.addEventListener('mousedown', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('touchstart', updateActivity);
    return () => {
      clearInterval(interval);
      window.removeEventListener('mousedown', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
    };
  }, [isAuthenticated, currentUser, lockApp]);

  useEffect(() => {
    const init = async () => {
      const devId = getDeviceIdentity();
      setSecurityStatus(prev => ({ ...prev, deviceFingerprint: devId }));
      setTimeout(() => setIsInitialized(true), 1500);
    };
    init();
    const auditInterval = setInterval(runAudit, 5000);
    return () => clearInterval(auditInterval);
  }, [runAudit]);

  const handleLogin = (user: User, mode: AppMode) => {
    const status = runAudit();
    setCurrentUser(user);
    setAppMode(!status.isIntegrityOk ? AppMode.DECOY_ONLY : mode);
    setIsAuthenticated(true);
    lastActivityRef.current = Date.now();
  };

  const handleUpdateUser = (updatedFields: Partial<User>) => {
    if (currentUser) setCurrentUser({ ...currentUser, ...updatedFields });
  };

  if (!isInitialized) return <Splash />;

  if (!isBackendReady) return <ConfigErrorView />;

  if (!isDisclosureAccepted) {
    return (
      <div className="h-[100dvh] w-full bg-black flex flex-col items-center justify-center p-8 sm:p-12 text-center animate-fade-in overflow-y-auto">
        <div className="w-16 h-16 border border-white/20 rounded-2xl flex items-center justify-center mb-10 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
           <i className="fa-solid fa-shield-halved text-white text-2xl"></i>
        </div>
        <h2 className="text-xl font-black text-white mb-8 uppercase tracking-[0.4em]">Node Protocol</h2>
        
        <div className="text-gray-500 text-[11px] space-y-8 max-w-sm text-left leading-relaxed mb-16 px-4">
          <section>
            <h3 className="text-white uppercase font-black mb-2 tracking-[0.2em] text-[10px]">I. Cryptographic Isolation</h3>
            <p className="opacity-70 text-xs">Communication payloads are isolated via AES-256-GCM. Decryption occurs strictly at the edge.</p>
          </section>
          
          <section>
            <h3 className="text-white uppercase font-black mb-2 tracking-[0.2em] text-[10px]">II. Capture Mitigation</h3>
            <p className="opacity-70 text-xs">Any focus loss or potential capture event triggers immediate content erasure and UI obscuration.</p>
          </section>

          <section>
            <h3 className="text-white uppercase font-black mb-2 tracking-[0.2em] text-[10px]">III. Ephemerality</h3>
            <p className="opacity-70 text-xs">Sessions are transient. Inactivity or focus loss triggers immediate memory sanitation.</p>
          </section>
        </div>

        <button 
          onClick={() => setIsDisclosureAccepted(true)}
          className="w-full max-w-xs bg-white text-black font-black py-5 rounded-xl uppercase tracking-[0.3em] text-[10px] active:scale-[0.97] transition-all shadow-2xl"
        >
          Initialize Node
        </button>
        <p className="mt-10 text-[8px] text-gray-800 uppercase tracking-[0.5em] font-black">Build Protocol v1.0.4-PILOT</p>
      </div>
    );
  }

  return (
    <div 
      onContextMenu={(e) => e.preventDefault()}
      className={`h-[100dvh] w-full max-w-none sm:max-w-md mx-auto bg-black sm:shadow-2xl sm:border-x border-gray-900/50 overflow-hidden flex flex-col font-sans transition-all duration-700 select-none relative ${isAppBlurred ? 'blur-3xl scale-110 opacity-50' : ''}`}
    >
      <PrivacyShield visible={isAppBlurred} />
      <HashRouter>
        <Routes>
          <Route path="/auth" element={isAuthenticated ? <Navigate to="/chats" replace /> : <Login onLogin={handleLogin} integrityOk={securityStatus.isIntegrityOk} />} />
          <Route path="/chats" element={isAuthenticated && currentUser ? <ChatList mode={appMode} currentUser={currentUser} onLogout={lockApp} onUpdateUser={handleUpdateUser} /> : <Navigate to="/auth" replace />} />
          <Route path="/chat/:id" element={isAuthenticated && currentUser ? <ChatRoom mode={appMode} user={currentUser} onPanic={lockApp} /> : <Navigate to="/auth" replace />} />
          <Route path="/" element={<Navigate to={isAuthenticated ? "/chats" : "/auth"} replace />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      </HashRouter>
      <style>{`
        body { 
            user-select: none; 
            -webkit-user-select: none; 
            -ms-user-select: none; 
            background: #000;
        }
        @media print { 
            * { display: none !important; } 
            body::after { 
                content: "SCREENSHOTS PROHIBITED - CIPHERX SECURITY POLICY"; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                background: black; 
                color: white; 
                font-size: 14px;
                text-align: center;
                padding: 40px;
                letter-spacing: 0.2em;
            } 
        }
        html { -webkit-print-color-adjust: exact; }
        /* Safe Area Padding for Chat Room */
        .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
        .safe-area-top { padding-top: env(safe-area-inset-top); }
      `}</style>
    </div>
  );
};

export default App;
