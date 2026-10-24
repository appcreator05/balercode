import React, { useEffect, useState } from 'react';
import { ExternalLink, Sparkles, X } from 'lucide-react';
import { STARTIO_REAL_CAMPAIGNS } from '../data/movies';
import { reportStartIoInteraction } from '../utils/startIoAndroidBridge';

interface StartIoBannerAdProps {
  position?: 'bottom' | 'top' | 'fullscreen-overlay';
  appId?: string;
  onAdClick?: () => void;
  onAdImpression?: () => void;
  customAdUrl?: string;
  className?: string;
  style?: React.CSSProperties;
  showCloseButton?: boolean;
}

export const StartIoBannerAd: React.FC<StartIoBannerAdProps> = ({
  position = 'bottom',
  appId = '208187630',
  onAdClick,
  onAdImpression,
  customAdUrl,
  className = '',
  style,
  showCloseButton = false
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [activeAdIndex, setActiveAdIndex] = useState(0);
  const onAdImpressionRef = React.useRef(onAdImpression);

  useEffect(() => {
    onAdImpressionRef.current = onAdImpression;
  }, [onAdImpression]);

  useEffect(() => {
    onAdImpressionRef.current?.();
    reportStartIoInteraction('impression', `banner-${position}`);
    const interval = setInterval(() => {
      setActiveAdIndex((prev) => (prev + 1) % STARTIO_REAL_CAMPAIGNS.length);
      onAdImpressionRef.current?.();
      reportStartIoInteraction('impression', `banner-${position}`);
    }, 18000);
    return () => clearInterval(interval);
  }, [position]);

  if (!isVisible) return null;

  const currentAd = STARTIO_REAL_CAMPAIGNS[activeAdIndex] || STARTIO_REAL_CAMPAIGNS[0];
  const targetUrl = customAdUrl?.trim() || currentAd.ctaUrl;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    reportStartIoInteraction('click', `banner-${position}`);
    onAdClick?.();
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVisible(false);
  };

  const isOverlay = position === 'fullscreen-overlay';

  const containerClasses = isOverlay
    ? `relative w-[320px] h-[50px] min-w-[320px] max-w-[320px] max-h-[50px] bg-[#0c101a]/95 backdrop-blur-md border border-cyan-500/50 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.85)] flex items-center justify-between px-2 overflow-hidden pointer-events-auto select-none ${className}`
    : `fixed ${position === 'bottom' ? 'bottom-0' : 'top-14'} left-1/2 -translate-x-1/2 z-[2147483647] w-[320px] h-[50px] min-w-[320px] max-w-[320px] max-h-[50px] bg-[#0c101a]/95 backdrop-blur-md border border-cyan-500/40 rounded-t-lg shadow-2xl flex items-center justify-between px-2 overflow-hidden pointer-events-auto ${className}`;

  return (
    <div
      id={isOverlay ? 'startio-fullscreen-banner-container' : 'startio-banner-container'}
      className={containerClasses}
      style={style}
    >
      {/* 320x50 Ad Content */}
      <div
        onClick={handleClick}
        className="w-full h-full flex items-center justify-between gap-2 cursor-pointer overflow-hidden group select-none"
      >
        <img
          src={currentAd.icon}
          alt={currentAd.title}
          className="w-8 h-8 rounded-lg object-cover border border-gray-700 shrink-0 group-hover:scale-105 transition-transform"
        />

        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1">
            <span className="bg-amber-500/20 text-amber-300 text-[8px] font-black uppercase px-1 py-0.2 rounded border border-amber-500/30">
              AD
            </span>
            <span className="text-[11px] font-bold text-white truncate group-hover:text-cyan-400 transition-colors">
              {currentAd.title}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 truncate">
            {currentAd.description}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="shrink-0 bg-red-600 group-hover:bg-red-500 text-white font-black text-[10px] px-2 py-1 rounded transition-all flex items-center gap-0.5 shadow-md"
          >
            <span>{currentAd.ctaText}</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </button>

          {showCloseButton && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-gray-800/80 transition-colors"
              title="Close Ad"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
