import React from 'react';
import { X, Lock, ExternalLink, Globe } from 'lucide-react';

interface CustomTabModalProps {
  url: string | null;
  onClose: () => void;
}

export const CustomTabModal: React.FC<CustomTabModalProps> = ({ url, onClose }) => {
  if (!url) return null;

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  return (
    <div
      id="custom-tab-container"
      className="fixed inset-0 z-[90] flex flex-col bg-black/90 backdrop-blur-md animate-in fade-in zoom-in-95 duration-200"
    >
      {/* Chrome Custom Tab Top Toolbar */}
      <div className="h-14 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between px-4 text-white select-none shadow-md">
        {/* Left: Close Button (returns to exact spot on HDSKay) */}
        <button
          id="close-custom-tab-btn"
          type="button"
          onClick={onClose}
          className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 text-sm"
          title="Close Custom Tab"
        >
          <X className="w-5 h-5" />
          <span className="hidden sm:inline text-xs font-medium text-slate-400">Back to App</span>
        </button>

        {/* Center: Security Badge & URL Bar */}
        <div className="flex items-center gap-2 max-w-[65%] truncate bg-slate-900/90 border border-slate-700/60 rounded-full px-3.5 py-1.5 text-xs">
          <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-slate-200 font-mono truncate">{hostname}</span>
          <span className="text-[10px] uppercase font-bold text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded ml-1 border border-sky-800/60 shrink-0">
            Custom Tab
          </span>
        </div>

        {/* Right: External Link Option */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 -mr-2 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          title="Open in new window"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Embedded Web View */}
      <div className="flex-1 w-full h-full relative bg-slate-950 overflow-hidden">
        <iframe
          src={url}
          title="Custom Tab Content"
          className="w-full h-full border-none m-0 p-0 block bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        />
      </div>
    </div>
  );
};
