import React from 'react';
import { ExternalLink } from 'lucide-react';

interface StartIoBannerProps {
  appId: string;
}

export const StartIoBanner: React.FC<StartIoBannerProps> = ({ appId: _appId }) => {
  // If running inside Android APK with native StartApp SDK, hide web banner to prevent duplicate
  if (
    typeof window !== 'undefined' &&
    window.AndroidStartApp &&
    typeof window.AndroidStartApp.isNativeApp === 'function' &&
    window.AndroidStartApp.isNativeApp()
  ) {
    return null;
  }

  const handleAdClick = () => {
    window.open('https://www.start.io', '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      id="startio-bottom-banner"
      className="w-full bg-[#0d1017] border-t border-[#1e2330] shadow-2xl flex items-center justify-center px-2 sm:px-4 py-1 z-40 relative select-none"
      style={{ minHeight: '52px' }}
    >
      {/* Standard Mobile Banner Unit (320x50 / 468x60 style) */}
      <div
        onClick={handleAdClick}
        className="w-full max-w-[640px] h-[46px] bg-[#141924] hover:bg-[#181f2d] border border-[#263147] hover:border-sky-500/40 rounded-lg flex items-center justify-between px-3 relative overflow-hidden cursor-pointer transition-colors duration-200 group"
      >
        {/* Subtle standard "Ad" marker */}
        <span className="absolute top-0.5 right-1 text-[8px] font-medium text-slate-500 bg-[#0d1017] px-1 rounded border border-slate-800 pointer-events-none">
          Ad
        </span>

        {/* Left: App/Movie Icon & Text details */}
        <div className="flex items-center gap-2.5 truncate mr-2">
          {/* App Icon */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center font-black text-white text-xs shadow-md shrink-0">
            🎬
          </div>

          {/* Ad Headline & Description */}
          <div className="flex flex-col text-left truncate">
            <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors truncate">
              Cinema 4K & Fast Web Stream
            </span>
            <span className="text-[10px] text-slate-400 truncate">
              Watch Latest Releases in Ultra HD • Zero Buffering
            </span>
          </div>
        </div>

        {/* Right: Clean Standard CTA Button (No Start.io button!) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="px-3 py-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-[11px] rounded-md shadow-md flex items-center gap-1 active:scale-95 transition-transform"
          >
            <span>INSTALL</span>
            <ExternalLink className="w-3 h-3 text-white/80" />
          </button>
        </div>
      </div>
    </div>
  );
};
