import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, X, Star, ExternalLink, Play } from 'lucide-react';

interface StartIoRewardedVideoProps {
  appId: string;
  onClose: () => void;
}

export const StartIoRewardedVideo: React.FC<StartIoRewardedVideoProps> = ({
  appId: _appId,
  onClose,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(5);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [hasVideoError, setHasVideoError] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // If running inside Android APK with native StartApp SDK, trigger native rewarded video
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.AndroidStartApp &&
      typeof window.AndroidStartApp.showRewardedVideo === 'function'
    ) {
      try {
        window.AndroidStartApp.showRewardedVideo();
      } catch (err) {
        console.error('AndroidStartApp.showRewardedVideo failed:', err);
      }
    }

    // Native app callback when native video ad finishes
    window.onRewardedVideoClosed = () => {
      onClose();
    };

    return () => {
      window.onRewardedVideoClosed = undefined;
    };
  }, [onClose]);

  // 5-second countdown timer before user can skip
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Try autoplaying video on mount
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Autoplay policy fallback: keep muted and play
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().catch(() => setIsPlaying(false));
          }
        });
    }
  }, []);

  const handleTimeUpdate = () => {
    if (videoRef.current && videoRef.current.duration) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration;
      setProgressPercent((current / total) * 100);
    }
  };

  const handleVideoEnded = () => {
    setSecondsRemaining(0);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleAdClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open('https://www.start.io', '_blank', 'noopener,noreferrer');
  };

  const canSkip = secondsRemaining === 0;

  const effectiveProgress =
    videoRef.current && videoRef.current.duration
      ? progressPercent
      : ((5 - secondsRemaining) / 5) * 100;

  return (
    <div
      id="startio-rewarded-video-overlay"
      className="fixed inset-0 z-[99999] bg-black flex flex-col justify-between select-none overflow-hidden"
    >
      {/* Top Header Bar */}
      <div className="absolute top-0 inset-x-0 z-30 p-3 sm:p-4 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        {/* Ad Tag & Sound Control */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider text-slate-200 bg-black/60 border border-white/20 backdrop-blur-md">
            Ad
          </span>
          <button
            type="button"
            onClick={toggleMute}
            className="w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition-transform active:scale-90"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-slate-300" />
            ) : (
              <Volume2 className="w-4 h-4 text-sky-400" />
            )}
          </button>
        </div>

        {/* Skip / Reward Counter on Top Right */}
        <div>
          {canSkip ? (
            <button
              id="skip-rewarded-ad-btn"
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-sm rounded-full shadow-2xl shadow-red-900/60 border border-white/30 transform active:scale-95 transition-all cursor-pointer animate-pulse"
            >
              <span>Skip Ad</span>
              <X className="w-4 h-4 stroke-[3]" />
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 border border-white/20 rounded-full text-xs text-white font-semibold backdrop-blur-md">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping inline-block" />
              <span>Reward in {secondsRemaining}s</span>
            </div>
          )}
        </div>
      </div>

      {/* Real Fullscreen / Center Video Player or Cinematic Ad Preview */}
      <div
        className="w-full h-full relative flex items-center justify-center bg-black cursor-pointer overflow-hidden"
        onClick={togglePlay}
      >
        {!hasVideoError ? (
          <video
            ref={videoRef}
            src="/ad-video.mp4"
            className="w-full h-full object-contain max-h-screen"
            autoPlay
            playsInline
            muted={isMuted}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnded}
            onError={() => setHasVideoError(true)}
            loop
          />
        ) : (
          <div className="relative w-full h-full flex flex-col items-center justify-center bg-radial from-slate-900 via-zinc-950 to-black p-6 text-center">
            <div className="relative mb-6">
              <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 blur-xl rounded-full" />
              <div className="relative w-28 h-28 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-2xl border border-white/20">
                <span className="text-5xl">🎬</span>
              </div>
            </div>
            <h2 className="text-2xl font-black text-white tracking-wide mb-2">
              Cinema Plus 4K & HD Stream
            </h2>
            <p className="text-sm text-slate-400 max-w-sm">
              Watch unlimited movies, web series, and live television streams in ultra HD quality.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-sky-300 border border-white/10">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>4.9 / 5.0 Rated by 250,000+ Viewers</span>
            </div>
          </div>
        )}

        {/* Play indicator if paused and video loaded */}
        {!hasVideoError && !isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs">
            <div className="w-16 h-16 rounded-full bg-sky-500/90 text-white flex items-center justify-center shadow-2xl pl-1">
              <Play className="w-8 h-8 fill-white" />
            </div>
          </div>
        )}
      </div>

      {/* Video Progress Bar (Thin line at bottom of video) */}
      <div className="absolute bottom-[68px] sm:bottom-[76px] inset-x-0 h-1 bg-white/20 z-20 overflow-hidden">
        <div
          className="h-full bg-sky-400 transition-all duration-150"
          style={{ width: `${effectiveProgress}%` }}
        />
      </div>

      {/* Bottom Sponsor Card Overlay */}
      <div className="absolute bottom-0 inset-x-0 z-30 p-2 sm:p-3 bg-gradient-to-t from-black via-black/90 to-transparent flex items-center justify-between gap-3">
        {/* App / Sponsor Details */}
        <div
          className="flex items-center gap-3 cursor-pointer truncate"
          onClick={handleAdClick}
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 via-sky-500 to-emerald-400 p-0.5 shadow-lg shrink-0">
            <div className="w-full h-full bg-[#0e121a] rounded-[10px] flex items-center justify-center text-lg font-black text-white">
              🎬
            </div>
          </div>
          <div className="flex flex-col text-left truncate">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide truncate">
                Cinema Plus 4K & HD Stream
              </span>
              <div className="hidden sm:flex items-center text-amber-400 text-xs gap-0.5">
                <Star className="w-3 h-3 fill-amber-400" />
                <span className="font-bold">4.9</span>
              </div>
            </div>
            <span className="text-xs text-slate-300 truncate">
              Watch unlimited movies, web series & games in 4K
            </span>
          </div>
        </div>

        {/* CTA Install Button */}
        <button
          type="button"
          onClick={handleAdClick}
          className="shrink-0 px-4 sm:px-6 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 active:scale-95 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-lg shadow-sky-600/30 flex items-center gap-1.5 transition-transform"
        >
          <span>INSTALL NOW</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
