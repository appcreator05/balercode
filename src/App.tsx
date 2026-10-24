import React, { useState, useEffect, useRef } from 'react';
import { StartIoBanner } from './components/StartIoBanner';
import { StartIoRewardedVideo } from './components/StartIoRewardedVideo';
import { StartIoInterstitial } from './components/StartIoInterstitial';
import { NoInternetPopup } from './components/NoInternetPopup';
import { CustomTabModal } from './components/CustomTabModal';
import { Maximize2, Minimize2, WifiOff } from 'lucide-react';

const START_IO_APP_ID = '203877183';
const TARGET_URL = 'https://hdskay.blogspot.com';
const REQUIRED_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K; AppSecret123) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

export default function App() {
  const [currentUrl, setCurrentUrl] = useState<string>(
    `/api/proxy?url=${encodeURIComponent(TARGET_URL)}&ua=${encodeURIComponent(REQUIRED_USER_AGENT)}`
  );
  const [isLoading, setIsLoading] = useState(true);

  // Fullscreen Rewarded Video Ad state: triggers on initial open and every page transition
  const [showRewarded, setShowRewarded] = useState<boolean>(true);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  // Interstitial Ad state: triggers automatically every 10 minutes
  const [showInterstitial, setShowInterstitial] = useState<boolean>(false);

  // Chrome Custom Tab state for external / extra links
  const [customTabUrl, setCustomTabUrl] = useState<string | null>(null);

  // Offline / No Internet state
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState<boolean>(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Splash Screen preview state
  const [showSplash, setShowSplash] = useState<boolean>(true);

  // Auto hide splash screen after 2.5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  // Listen for navigation & Custom Tab messages from the proxied iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      // 1. Internal Blog navigation -> Show rewarded video ad and load
      if (event.data.type === 'HDSKAY_PAGE_NAV') {
        const target = event.data.targetUrl;
        if (target) {
          setPendingUrl(target);
          setShowRewarded(true);
        }
      }

      // 2. Extra / External link click -> Open in Chrome Custom Tab!
      if (event.data.type === 'HDSKAY_OPEN_CUSTOM_TAB') {
        const externalTarget = event.data.targetUrl;
        if (externalTarget) {
          setCustomTabUrl(externalTarget);
        }
      }

      // 3. HTML5 Video Fullscreen state change
      if (event.data.type === 'HDSKAY_FULLSCREEN_CHANGE') {
        const isFs = Boolean(event.data.isFullscreen);
        setIsVideoFullscreen(isFs);

        // Attempt screen orientation lock to landscape during video fullscreen
        try {
          if (isFs && screen.orientation && typeof (screen.orientation as any).lock === 'function') {
            (screen.orientation as any).lock('landscape').catch(() => {});
          } else if (!isFs && screen.orientation && typeof screen.orientation.unlock === 'function') {
            screen.orientation.unlock();
          }
        } catch {}
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Monitor network connectivity changes
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Monitor Fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keep Screen Awake (Wake Lock API) whenever the app is open
  useEffect(() => {
    let wakeLockSentinel: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        }
      } catch {
        // Can be ignored if window is minimized or not allowed
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, []);

  // 10-Minute Interstitial Ad Interval (10 * 60 * 1000 = 600,000 ms)
  useEffect(() => {
    const interval = setInterval(() => {
      setShowInterstitial(true);
    }, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Dismiss Rewarded Video Ad and immediately load the destination page
  const handleRewardedClose = () => {
    setShowRewarded(false);
    if (pendingUrl) {
      setCurrentUrl(pendingUrl);
      setPendingUrl(null);
      setIsLoading(true);
    }
  };

  // Toggle true Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleRetryInternet = () => {
    if (navigator.onLine) {
      setIsOffline(false);
      // Popup disappears without reloading the page
    } else {
      setIsOffline(true);
    }
  };

  return (
    <div className="w-screen h-screen m-0 p-0 overflow-hidden bg-[#000000] relative flex flex-col justify-between select-none">
      {/* Top Loading Progress Indicator */}
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-transparent z-50 overflow-hidden">
          <div className="h-full bg-sky-500 animate-pulse w-full duration-700" />
        </div>
      )}

      {/* Main WebView Window (True Edge-to-Edge Fullscreen) */}
      <div className="w-full flex-1 relative overflow-hidden bg-black">
        <iframe
          id="webview-frame"
          ref={iframeRef}
          src={currentUrl}
          title="HDSKay WebView"
          className="w-full h-full border-none m-0 p-0 block"
          style={{ scrollbarWidth: 'none' }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          onLoad={() => setIsLoading(false)}
        />
      </div>

      {/* Floating Control: Fullscreen Toggle & Test Offline Trigger (Hidden during video fullscreen) */}
      {!isVideoFullscreen && (
        <div className="absolute top-3 right-3 z-40 flex items-center gap-2">
          {/* Test Offline Simulator Button */}
          <button
            id="simulate-offline-btn"
            type="button"
            onClick={() => setIsOffline(prev => !prev)}
            className="bg-black/70 hover:bg-black/90 text-gray-300 hover:text-white border border-gray-700/60 p-2 rounded-full backdrop-blur-md text-xs flex items-center gap-1 shadow-lg transition-all cursor-pointer"
            title="Test No Internet Popup"
          >
            <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline text-[11px] pr-1">Test Offline</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            id="toggle-fullscreen-btn"
            type="button"
            onClick={toggleFullscreen}
            className="bg-black/70 hover:bg-black/90 text-gray-300 hover:text-white border border-gray-700/60 p-2 rounded-full backdrop-blur-md shadow-lg transition-all cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Immersive Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
            )}
          </button>
        </div>
      )}

      {/* Persistent Start.io Bottom Banner Ad (Hidden during fullscreen video play) */}
      {!isVideoFullscreen && !isFullscreen && (
        <StartIoBanner appId={START_IO_APP_ID} />
      )}

      {/* Chrome Custom Tab Modal (Opens when extra/external links are clicked) */}
      <CustomTabModal
        url={customTabUrl}
        onClose={() => setCustomTabUrl(null)}
      />

      {/* Custom "No Internet Connection" Popup Modal */}
      <NoInternetPopup
        isOpen={isOffline}
        onRetry={handleRetryInternet}
        onClose={() => setIsOffline(false)}
      />

      {/* Fullscreen Rewarded Video Ad (shows on every page open; user skips to reveal page) */}
      {showRewarded && (
        <StartIoRewardedVideo
          appId={START_IO_APP_ID}
          onClose={handleRewardedClose}
        />
      )}

      {/* Interstitial Ad (shows every 10 minutes) */}
      {showInterstitial && (
        <StartIoInterstitial
          appId={START_IO_APP_ID}
          onClose={() => setShowInterstitial(false)}
        />
      )}

      {/* Cinematic Splash Screen Overlay */}
      {showSplash && (
        <div
          id="app-splash-screen"
          className="fixed inset-0 z-[120] bg-black flex items-center justify-center transition-opacity duration-500 overflow-hidden"
          onClick={() => setShowSplash(false)}
        >
          <img
            src="/splash.png"
            alt="Movie App Splash Screen"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center animate-in fade-in zoom-in-95 duration-500"
          />
        </div>
      )}
    </div>
  );
}
