import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Star } from 'lucide-react';

interface StartIoInterstitialProps {
  appId: string;
  onClose: () => void;
}

export const StartIoInterstitial: React.FC<StartIoInterstitialProps> = ({
  appId: _appId,
  onClose,
}) => {
  const [seconds, setSeconds] = useState(3);

  useEffect(() => {
    // If native Android StartApp bridge is present, trigger native interstitial
    if (
      typeof window !== 'undefined' &&
      window.AndroidStartApp &&
      typeof window.AndroidStartApp.showInterstitial === 'function'
    ) {
      try {
        window.AndroidStartApp.showInterstitial();
      } catch (err) {
        console.error('AndroidStartApp.showInterstitial failed:', err);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleAction = () => {
    window.open('https://www.start.io', '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div
      id="startio-interstitial-overlay"
      className="fixed inset-0 z-[99998] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fadeIn"
    >
      <div className="w-full max-w-md bg-[#131722] border border-[#263147] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative">
        {/* Top bar with Ad label & Close button */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#181e2b] border-b border-[#242c3d]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-black/50 border border-slate-700 px-2 py-0.5 rounded">
            Sponsored Ad
          </span>

          {seconds === 0 ? (
            <button
              id="close-interstitial-btn"
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="Close Ad"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="text-xs text-slate-400 font-mono">
              Close in {seconds}s
            </span>
          )}
        </div>

        {/* Interstitial Ad Graphic & Body */}
        <div className="p-6 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 p-0.5 shadow-xl mb-4">
            <div className="w-full h-full bg-[#0e121a] rounded-2xl flex items-center justify-center text-3xl font-black text-white">
              🚀
            </div>
          </div>

          <h3 className="text-xl font-black text-white mb-1 tracking-tight">
            Top Gaming & Stream 2026
          </h3>

          <div className="flex items-center justify-center gap-1.5 text-amber-400 text-xs mb-3">
            <Star className="w-3.5 h-3.5 fill-amber-400" />
            <span className="font-bold">4.9</span>
            <span className="text-slate-400">• Over 5M Active Players</span>
          </div>

          <p className="text-xs sm:text-sm text-slate-300 mb-6 leading-relaxed">
            Experience non-stop 4K entertainment and high-speed cloud gaming on any mobile device. Instant access with zero lag.
          </p>

          <button
            type="button"
            onClick={handleAction}
            className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 transition-transform active:scale-98"
          >
            <span>INSTALL & PLAY NOW</span>
            <ExternalLink className="w-4 h-4" />
          </button>

          {seconds === 0 && (
            <button
              type="button"
              onClick={onClose}
              className="mt-3 text-xs text-slate-400 hover:text-slate-200 py-1"
            >
              Skip & Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
