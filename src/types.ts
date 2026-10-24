export interface AndroidStartAppBridge {
  showRewardedVideo?: () => void;
  showInterstitial?: () => void;
  isNativeApp?: () => boolean;
}

declare global {
  interface Window {
    AndroidStartApp?: AndroidStartAppBridge;
    Android?: AndroidStartAppBridge;
    onRewardedVideoClosed?: () => void;
  }
}

export type AdType = 'rewarded' | 'interstitial' | 'banner';
