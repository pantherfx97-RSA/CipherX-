
import React from 'react';
import { Logo } from './Login.js';

const Splash: React.FC = () => {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-black text-white">
      <Logo size="lg" animated={true} />
      <div className="text-center mt-6">
        <h1 className="text-2xl font-light tracking-[0.4em] uppercase">CipherX</h1>
        <p className="text-[9px] text-gray-500 uppercase tracking-[0.2em] mt-3 font-medium">Security without exposure</p>
      </div>
      <div className="mt-16 flex gap-2">
        <div className="w-1 h-1 bg-white/10 rounded-full animate-pulse"></div>
        <div className="w-1 h-1 bg-white/10 rounded-full animate-pulse [animation-delay:0.2s]"></div>
        <div className="w-1 h-1 bg-white/10 rounded-full animate-pulse [animation-delay:0.4s]"></div>
      </div>
    </div>
  );
};

export default Splash;
