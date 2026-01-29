
import React, { useState, useEffect, useRef } from 'react';
import { AppMode, User } from '../types.js';
import { backend } from '../services/backendService.js';
import { getDeviceIdentity } from '../services/integrityService.js';

interface LoginProps {
  onLogin: (user: User, mode: AppMode) => void;
  integrityOk: boolean;
}

export const Logo = ({ size = "sm", animated = false }: { size?: "sm" | "lg", animated?: boolean }) => {
  const dim = size === 'lg' ? 64 : 48;
  const iconDim = size === 'lg' ? 32 : 24;
  return (
    <div className={`relative flex items-center justify-center ${size === 'lg' ? 'mb-10' : 'mb-4'} ${animated ? 'animate-pulse' : ''}`}>
      <div className={`border border-white/10 rounded-2xl flex items-center justify-center bg-black relative overflow-hidden`} style={{ width: dim, height: dim }}>
        <svg width={iconDim} height={iconDim} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 8V12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 15.5H12.01" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
};

const PinInput = ({ value, label, colorClass = "text-gray-600", active = false }: { value: string, label: string, colorClass?: string, active?: boolean }) => {
  return (
    <div className={`w-full transition-all duration-300 ${active ? 'opacity-100 scale-100' : 'opacity-30 scale-95'}`}>
      <label className={`text-[10px] ${colorClass} uppercase tracking-[0.2em] block mb-6 font-bold text-center`}>{label}</label>
      <div className="relative flex justify-center items-center gap-6 pb-6 border-b border-gray-800/50">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${value.length > i ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'bg-white/10'}`} />
        ))}
      </div>
    </div>
  );
};

const Login: React.FC<LoginProps> = ({ onLogin, integrityOk }) => {
  const [step, setStep] = useState<'AUTH' | 'PIN' | 'REGISTER' | 'REGISTER_PINS'>('AUTH');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [regRealPin, setRegRealPin] = useState('');
  const [regDecoyPin, setRegDecoyPin] = useState('');
  const [authenticatedUser, setAuthenticatedUser] = useState<User | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const realPinInputRef = useRef<HTMLInputElement>(null);
  const decoyPinInputRef = useRef<HTMLInputElement>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const user = await backend.login(username, password, getDeviceIdentity());
      setAuthenticatedUser(user);
      setStep('PIN');
    } catch (err: any) { 
      setAuthError(err.message?.toUpperCase() || "HANDSHAKE FAILED."); 
    }
    finally { setAuthLoading(false); }
  };

  const finalizeRegistration = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (regRealPin.length < 4 || regDecoyPin.length < 4) {
      setAuthError("COMPLETE BOTH SECURITY LAYERS.");
      return;
    }
    setAuthLoading(true);
    try {
      const user = await backend.register(username, password, regRealPin, regDecoyPin, inviteCode, getDeviceIdentity());
      onLogin(user, AppMode.NORMAL);
    } catch (err: any) { 
      setAuthError(err.message?.toUpperCase() || "ENROLLMENT REJECTED."); 
    }
    finally { setAuthLoading(false); }
  };

  const handlePinPress = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin.length === 4) checkPin(newPin);
    }
  };

  const checkPin = async (p: string) => {
    if (!authenticatedUser) return;
    try {
      const mode = await backend.verifyPin(authenticatedUser.username, p);
      onLogin(authenticatedUser, mode);
    } catch (err) {
      setError(true);
      setTimeout(() => { setPin(''); setError(false); }, 500);
    }
  };

  if (step === 'AUTH' || step === 'REGISTER') {
    return (
      <div className="h-full flex flex-col p-12 bg-black animate-fade-in">
        <div className="mt-12 mb-12">
          <Logo size="lg" />
          <h1 className="text-xl font-bold text-white uppercase tracking-[0.2em] mb-2">{step === 'AUTH' ? 'Session Initialization' : 'Identity Provisioning'}</h1>
          <p className="text-gray-600 text-[10px] uppercase font-bold tracking-widest leading-relaxed">
            {step === 'AUTH' ? 'Synchronize with secure node.' : 'Manual network enrollment required for pilot access.'}
          </p>
        </div>
        <form onSubmit={step === 'AUTH' ? handleAuth : (e) => { e.preventDefault(); setStep('REGISTER_PINS'); }} className="space-y-4">
          <input type="text" placeholder="Identity Handle" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-xl py-4 px-5 text-sm text-white placeholder-gray-700 outline-none focus:border-gray-500 transition-all" />
          <input type="password" placeholder="Passphrase" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-xl py-4 px-5 text-sm text-white placeholder-gray-700 outline-none focus:border-gray-500 transition-all" />
          {step === 'REGISTER' && (
            <input type="text" placeholder="Validation Code" value={inviteCode} onChange={e => setInviteCode(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-xl py-4 px-5 text-sm text-white placeholder-gray-700 outline-none focus:border-gray-500 transition-all" />
          )}
          {authError && <p className="text-red-900 text-[9px] uppercase font-bold text-center tracking-widest animate-pulse mt-2">{authError}</p>}
          <button type="submit" disabled={authLoading} className="w-full bg-white text-black font-bold py-5 rounded-xl uppercase tracking-widest text-[10px] active:scale-[0.98] transition-all mt-4 disabled:opacity-50">
            {authLoading ? 'VERIFYING...' : (step === 'AUTH' ? 'INITIALIZE' : 'PROVISION ACCESS')}
          </button>
        </form>
        <button onClick={() => { setStep(step === 'AUTH' ? 'REGISTER' : 'AUTH'); setAuthError(null); }} className="mt-12 text-gray-700 text-[9px] uppercase tracking-[0.3em] font-black hover:text-gray-500 transition-colors">
          {step === 'AUTH' ? 'ENROLL NEW NODE' : 'EXISTING HANDSHAKE'}
        </button>
      </div>
    );
  }

  if (step === 'REGISTER_PINS') {
    return (
      <div className="h-full flex flex-col items-center justify-start py-20 px-10 bg-black animate-fade-in relative overflow-hidden">
        <Logo size="lg" />
        
        <div className="text-center mb-16">
          <h2 className="text-2xl font-bold text-white uppercase tracking-[0.2em] mb-3">Access Control</h2>
          <p className="text-gray-600 text-[10px] uppercase font-bold tracking-widest">Establish verification layers.</p>
        </div>

        <div className="w-full space-y-16 relative z-10">
          {/* PIN Input proxy: We focus a hidden input elsewhere to avoid blocking buttons */}
          <div className="relative cursor-text" onClick={() => realPinInputRef.current?.focus()}>
            <PinInput value={regRealPin} label="Standard Access Pin" active={regRealPin.length < 4 || (regRealPin.length === 4 && regDecoyPin.length === 0)} />
            <input 
              ref={realPinInputRef}
              type="tel" 
              maxLength={4} 
              autoFocus
              value={regRealPin} 
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setRegRealPin(val);
                if (val.length === 4) decoyPinInputRef.current?.focus();
              }} 
              className="fixed -top-[1000px] opacity-0"
            />
          </div>

          <div className="relative cursor-text" onClick={() => decoyPinInputRef.current?.focus()}>
            <PinInput value={regDecoyPin} label="Coercion / Guest Pin" colorClass="text-red-900/80" active={regRealPin.length === 4} />
            <input 
              ref={decoyPinInputRef}
              type="tel" 
              maxLength={4} 
              value={regDecoyPin} 
              onChange={e => setRegDecoyPin(e.target.value.replace(/\D/g, ''))} 
              className="fixed -top-[1000px] opacity-0"
            />
          </div>
        </div>

        <div className="mt-12 h-6 flex items-center justify-center">
          {authError && <p className="text-red-900 text-[10px] uppercase font-bold tracking-[0.1em] text-center animate-pulse">{authError}</p>}
        </div>

        <div className="mt-auto w-full pt-6 pb-4 relative z-30">
          <button 
            type="button"
            onClick={finalizeRegistration}
            disabled={authLoading}
            className="w-full bg-white text-black font-bold py-6 rounded-xl uppercase tracking-[0.2em] text-[10px] active:scale-[0.97] transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] disabled:opacity-50"
          >
            {authLoading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="fa-solid fa-circle-notch animate-spin text-[12px]"></i>
                AUTHORIZING...
              </span>
            ) : 'FINALIZE AUTHORIZATION'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-between py-24 px-12 bg-black animate-fade-in">
      <div className="flex flex-col items-center text-center">
        <Logo size="lg" />
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Node Verification</h2>
        <p className="text-gray-600 text-[10px] mt-2 font-bold uppercase tracking-widest">Identity: @{authenticatedUser?.username}</p>
      </div>
      <div className="flex gap-6 my-12">
        {[0, 1, 2, 3].map((i) => (<div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${pin.length > i ? 'bg-white scale-125 shadow-[0_0_8px_white]' : 'bg-gray-800'} ${error ? 'bg-red-900' : ''}`} />))}
      </div>
      <div className="grid grid-cols-3 gap-10">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (<button key={num} onClick={() => handlePinPress(num.toString())} className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-light text-gray-400 active:text-white active:scale-90 transition-all active:bg-white/5">{num}</button>))}
        <div /><button onClick={() => handlePinPress('0')} className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-light text-gray-400 active:text-white active:scale-90 transition-all active:bg-white/5">0</button>
        <button onClick={() => setPin(pin.slice(0, -1))} className="w-16 h-16 flex items-center justify-center text-gray-700 active:text-white"><i className="fa-solid fa-delete-left text-xl"></i></button>
      </div>
    </div>
  );
};
export default Login;
