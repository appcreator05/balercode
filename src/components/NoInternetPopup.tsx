import React, { useState } from 'react';
import { WifiOff, RotateCcw, AlertTriangle } from 'lucide-react';

interface NoInternetPopupProps {
  isOpen: boolean;
  onRetry: () => void;
  onClose?: () => void;
}

export const NoInternetPopup: React.FC<NoInternetPopupProps> = ({
  isOpen,
  onRetry,
  onClose,
}) => {
  const [isRetrying, setIsRetrying] = useState(false);

  if (!isOpen) return null;

  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      setIsRetrying(false);
      onRetry();
    }, 600);
  };

  return (
    <div
      id="no-internet-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="bg-[#111827] border border-gray-800 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl flex flex-col items-center">
        {/* Glowing Wifi Off Icon */}
        <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mb-4 animate-pulse">
          <WifiOff className="w-8 h-8" />
        </div>

        {/* Title */}
        <h3 className="text-white text-xl font-bold tracking-tight mb-2">
          No Internet Connection
        </h3>

        {/* Subtitle */}
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          Please check your Wi-Fi or mobile data network and try again.
        </p>

        {/* Retry Button */}
        <button
          id="retry-internet-btn"
          type="button"
          onClick={handleRetry}
          disabled={isRetrying}
          className="w-full py-3.5 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-sky-600/30 disabled:opacity-60 cursor-pointer"
        >
          <RotateCcw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Checking connection...' : 'Retry Connection'}
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 text-xs text-gray-500 hover:text-gray-400 underline cursor-pointer"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};
