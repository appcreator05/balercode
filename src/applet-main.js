import './no-internet.js';
import BUNDLED_CATALOG from './data/userCatalog8468988.json';
import CURATED_CLOUD_CATALOG from './data/curatedCloudCatalog.json';
import {
    subscriptionDb,
    checkActiveSubscription,
    checkAndHandleSubscriptionExpiry,
    getCachedIsSubscribed,
    getDeviceId,
    saveSubscriptionToFirebase,
    payAndActivate,
    showCustomAlert,
    hideCustomAlert,
    SUBSCRIPTION_PLANS,
    applySubscriptionUserAgent,
    SUBSCRIPTION_USER_AGENT,
    listenToActiveSession
} from './services/subscriptionService';
import { ref, get } from 'firebase/database';

// ==========================================
// VIP SUBSCRIPTION & 100% AD-FREE ENGINE
// ==========================================
// Block external YouTube app launches or popups
if (typeof window !== 'undefined') {
    const originalWindowOpen = window.open;
    window.open = function(url, target, features) {
        if (typeof url === 'string' && (url.includes('youtube.com') || url.includes('youtu.be') || url.startsWith('vnd.youtube'))) {
            return null;
        }
        return originalWindowOpen ? originalWindowOpen.apply(this, arguments) : null;
    };
}

let isInSubscriptionView = false;
let homeCachedHTML = "";
let adRefreshTimer = null;
let isSmartlinkInterstitialActive = false;
let isPopunderActive = false;
window.__isVipSubscribed = getCachedIsSubscribed();

let activeSessionUnsub = null;
let currentListeningSafeId = null;

function setupSessionListener(safeId) {
    if (!safeId) return;
    if (activeSessionUnsub && currentListeningSafeId === safeId) return;
    teardownSessionListener();
    currentListeningSafeId = safeId;
    try {
        activeSessionUnsub = listenToActiveSession(safeId, (reason) => {
            window.__isVipSubscribed = false;
            teardownSessionListener();
            updateVipAdSuppression();
            if (typeof window.showSessionKickedModal === 'function') {
                window.showSessionKickedModal(reason);
            }
            if (isInSubscriptionView && typeof renderSubscriptionPage === 'function') {
                renderSubscriptionPage();
            }
        });
    } catch (e) {
        console.warn('Could not setup session listener:', e);
    }
}

function teardownSessionListener() {
    if (typeof activeSessionUnsub === 'function') {
        try { activeSessionUnsub(); } catch (e) {}
    }
    activeSessionUnsub = null;
    currentListeningSafeId = null;
}

async function refreshSubscriptionState() {
    try {
        const res = await checkActiveSubscription();
        window.__isVipSubscribed = res.isSubscribed;
    } catch (e) {
        window.__isVipSubscribed = getCachedIsSubscribed();
    }
    updateVipAdSuppression();
    if (isInSubscriptionView && typeof renderSubscriptionPage === 'function') {
        renderSubscriptionPage();
    }
}
setInterval(refreshSubscriptionState, 15000);
setTimeout(refreshSubscriptionState, 500);
window.addEventListener('DOMContentLoaded', updateVipAdSuppression);
updateVipAdSuppression();

function updateVipAdSuppression() {
    const isVip = !!window.__isVipSubscribed;

    if (isVip) {
        if (document.body) document.body.classList.add('vip-active');
        if (document.documentElement) document.documentElement.classList.add('vip-active');

        // Immediately remove and purge all ad elements from the DOM
        if (typeof document !== 'undefined') {
            const adElements = document.querySelectorAll('.ad-slot-300x250, .ad-label, #fixedFooterAdContainer, #playerUnderAdSlot, .interstitial-modal, #smartlinkInterstitialModal, #popunderInterstitialModal');
            adElements.forEach(el => {
                try {
                    if (el.id === 'fixedFooterAdContainer') {
                        el.style.display = 'none';
                        const inner = document.getElementById('fixedFooterAdInner');
                        if (inner) inner.innerHTML = '';
                    } else if (el.id === 'playerUnderAdSlot') {
                        el.innerHTML = '';
                        const parent = el.closest('.ad-slot-300x250');
                        if (parent) parent.remove();
                    } else {
                        el.remove();
                    }
                } catch (e) {
                    el.style.display = 'none';
                }
            });
        }

        // Invalidate cached home HTML so non-VIP cached ads can never be re-injected
        homeCachedHTML = "";

        // Cancel ad refresh timer
        if (adRefreshTimer) {
            clearTimeout(adRefreshTimer);
            adRefreshTimer = null;
        }

        // Close any active interstitial
        if (typeof closeSmartlinkInterstitial === 'function' && isSmartlinkInterstitialActive) {
            closeSmartlinkInterstitial();
        }
        if (typeof closePopunderInterstitial === 'function' && isPopunderActive) {
            closePopunderInterstitial();
        }
    } else {
        if (document.body) document.body.classList.remove('vip-active');
        if (document.documentElement) document.documentElement.classList.remove('vip-active');
        const footerAd = document.getElementById('fixedFooterAdContainer');
        if (footerAd) {
            footerAd.style.display = 'flex';
        }
    }

    // Update VIP menu item in dropdown
    const vipItem = document.getElementById('vipMenuItem');
    const vipText = document.getElementById('vipMenuText');
    const vipBadge = document.getElementById('vipMenuBadge');
    if (vipItem && vipText && vipBadge) {
        if (isVip) {
            vipItem.classList.add('active');
            vipText.innerHTML = '<i class="fa-solid fa-shield-halved" style="color: #34d399; margin-right: 8px;"></i> VIP Subscription Active';
            vipBadge.textContent = 'ACTIVE';
            vipBadge.className = 'vip-badge-pill active';
        } else {
            vipItem.classList.remove('active');
            vipText.innerHTML = '<i class="fa-solid fa-crown" style="color: #FFD700; margin-right: 8px;"></i> VIP Subscription (No Ads)';
            vipBadge.textContent = 'VIP';
            vipBadge.className = 'vip-badge-pill';
        }
    }
}
window.updateVipAdSuppression = updateVipAdSuppression;

// ==========================================
// CHROME APP OPENER & CUSTOM TABS (SMARTLINK, ADS, EXTERNAL LINKS)
// ==========================================
window.openCustomTab = function(url) {
    if (!url) return false;

    // 1. Android APK Native Bridge with CustomTabs
    if (window.Android) {
        if (typeof window.Android.openCustomTab === 'function') {
            try { window.Android.openCustomTab(url); return true; } catch (e) {}
        }
        if (typeof window.Android.openChromeDirectly === 'function') {
            try { window.Android.openChromeDirectly(url); return true; } catch (e) {}
        }
        if (typeof window.Android.openInChrome === 'function') {
            try { window.Android.openInChrome(url); return true; } catch (e) {}
        }
        if (typeof window.Android.openExternalUrl === 'function') {
            try { window.Android.openExternalUrl(url); return true; } catch (e) {}
        }
        if (typeof window.Android.openUrl === 'function') {
            try { window.Android.openUrl(url); return true; } catch (e) {}
        }
    }

    // 2. Fallback to openInChrome / Web navigation
    return window.openInChrome(url);
};

window.openInChrome = function(url) {
    if (!url) return;

    // 1. Android APK Native Bridge (directly opens Chrome app via Android Intent)
    if (window.Android) {
        if (typeof window.Android.openChromeDirectly === 'function') {
            try { window.Android.openChromeDirectly(url); return true; } catch (e) {}
        }
        if (typeof window.Android.openInChrome === 'function') {
            try { window.Android.openInChrome(url); return true; } catch (e) {}
        }
        if (typeof window.Android.openExternalUrl === 'function') {
            try { window.Android.openExternalUrl(url); return true; } catch (e) {}
        }
        if (typeof window.Android.openUrl === 'function') {
            try { window.Android.openUrl(url); return true; } catch (e) {}
        }
    }

    const isAndroid = /Android/i.test(navigator.userAgent);
    const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edge|OPR|Samsung/i.test(navigator.userAgent);

    // 2. If in another Android browser, try Chrome app intent
    if (isAndroid && !isChrome) {
        try {
            const cleanUrl = url.replace(/^https?:\/\//, '');
            const intentUrl = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
            const intentA = document.createElement('a');
            intentA.href = intentUrl;
            document.body.appendChild(intentA);
            intentA.click();
            setTimeout(() => {
                try { document.body.removeChild(intentA); } catch (e) {}
            }, 100);
        } catch (e) {}
    }

    // 3. Fallback: standard browser navigation / new tab
    try {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            try { document.body.removeChild(a); } catch (e) {}
        }, 300);
        return true;
    } catch (e) {
        try {
            window.open(url, '_blank', 'noopener,noreferrer');
            return true;
        } catch (err) {
            try {
                window.location.assign(url);
            } catch (err2) {}
        }
    }
    return false;
};

// ==========================================
// KEEP SCREEN ALWAYS ON & TRUE FULLSCREEN (WAKE LOCK + STATUS BAR HIDE)
// ==========================================
let appWakeLockSentinel = null;

async function requestContinuousWakeLock() {
    // 1. Android APK Native Bridge (Keep screen awake & Hide System Navigation Bars)
    if (window.Android) {
        try {
            if (typeof window.Android.keepScreenOn === 'function') {
                window.Android.keepScreenOn(true);
            }
            if (typeof window.Android.hideSystemBars === 'function') {
                window.Android.hideSystemBars();
            }
        } catch (e) {}
    }

    // 2. Hide Capacitor Status Bar & Navigation Bar dynamically on app load/visibility (Native mobile only)
    const isNativePlatform = Boolean(
        (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
        window.Android ||
        window.AndroidInterface
    );

    if (isNativePlatform) {
        try {
            const { StatusBar } = await import('@capacitor/status-bar');
            if (StatusBar) {
                await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
                await StatusBar.hide().catch(() => {});
            }
        } catch (e) {}

        try {
            const { NavigationBar } = await import('@capawesome/capacitor-navigation-bar');
            if (NavigationBar) {
                await NavigationBar.hide().catch(() => {});
            }
        } catch (e) {}

        try {
            const { Fullscreen } = await import('@boengli/capacitor-fullscreen');
            if (Fullscreen) {
                await Fullscreen.activateImmersiveMode().catch(() => {});
            }
        } catch (e) {}
    }

    // 3. Web Screen Wake Lock API
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && typeof navigator.wakeLock.request === 'function') {
        try {
            if (!appWakeLockSentinel || appWakeLockSentinel.released) {
                appWakeLockSentinel = await navigator.wakeLock.request('screen');
                appWakeLockSentinel.addEventListener('release', () => {
                    appWakeLockSentinel = null;
                });
            }
        } catch (err) {
            // Tab is inactive or battery policy restricted
        }
    }
}

// Ensure screen stays awake while app is open
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            requestContinuousWakeLock();
        }
    });
    window.addEventListener('DOMContentLoaded', requestContinuousWakeLock);
    window.addEventListener('load', requestContinuousWakeLock);
    document.addEventListener('click', requestContinuousWakeLock, { passive: true });
    document.addEventListener('touchstart', requestContinuousWakeLock, { passive: true });
    // Initial triggers
    requestContinuousWakeLock();
    setTimeout(requestContinuousWakeLock, 800);
}

let dbCache;
const DB_NAME = "MoviePosterDB";
const DB_VERSION = 2;

const openDB = () => {
    return new Promise((resolve) => {
        if (dbCache) return resolve(dbCache);
        if (typeof window === 'undefined' || !window.indexedDB) {
            return resolve(null);
        }
        try {
            const request = window.indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                try {
                    let db = e.target.result;
                    if (!db.objectStoreNames.contains("images")) {
                        db.createObjectStore("images");
                    }
                    if (!db.objectStoreNames.contains("catalog")) {
                        db.createObjectStore("catalog");
                    }
                } catch (err) {}
            };
            request.onsuccess = (e) => {
                dbCache = e.target.result;
                resolve(dbCache);
            };
            request.onerror = () => {
                dbCache = null;
                resolve(null);
            };
            request.onblocked = () => {
                dbCache = null;
                resolve(null);
            };
        } catch (err) {
            dbCache = null;
            resolve(null);
        }
    });
};

async function getCachedMoviesFromDB() {
    // 1. Check openDB IndexedDB catalog store
    const dbMovies = await new Promise((resolve) => {
        if (!dbCache) return resolve(null);
        try {
            if (!dbCache.objectStoreNames.contains("catalog")) return resolve(null);
            const tx = dbCache.transaction("catalog", "readonly");
            const store = tx.objectStore("catalog");
            const req = store.get("cached_movies_list");
            req.onsuccess = () => {
                if (Array.isArray(req.result) && req.result.length > 0) {
                    resolve(req.result);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

    if (dbMovies && dbMovies.length > 0) return dbMovies;

    // 2. Fallback to localStorage
    try {
        const stored = localStorage.getItem("vdosky_offline_catalog");
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {}

    return null;
}

async function saveMoviesToDB(movies) {
    if (!Array.isArray(movies) || movies.length === 0) return;
    try {
        localStorage.setItem("vdosky_offline_catalog", JSON.stringify(movies.slice(0, 1500)));
    } catch (e) {}

    if (!dbCache) return;
    try {
        if (!dbCache.objectStoreNames.contains("catalog")) return;
        const tx = dbCache.transaction("catalog", "readwrite");
        const store = tx.objectStore("catalog");
        store.put(movies, "cached_movies_list");
    } catch (err) {
        console.warn("Could not save movies to openDB:", err);
    }
}

async function getCachedImage(url) {
    return new Promise((resolve) => {
        if (!dbCache) return resolve(null);
        try {
            const tx = dbCache.transaction("images", "readonly");
            const store = tx.objectStore("images");
            const req = store.get(url);
            req.onsuccess = () => {
                if (req.result) {
                    resolve(URL.createObjectURL(req.result));
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function saveImage(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const tx = dbCache.transaction("images", "readwrite");
        const store = tx.objectStore("images");
        store.put(blob, url);
        return URL.createObjectURL(blob);
    } catch {
        return url;
    }
}

async function getImage(url) {
    const cached = await getCachedImage(url);
    if (cached) return cached;
    return await saveImage(url);
}

let allMovies = [];
let isInCategoryView = false;
let isPlayerView = false;
let isInCloudStreamView = false;
let isInCommentView = false;
let isInGameView = false;
let isInAdminView = false;
let isInGpsCameraView = false;
let isInPdfView = false;
let isInExtraToolsView = false;
let isInStore35View = false;
let isInGifMakerView = false;
let isInVoiceRecorderView = false;
let isInSketchView = false;
let isInCompressorView = false;
let isInMp3TrimmerView = false;
let isInQrCodeView = false;
let isInCoolTextView = false;
let isInTranslatorView = false;
let currentCompressorFile = null;
let currentCompressorImg = null;
let originalImages = [];
let currentPdfDoc = null;
let currentPdfPageNum = 1;
let currentPdfScale = 1.0;
let currentPdfRotation = 0;
let currentPdfFileName = "document.pdf";
let currentPdfBytes = null;
let isPdfRendering = false;
let pdfPagePending = null;
let currentPlayingMovie = null;
let currentCategoryName = "all";
let savedScrollPosition = 0;

// Show Toast Notification
function showToast(msg) {
    const toast = document.getElementById('toastNotice');
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 2500);
}
window.showToast = showToast;

const GITHUB_LIVE_MOVIES_URL = "https://raw.githubusercontent.com/appcreator05/post/refs/heads/main/8468988.json";

// Live sync from user's GitHub repository
async function fetchJsonFromEndpoint(url) {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
        try { abortController.abort(); } catch (e) {}
    }, 6000);

    try {
        // Simple CORS request: No custom headers like Cache-Control/Pragma to avoid 403 Forbidden on raw.githubusercontent.com
        const response = await fetch(url, {
            signal: abortController.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        // If GitHub API contents endpoint is used, decode base64
        if (url.includes("api.github.com")) {
            const apiRes = await response.json();
            if (apiRes && apiRes.content) {
                const decoded = atob(apiRes.content.replace(/\s/g, ''));
                const parsed = JSON.parse(decoded);
                return Array.isArray(parsed) ? parsed : null;
            }
            return null;
        }

        const data = await response.json();
        return Array.isArray(data) ? data : null;
    } catch (e) {
        clearTimeout(timeoutId);
        return null;
    }
}

async function syncMoviesFromGitHub(isManual = false) {
    const cacheBuster = `_t=${Date.now()}`;
    const REMOTE_ENDPOINTS = [
        `https://raw.githubusercontent.com/appcreator05/post/refs/heads/main/8468988.json?${cacheBuster}`,
        `https://raw.githubusercontent.com/appcreator05/post/main/8468988.json?${cacheBuster}`,
        `https://api.github.com/repos/appcreator05/post/contents/8468988.json?${cacheBuster}`
    ];

    for (const endpoint of REMOTE_ENDPOINTS) {
        try {
            const freshMovies = await fetchJsonFromEndpoint(endpoint);
            if (freshMovies && Array.isArray(freshMovies) && freshMovies.length > 0) {
                const countDiff = freshMovies.length - (allMovies ? allMovies.length : 0);
                const isFirstDiff = allMovies && allMovies.length > 0 && (
                    freshMovies[0]?.title !== allMovies[0]?.title ||
                    freshMovies[0]?.video !== allMovies[0]?.video ||
                    freshMovies[0]?.yt !== allMovies[0]?.yt
                );
                const isLastDiff = allMovies && allMovies.length > 0 && (
                    freshMovies[freshMovies.length - 1]?.title !== allMovies[allMovies.length - 1]?.title
                );
                const hasChanged = (countDiff !== 0) || isFirstDiff || isLastDiff || isManual;

                allMovies = freshMovies;
                saveMoviesToDB(freshMovies);

                if (hasChanged) {
                    if (!isPlayerView) {
                        if (isInCategoryView) {
                            renderCategoryView(currentCategoryName);
                        } else {
                            await renderContent(allMovies);
                        }
                    }
                    if (countDiff > 0) {
                        showToast(`Updated: ${countDiff} new movie${countDiff > 1 ? 's' : ''} synced!`);
                    } else if (isManual) {
                        showToast(`Synced ${freshMovies.length} movies live!`);
                    }
                }
                // Automatically close menu bar when posts are loaded
                if (isManual) {
                    const dropdown = document.getElementById("dropdownMenu");
                    if (dropdown && dropdown.classList.contains("active")) {
                        dropdown.classList.remove("active");
                    }
                }
                return true;
            }
        } catch (endpointErr) {
            console.warn(`Fetch error for ${endpoint}:`, endpointErr);
        }
    }
    // Also close menu bar if sync finished
    if (isManual) {
        const dropdown = document.getElementById("dropdownMenu");
        if (dropdown && dropdown.classList.contains("active")) {
            dropdown.classList.remove("active");
        }
    }
    return false;
}

window.syncMoviesFromGitHub = syncMoviesFromGitHub;
window.refreshMoviesFromGitHub = async function(showFeedback = true) {
    if (showFeedback) showToast("Checking for new posts...");
    const result = await syncMoviesFromGitHub(true);
    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }
    return result;
};

async function fetchMovies() {
    let hasLoadedAndRendered = false;

    try {
        await openDB();

        // 1. Instant Initial Load: Compare cached DB with bundled catalog
        const cachedFromDB = await getCachedMoviesFromDB();
        let initialMovies = BUNDLED_CATALOG;

        // If cached DB has strictly more movies than bundled catalog, use it
        if (cachedFromDB && Array.isArray(cachedFromDB) && cachedFromDB.length > (BUNDLED_CATALOG ? BUNDLED_CATALOG.length : 0)) {
            initialMovies = cachedFromDB;
        } else if (BUNDLED_CATALOG && Array.isArray(BUNDLED_CATALOG) && BUNDLED_CATALOG.length > 0) {
            // Bundled catalog is fresh and has all latest movies (including Robin Hood 2018)
            initialMovies = BUNDLED_CATALOG;
            saveMoviesToDB(BUNDLED_CATALOG);
        }

        if (initialMovies && Array.isArray(initialMovies) && initialMovies.length > 0) {
            allMovies = initialMovies;
            hasLoadedAndRendered = true;
            if (!checkInitialRoute()) {
                await renderContent(allMovies);
            }
            const spinner = document.getElementById('globalSpinner');
            if (spinner) spinner.style.display = 'none';
        }

        // 2. Direct Live Fetch from User GitHub JSON (with cache buster and multi-mirror fallback)
        await syncMoviesFromGitHub(false);

    } catch (err) {
        console.warn("Error in fetchMovies:", err);
        if (!hasLoadedAndRendered && BUNDLED_CATALOG && BUNDLED_CATALOG.length > 0) {
            allMovies = BUNDLED_CATALOG;
            if (!checkInitialRoute()) {
                await renderContent(allMovies);
            }
        }
    } finally {
        const spinner = document.getElementById('globalSpinner');
        if (spinner) spinner.style.display = 'none';
    }
}

let currentPlyrInstance = null;
let currentActiveServerIndex = 0;
let currentYtPlayerInstance = null;
let autoNextTimer = null;
let isAutoNextEnabled = true;
let isAutoNextTransitioning = false;
let wasFullscreenBeforeNext = false;
let isManualPlayerFullscreen = false;
try {
    const savedAutoNext = localStorage.getItem('vdosky_auto_next');
    if (savedAutoNext !== null) {
        isAutoNextEnabled = (savedAutoNext !== 'false');
    }
} catch (e) {}

let currentCloudFilteredList = [];

// PostMessage listener for YouTube iframe video ended event
window.addEventListener('message', (event) => {
    if (!event || !event.data) return;
    try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data) {
            if ((data.event === 'onStateChange' || data.type === 'onStateChange') && (data.info === 0 || data.data === 0 || data.info === '0' || data.data === '0')) {
                handleVideoEnded();
            }
        }
    } catch (e) {}
});

function destroyCurrentPlyr(preserveFullscreen = false) {
    if (typeof stopYtTimelineSync === 'function') {
        stopYtTimelineSync();
    }
    if (!preserveFullscreen && !isAutoNextTransitioning && !wasFullscreenBeforeNext) {
        unlockScreenOrientation();
    }
    if (autoNextTimer) {
        clearInterval(autoNextTimer);
        autoNextTimer = null;
    }
    const overlay = document.getElementById('playerEndedOverlay');
    if (overlay) overlay.remove();

    const menu = document.getElementById('ytSettingsMenu');
    if (menu) menu.style.display = 'none';
    const exitDirectBtn = document.getElementById('ytExitDirectTouch');
    if (exitDirectBtn) exitDirectBtn.style.display = 'none';

    if (currentYtPlayerInstance) {
        try {
            if (typeof currentYtPlayerInstance.destroy === 'function') {
                currentYtPlayerInstance.destroy();
            }
        } catch (e) {}
        currentYtPlayerInstance = null;
    }
    if (currentPlyrInstance) {
        try {
            currentPlyrInstance.destroy();
        } catch (e) {
            console.warn("Error destroying Plyr instance:", e);
        }
        currentPlyrInstance = null;
    }
}

function getNextPlayableItem() {
    if (!currentPlayingMovie) return null;

    if (isInCloudStreamView) {
        const list = (currentCloudFilteredList && currentCloudFilteredList.length > 0) 
            ? currentCloudFilteredList 
            : (typeof CURATED_CLOUD_CATALOG !== 'undefined' ? CURATED_CLOUD_CATALOG : []);
        if (list.length === 0) return null;
        
        const currentIdx = list.findIndex(item => (item.yt && item.yt === currentPlayingMovie.yt) || item.title === currentPlayingMovie.title);
        if (currentIdx !== -1) {
            return list[(currentIdx + 1) % list.length];
        }
        return list[0];
    } else {
        const sameCat = allMovies.filter(m => m.category === currentPlayingMovie.category && m.title !== currentPlayingMovie.title);
        if (sameCat.length > 0) {
            return sameCat[0];
        }
        const globalIdx = allMovies.findIndex(m => m.title === currentPlayingMovie.title);
        if (globalIdx !== -1 && allMovies.length > 1) {
            return allMovies[(globalIdx + 1) % allMovies.length];
        }
        return allMovies[0] || null;
    }
}

function handleVideoEnded() {
    if (autoNextTimer) {
        clearInterval(autoNextTimer);
        autoNextTimer = null;
    }
    
    const box = document.getElementById('activePlayerBox');
    if (!box) return;

    // Detect if user was watching in fullscreen or landscape orientation
    const wasFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        (box && (box.classList.contains('is-fullscreen') || box.classList.contains('plyr-force-landscape'))) ||
        (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active) ||
        isAutoNextTransitioning ||
        wasFullscreenBeforeNext
    );

    if (wasFs) {
        isAutoNextTransitioning = true;
        wasFullscreenBeforeNext = true;
        box.classList.add('is-fullscreen');
        if (window.innerHeight > window.innerWidth) {
            box.classList.add('plyr-force-landscape');
        }
        lockLandscapeOrientation();
        updateFullscreenButtonState(true);
    }

    const nextItem = getNextPlayableItem();
    let nextTitle = 'Next Video';
    if (currentPlayingMovie && Array.isArray(currentPlayingMovie.episodes) && currentPlayingMovie.episodes.length > 0) {
        const curEpIdx = window.currentActiveEpisodeIndex || 0;
        if (curEpIdx < currentPlayingMovie.episodes.length - 1) {
            const nextEp = currentPlayingMovie.episodes[curEpIdx + 1];
            nextTitle = (typeof nextEp === 'object' && nextEp ? (nextEp.title || nextEp.name) : '') || `Episode ${curEpIdx + 2}`;
        } else if (nextItem) {
            nextTitle = nextItem.title || nextItem.name || 'Next Video';
        }
    } else if (nextItem) {
        nextTitle = nextItem.title || nextItem.name || 'Next Video';
    }

    const existingOverlay = document.getElementById('playerEndedOverlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'playerEndedOverlay';
    overlay.className = 'player-ended-overlay';

    if (isAutoNextEnabled) {
        let countdown = 2;
        overlay.innerHTML = `
            <div class="player-ended-card">
                <div class="player-ended-badge"><i class="fa-solid fa-forward-step"></i> Auto Next</div>
                <div class="player-ended-next-title">${nextTitle}</div>
                <div class="player-ended-timer-ring">Playing next in <span id="autoNextCount" class="player-ended-timer-count">${countdown}</span>s...</div>
                <div class="player-ended-buttons">
                    <button class="ended-btn-primary" onclick="playNextVideo(true)">
                        <i class="fa-solid fa-play"></i> Play Now
                    </button>
                    <button class="ended-btn-secondary" onclick="cancelAutoNext()">
                        <i class="fa-solid fa-xmark"></i> Cancel
                    </button>
                </div>
            </div>
        `;
        box.appendChild(overlay);

        const countEl = document.getElementById('autoNextCount');
        const interval = setInterval(() => {
            countdown--;
            if (countEl) countEl.innerText = countdown;
            if (countdown <= 0) {
                clearInterval(interval);
                autoNextTimer = null;
                playNextVideo(true);
            }
        }, 1000);

        autoNextTimer = interval;
    } else {
        overlay.innerHTML = `
            <div class="player-ended-card">
                <div class="player-ended-badge"><i class="fa-solid fa-circle-check"></i> Stream Finished</div>
                <div class="player-ended-next-title">${nextTitle}</div>
                <div class="player-ended-buttons">
                    <button class="ended-btn-primary" onclick="playNextVideo(true)">
                        <i class="fa-solid fa-forward-step"></i> Play Next
                    </button>
                    <button class="ended-btn-secondary" onclick="replayCurrentVideo()">
                        <i class="fa-solid fa-rotate-left"></i> Replay
                    </button>
                </div>
            </div>
        `;
        box.appendChild(overlay);
    }
}

window.playNextVideo = function(immediate = false) {
    if (autoNextTimer) {
        clearInterval(autoNextTimer);
        autoNextTimer = null;
    }
    const overlay = document.getElementById('playerEndedOverlay');
    if (overlay) overlay.remove();

    const activeBox = document.getElementById('activePlayerBox');
    const wasFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        (activeBox && (activeBox.classList.contains('is-fullscreen') || activeBox.classList.contains('plyr-force-landscape'))) ||
        (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active) ||
        isAutoNextTransitioning ||
        wasFullscreenBeforeNext
    );

    if (wasFs) {
        isAutoNextTransitioning = true;
        wasFullscreenBeforeNext = true;
        if (activeBox) {
            activeBox.classList.add('is-fullscreen');
            if (window.innerHeight > window.innerWidth) {
                activeBox.classList.add('plyr-force-landscape');
            }
        }
        lockLandscapeOrientation();
        updateFullscreenButtonState(true);
    }

    // If currently watching a web series, advance to the next episode in the playlist!
    if (currentPlayingMovie && Array.isArray(currentPlayingMovie.episodes) && currentPlayingMovie.episodes.length > 0) {
        const curEpIdx = window.currentActiveEpisodeIndex || 0;
        if (curEpIdx < currentPlayingMovie.episodes.length - 1) {
            window.switchEpisode(curEpIdx + 1, wasFs);
            return;
        }
    }

    const nextItem = getNextPlayableItem();
    if (!nextItem) {
        showToast("No next video in queue");
        return;
    }

    // Seamless in-place transition for YouTube videos:
    // Retains fullscreen, landscape lock, and prevents exiting to portrait mode
    const currentYtIframe = document.getElementById('vdoSkyYouTube');
    const sourceInfo = detectMovieVideoSource(nextItem);
    const isNextYt = (sourceInfo.type === 'yt') || (nextItem.yt && nextItem.yt.length > 0);

    if (activeBox && currentYtIframe && isNextYt) {
        currentPlayingMovie = nextItem;
        const titleText = nextItem.title || nextItem.name || 'Cloud Stream';

        // Update titles in top shield and below player
        const shieldTitle = document.querySelector('.yt-shield-top-title');
        if (shieldTitle) shieldTitle.innerText = titleText;
        const movieTitle = document.querySelector('.player-movie-title');
        if (movieTitle) movieTitle.innerText = titleText;

        // Update rating & category badges
        const ratingBadge = document.querySelector('.badge-rating');
        if (ratingBadge) ratingBadge.innerText = `★ ${nextItem.rating || '4.8'}`;
        const catBadge = document.querySelector('.badge-category');
        if (catBadge) catBadge.innerText = nextItem.category || 'General';

        // Update active server info
        const servers = getMovieServers(nextItem);
        const activeServer = servers[0];
        currentActiveServerIndex = 0;

        // Load new video into YouTube player without breaking fullscreen or DOM
        if (currentYtPlayerInstance && typeof currentYtPlayerInstance.loadVideoById === 'function') {
            try {
                currentYtPlayerInstance.loadVideoById({
                    videoId: sourceInfo.id,
                    startSeconds: 0
                });
            } catch (e) {
                currentYtIframe.src = activeServer.url;
            }
        } else {
            currentYtIframe.src = activeServer.url;
        }

        // Update stream server selector buttons
        const serverSelector = document.querySelector('.server-selector');
        if (serverSelector) {
            const serverPills = servers.map((s, idx) => `
                <button class="server-pill ${idx === 0 ? 'active' : ''}" onclick="switchServer(${idx})">
                    <i class="fa-solid ${s.type === 'yt' ? 'fa-play' : 'fa-server'}"></i> ${s.name}
                </button>
            `).join('');
            serverSelector.innerHTML = `
                <span class="server-label"><i class="fa-solid fa-bolt"></i> Stream Server:</span>
                ${serverPills}
                <div class="auto-next-server-wrap">
                    <button type="button" class="auto-next-pill-btn ${isAutoNextEnabled ? 'active' : ''}" onclick="toggleAutoNext()" title="Toggle Auto Next">
                        <i class="fa-solid ${isAutoNextEnabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                        <span>Auto Next: <strong>${isAutoNextEnabled ? 'ON' : 'OFF'}</strong></span>
                    </button>
                    <button type="button" class="quick-next-btn" onclick="playNextVideo(true)" title="Play Next Stream">
                        <i class="fa-solid fa-forward-step"></i> Next
                    </button>
                </div>
            `;
        }

        if (wasFs) {
            maintainFullscreenLandscape();
        }

        try {
            window.history.replaceState({ view: 'player', title: titleText }, '');
        } catch (e) {}
        showToast("Playing next: " + titleText);
        return;
    }

    // Seamless in-place transition for Plyr player (Worker stream, direct mp4, Drive ID)
    const currentPlyrVideo = document.getElementById('vdoSkyPlyr');
    const isNextGDrive = (sourceInfo.type === 'gdrive');
    const isNextPlyr = (sourceInfo.type === 'video' || sourceInfo.type === 'drc') && !isNextYt && !isNextGDrive;

    if (activeBox && currentPlyrInstance && currentPlyrVideo && isNextPlyr) {
        currentPlayingMovie = nextItem;
        window.currentActiveEpisodeIndex = 0;
        const titleText = nextItem.title || nextItem.name || 'Movie Player';
        const servers = getMovieServers(nextItem);
        const activeServer = servers[0] || { url: sourceInfo.url, name: 'Server 1' };
        currentActiveServerIndex = 0;

        currentPlyrInstance.source = {
            type: 'video',
            title: titleText,
            sources: [
                {
                    src: activeServer.url,
                    type: 'video/mp4'
                }
            ],
            poster: nextItem.poster || ''
        };
        currentPlyrInstance.play().catch(() => {});

        const movieTitle = document.querySelector('.player-movie-title');
        if (movieTitle) movieTitle.innerText = titleText;
        const ratingBadge = document.querySelector('.badge-rating');
        if (ratingBadge) ratingBadge.innerText = `★ ${nextItem.rating || '4.8'}`;
        const catBadge = document.querySelector('.badge-category');
        if (catBadge) catBadge.innerText = nextItem.category || 'General';

        const serverSelector = document.querySelector('.server-selector');
        if (serverSelector) {
            const serverPills = servers.map((s, idx) => `
                <button class="server-pill ${idx === 0 ? 'active' : ''}" onclick="switchServer(${idx})">
                    <i class="fa-solid fa-server"></i> ${s.name}
                </button>
            `).join('');
            serverSelector.innerHTML = `
                <span class="server-label"><i class="fa-solid fa-bolt"></i> Stream Server:</span>
                ${serverPills}
                <div class="auto-next-server-wrap">
                    <button type="button" class="auto-next-pill-btn ${isAutoNextEnabled ? 'active' : ''}" onclick="toggleAutoNext()" title="Toggle Auto Next">
                        <i class="fa-solid ${isAutoNextEnabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                        <span>Auto Next: <strong>${isAutoNextEnabled ? 'ON' : 'OFF'}</strong></span>
                    </button>
                    <button type="button" class="quick-next-btn" onclick="playNextVideo(true)" title="Play Next Stream">
                        <i class="fa-solid fa-forward-step"></i> Next
                    </button>
                </div>
            `;
        }

        if (wasFs) {
            maintainFullscreenLandscape();
        }
        showToast("Playing next: " + titleText);
        return;
    }

    // Seamless in-place transition for Google Drive Preview iframe
    const currentGDriveIframe = document.getElementById('vdoSkyGDrive');
    if (activeBox && currentGDriveIframe && isNextGDrive) {
        currentPlayingMovie = nextItem;
        window.currentActiveEpisodeIndex = 0;
        const titleText = nextItem.title || nextItem.name || 'Movie Player';
        const servers = getMovieServers(nextItem);
        const activeServer = servers[0] || { url: sourceInfo.url, name: 'Server 1' };
        currentActiveServerIndex = 0;

        currentGDriveIframe.src = activeServer.url;

        const movieTitle = document.querySelector('.player-movie-title');
        if (movieTitle) movieTitle.innerText = titleText;
        const ratingBadge = document.querySelector('.badge-rating');
        if (ratingBadge) ratingBadge.innerText = `★ ${nextItem.rating || '4.8'}`;
        const catBadge = document.querySelector('.badge-category');
        if (catBadge) catBadge.innerText = nextItem.category || 'General';

        if (wasFs) {
            maintainFullscreenLandscape();
        }
        showToast("Playing next: " + titleText);
        return;
    }

    if (isInCloudStreamView) {
        playCloudStreamVideo(nextItem, wasFs);
    } else {
        window.openPlayer(nextItem, wasFs);
    }
    showToast("Playing next: " + (nextItem.title || nextItem.name || 'Stream'));
};

window.cancelAutoNext = function() {
    if (autoNextTimer) {
        clearInterval(autoNextTimer);
        autoNextTimer = null;
    }
    const overlay = document.getElementById('playerEndedOverlay');
    if (overlay) {
        const nextItem = getNextPlayableItem();
        const nextTitle = nextItem ? (nextItem.title || nextItem.name) : 'Next Stream';
        overlay.innerHTML = `
            <div class="player-ended-card">
                <div class="player-ended-badge"><i class="fa-solid fa-circle-check"></i> Stream Finished</div>
                <div class="player-ended-next-title">${nextTitle}</div>
                <div class="player-ended-buttons">
                    <button class="ended-btn-primary" onclick="playNextVideo(true)">
                        <i class="fa-solid fa-forward-step"></i> Play Next
                    </button>
                    <button class="ended-btn-secondary" onclick="replayCurrentVideo()">
                        <i class="fa-solid fa-rotate-left"></i> Replay
                    </button>
                </div>
            </div>
        `;
    }
};

window.replayCurrentVideo = function() {
    const overlay = document.getElementById('playerEndedOverlay');
    if (overlay) overlay.remove();

    if (currentYtPlayerInstance && typeof currentYtPlayerInstance.seekTo === 'function') {
        try {
            currentYtPlayerInstance.seekTo(0, true);
            currentYtPlayerInstance.playVideo();
            return;
        } catch (e) {}
    }
    if (currentPlyrInstance) {
        try {
            currentPlyrInstance.currentTime = 0;
            currentPlyrInstance.play();
            return;
        } catch (e) {}
    }
    if (currentPlayingMovie) {
        renderPlayerSection(currentPlayingMovie, currentActiveServerIndex);
    }
};

window.toggleAutoNext = function(forceVal) {
    if (typeof forceVal === 'boolean') {
        isAutoNextEnabled = forceVal;
    } else {
        isAutoNextEnabled = !isAutoNextEnabled;
    }
    try {
        localStorage.setItem('vdosky_auto_next', isAutoNextEnabled ? 'true' : 'false');
    } catch (e) {}

    updateAutoNextUI();
    showToast(isAutoNextEnabled ? "Auto Next: Enabled" : "Auto Next: Disabled");
};

function updateAutoNextUI() {
    document.querySelectorAll('.auto-next-pill-btn').forEach(btn => {
        btn.classList.toggle('active', isAutoNextEnabled);
        const textSpan = btn.querySelector('strong');
        if (textSpan) textSpan.innerText = isAutoNextEnabled ? 'ON' : 'OFF';
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = `fa-solid ${isAutoNextEnabled ? 'fa-toggle-on' : 'fa-toggle-off'}`;
        }
    });
}

let ytTimelineSyncInterval = null;
let isUserDraggingTimeline = false;
let ytControlsTimer = null;
let isYtControlsVisible = false;

window.showYtShieldControls = function(resetTimer = true) {
    const shield = document.getElementById('ytBottomShield');
    const topShield = document.getElementById('ytTopShield');
    const box = document.getElementById('activePlayerBox');
    if (!shield && !box) return;

    isYtControlsVisible = true;
    if (shield) shield.classList.add('yt-shield-visible');
    if (topShield) topShield.classList.add('yt-shield-visible');
    if (box) box.classList.add('show-yt-controls');

    if (resetTimer) {
        window.resetYtControlsTimeout(5000);
    }
};

window.hideYtShieldControls = function() {
    if (isUserDraggingTimeline) return;
    const menu = document.getElementById('ytSettingsMenu');
    if (menu && menu.style.display !== 'none') return; // Keep visible while settings menu is open

    isYtControlsVisible = false;
    const shield = document.getElementById('ytBottomShield');
    const topShield = document.getElementById('ytTopShield');
    const box = document.getElementById('activePlayerBox');

    if (shield) shield.classList.remove('yt-shield-visible');
    if (topShield) topShield.classList.remove('yt-shield-visible');
    if (box) box.classList.remove('show-yt-controls');

    if (ytControlsTimer) {
        clearTimeout(ytControlsTimer);
        ytControlsTimer = null;
    }
};

let currentYtSelectedQuality = 'auto';
try {
    currentYtSelectedQuality = localStorage.getItem('vdosky_yt_quality') || 'auto';
} catch (e) {}

let currentYtSelectedSpeed = 1;
try {
    currentYtSelectedSpeed = parseFloat(localStorage.getItem('vdosky_yt_speed')) || 1;
} catch (e) {}

window.syncYtQualityUI = function() {
    const list = document.getElementById('ytQualityList');
    if (list) {
        list.querySelectorAll('.yt-quality-item').forEach(item => {
            const q = item.dataset.quality;
            const check = item.querySelector('.yt-q-check');
            if (q === currentYtSelectedQuality) {
                item.classList.add('active');
                if (check) check.style.display = 'inline-block';
            } else {
                item.classList.remove('active');
                if (check) check.style.display = 'none';
            }
        });
    }

    document.querySelectorAll('.yt-speed-btn').forEach(btn => {
        const s = parseFloat(btn.dataset.speed);
        if (s === currentYtSelectedSpeed) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
};

window.toggleYtQualitySettings = function(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const menu = document.getElementById('ytSettingsMenu');
    if (!menu) return;
    const isShowing = menu.style.display !== 'none';
    if (isShowing) {
        window.closeYtSettingsMenu();
    } else {
        menu.style.display = 'flex';
        window.showYtShieldControls(false); // keep controls visible without hiding
        window.syncYtQualityUI();
    }
};

window.closeYtSettingsMenu = function(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const menu = document.getElementById('ytSettingsMenu');
    if (menu) menu.style.display = 'none';
    window.resetYtControlsTimeout(4000);
};

window.setYtVideoQuality = function(qualityLevel, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    currentYtSelectedQuality = qualityLevel;
    try {
        localStorage.setItem('vdosky_yt_quality', qualityLevel);
    } catch (e) {}

    if (currentYtPlayerInstance) {
        try {
            if (typeof currentYtPlayerInstance.setPlaybackQualityRange === 'function') {
                currentYtPlayerInstance.setPlaybackQualityRange(qualityLevel, qualityLevel);
            }
            if (typeof currentYtPlayerInstance.setPlaybackQuality === 'function') {
                currentYtPlayerInstance.setPlaybackQuality(qualityLevel);
            }
        } catch (e) {
            console.warn('Could not set YouTube quality level:', e);
        }
    }

    window.syncYtQualityUI();

    const labelMap = {
        'auto': 'Auto (Best)',
        'hd1080': '1080p Full HD',
        'hd720': '720p HD',
        'large': '480p SD',
        'medium': '360p Standard',
        'small': '240p Data Saver'
    };
    showToast(`Quality: ${labelMap[qualityLevel] || qualityLevel}`);
    setTimeout(() => {
        window.closeYtSettingsMenu();
    }, 300);
};

window.setYtPlaybackSpeed = function(speed, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    currentYtSelectedSpeed = speed;
    try {
        localStorage.setItem('vdosky_yt_speed', String(speed));
    } catch (e) {}

    if (currentYtPlayerInstance && typeof currentYtPlayerInstance.setPlaybackRate === 'function') {
        try {
            currentYtPlayerInstance.setPlaybackRate(speed);
        } catch (e) {
            console.warn('Could not set YouTube playback rate:', e);
        }
    }

    window.syncYtQualityUI();
    showToast(`Playback Speed: ${speed}x`);
};

window.enableDirectYtTouch = function(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    window.closeYtSettingsMenu();
    const touchSurface = document.getElementById('ytTouchSurface');
    if (touchSurface) {
        touchSurface.style.pointerEvents = 'none';
    }
    const bottomShield = document.getElementById('ytBottomShield');
    if (bottomShield) {
        bottomShield.classList.remove('yt-shield-visible');
    }
    const exitBanner = document.getElementById('ytExitDirectTouch');
    if (exitBanner) {
        exitBanner.style.display = 'flex';
    }
    showToast('YouTube Touch Enabled. Tap "Restore Controls" anytime.');
};

window.disableDirectYtTouch = function(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const touchSurface = document.getElementById('ytTouchSurface');
    if (touchSurface) {
        touchSurface.style.pointerEvents = 'auto';
    }
    const exitBanner = document.getElementById('ytExitDirectTouch');
    if (exitBanner) {
        exitBanner.style.display = 'none';
    }
    window.showYtShieldControls(true);
    showToast('App player controls restored');
};

function applyStoredYtPreferences() {
    if (!currentYtPlayerInstance) return;
    try {
        if (currentYtSelectedQuality && currentYtSelectedQuality !== 'auto') {
            if (typeof currentYtPlayerInstance.setPlaybackQualityRange === 'function') {
                currentYtPlayerInstance.setPlaybackQualityRange(currentYtSelectedQuality, currentYtSelectedQuality);
            }
            if (typeof currentYtPlayerInstance.setPlaybackQuality === 'function') {
                currentYtPlayerInstance.setPlaybackQuality(currentYtSelectedQuality);
            }
        }
        if (currentYtSelectedSpeed && currentYtSelectedSpeed !== 1) {
            if (typeof currentYtPlayerInstance.setPlaybackRate === 'function') {
                currentYtPlayerInstance.setPlaybackRate(currentYtSelectedSpeed);
            }
        }
    } catch (e) {}
}

window.toggleYtShieldControls = function() {
    if (isYtControlsVisible) {
        window.hideYtShieldControls();
    } else {
        window.showYtShieldControls(true);
    }
};

window.resetYtControlsTimeout = function(delay = 5000) {
    if (ytControlsTimer) {
        clearTimeout(ytControlsTimer);
    }
    ytControlsTimer = setTimeout(() => {
        window.hideYtShieldControls();
    }, delay);
};

function formatTimelineTime(sec) {
    if (!sec || isNaN(sec) || sec < 0) return '00:00';
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) {
        return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function startYtTimelineSync() {
    stopYtTimelineSync();
    ytTimelineSyncInterval = setInterval(updateYtTimelineProgress, 300);
}

function stopYtTimelineSync() {
    if (ytTimelineSyncInterval) {
        clearInterval(ytTimelineSyncInterval);
        ytTimelineSyncInterval = null;
    }
    if (ytControlsTimer) {
        clearTimeout(ytControlsTimer);
        ytControlsTimer = null;
    }
}

function updateYtTimelineProgress() {
    if (isUserDraggingTimeline) return;
    let current = 0;
    let duration = 0;
    let loadedFraction = 0;
    let isPlaying = false;

    if (currentYtPlayerInstance && typeof currentYtPlayerInstance.getCurrentTime === 'function') {
        try {
            current = currentYtPlayerInstance.getCurrentTime() || 0;
            duration = currentYtPlayerInstance.getDuration() || 0;
            if (typeof currentYtPlayerInstance.getVideoLoadedFraction === 'function') {
                loadedFraction = currentYtPlayerInstance.getVideoLoadedFraction() || 0;
            }
            if (typeof currentYtPlayerInstance.getPlayerState === 'function') {
                const st = currentYtPlayerInstance.getPlayerState();
                isPlaying = (st === 1);
            }
        } catch (e) {}
    } else if (currentPlyrInstance) {
        try {
            current = currentPlyrInstance.currentTime || 0;
            duration = currentPlyrInstance.duration || 0;
            loadedFraction = currentPlyrInstance.buffered || 0;
            isPlaying = currentPlyrInstance.playing;
        } catch (e) {}
    }

    const progressEl = document.getElementById('ytTimelineProgress');
    const bufferEl = document.getElementById('ytTimelineBuffer');
    const currentText = document.getElementById('ytCurrentTime');
    const durationText = document.getElementById('ytDuration');
    const playIcon = document.getElementById('ytPlayPauseIcon');

    if (progressEl && duration > 0) {
        const percent = Math.min(100, Math.max(0, (current / duration) * 100));
        progressEl.style.width = percent + '%';
    }
    if (bufferEl && loadedFraction > 0) {
        bufferEl.style.width = Math.min(100, Math.max(0, loadedFraction * 100)) + '%';
    }
    if (currentText) currentText.textContent = formatTimelineTime(current);
    if (durationText && duration > 0) durationText.textContent = formatTimelineTime(duration);
    if (playIcon) {
        playIcon.className = isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    }
}

window.skipVideoSeconds = function(deltaSeconds) {
    if (typeof window.showYtShieldControls === 'function') {
        window.showYtShieldControls(true);
    }
    if (currentYtPlayerInstance && typeof currentYtPlayerInstance.getCurrentTime === 'function') {
        try {
            const cur = currentYtPlayerInstance.getCurrentTime() || 0;
            const dur = currentYtPlayerInstance.getDuration() || 0;
            const target = Math.max(0, Math.min(dur || 999999, cur + deltaSeconds));
            currentYtPlayerInstance.seekTo(target, true);
            updateYtTimelineProgress();
            window.showTimelineFeedback(`${deltaSeconds > 0 ? '+' : ''}${deltaSeconds}s`);
        } catch (e) {}
    } else if (currentPlyrInstance) {
        try {
            currentPlyrInstance.currentTime = Math.max(0, Math.min(currentPlyrInstance.duration || 999999, (currentPlyrInstance.currentTime || 0) + deltaSeconds));
            updateYtTimelineProgress();
            window.showTimelineFeedback(`${deltaSeconds > 0 ? '+' : ''}${deltaSeconds}s`);
        } catch (e) {}
    }
};

window.toggleYtPlayPause = function() {
    if (typeof window.showYtShieldControls === 'function') {
        window.showYtShieldControls(true);
    }
    if (currentYtPlayerInstance && typeof currentYtPlayerInstance.getPlayerState === 'function') {
        try {
            const state = currentYtPlayerInstance.getPlayerState();
            if (state === 1) {
                currentYtPlayerInstance.pauseVideo();
            } else {
                currentYtPlayerInstance.playVideo();
            }
        } catch (e) {}
    } else if (currentPlyrInstance) {
        try {
            currentPlyrInstance.togglePlay();
        } catch (e) {}
    }
};

window.showTimelineFeedback = function(text) {
    const isForward = text.includes('+');
    const animEl = document.getElementById(isForward ? 'ytSkipRightAnim' : 'ytSkipLeftAnim');
    if (animEl) {
        animEl.classList.remove('active');
        void animEl.offsetWidth;
        animEl.classList.add('active');
        setTimeout(() => animEl.classList.remove('active'), 650);
    }
};

window.handleTimelineClick = function(event) {
    if (typeof window.showYtShieldControls === 'function') {
        window.showYtShieldControls(true);
    }
    seekTimelineFromEvent(event);
};

function seekTimelineFromEvent(event) {
    const container = document.getElementById('ytTimelineContainer');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clientX = event.clientX !== undefined ? event.clientX : (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

    if (currentYtPlayerInstance && typeof currentYtPlayerInstance.getDuration === 'function') {
        try {
            const dur = currentYtPlayerInstance.getDuration() || 0;
            if (dur > 0) {
                const target = ratio * dur;
                currentYtPlayerInstance.seekTo(target, true);
                const progressEl = document.getElementById('ytTimelineProgress');
                if (progressEl) progressEl.style.width = (ratio * 100) + '%';
                const currentText = document.getElementById('ytCurrentTime');
                if (currentText) currentText.textContent = formatTimelineTime(target);
            }
        } catch (e) {}
    } else if (currentPlyrInstance && currentPlyrInstance.duration) {
        try {
            currentPlyrInstance.currentTime = ratio * currentPlyrInstance.duration;
        } catch (e) {}
    }
}

window.handleTimelineHover = function(e) {
    const container = document.getElementById('ytTimelineContainer');
    const tooltip = document.getElementById('ytTimelineTooltip');
    if (!container || !tooltip) return;
    const rect = container.getBoundingClientRect();
    const clientX = e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

    let duration = 0;
    if (currentYtPlayerInstance && typeof currentYtPlayerInstance.getDuration === 'function') {
        duration = currentYtPlayerInstance.getDuration() || 0;
    } else if (currentPlyrInstance && currentPlyrInstance.duration) {
        duration = currentPlyrInstance.duration;
    }

    if (duration > 0) {
        const hoverTime = ratio * duration;
        tooltip.textContent = formatTimelineTime(hoverTime);
        tooltip.style.left = (ratio * 100) + '%';
        tooltip.style.opacity = '1';
    }
};

window.handleTimelineLeave = function() {
    const tooltip = document.getElementById('ytTimelineTooltip');
    if (tooltip) tooltip.style.opacity = '0';
};

function initTimelineDragEvents() {
    const container = document.getElementById('ytTimelineContainer');
    if (!container || container.__hasDragListeners) return;
    container.__hasDragListeners = true;

    const onPointerMove = (e) => {
        if (!isUserDraggingTimeline) return;
        if (typeof window.showYtShieldControls === 'function') {
            window.showYtShieldControls(false);
        }
        const rect = container.getBoundingClientRect();
        const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

        let duration = 0;
        if (currentYtPlayerInstance && typeof currentYtPlayerInstance.getDuration === 'function') {
            duration = currentYtPlayerInstance.getDuration() || 0;
        } else if (currentPlyrInstance && currentPlyrInstance.duration) {
            duration = currentPlyrInstance.duration;
        }

        if (duration > 0) {
            const target = ratio * duration;
            const progressEl = document.getElementById('ytTimelineProgress');
            const currentText = document.getElementById('ytCurrentTime');
            if (progressEl) progressEl.style.width = (ratio * 100) + '%';
            if (currentText) currentText.textContent = formatTimelineTime(target);
        }
    };

    const onPointerUp = (e) => {
        if (isUserDraggingTimeline) {
            isUserDraggingTimeline = false;
            seekTimelineFromEvent(e);
            if (typeof window.resetYtControlsTimeout === 'function') {
                window.resetYtControlsTimeout(5000);
            }
        }
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('touchend', onPointerUp);
    };

    container.addEventListener('mousedown', (e) => {
        isUserDraggingTimeline = true;
        if (typeof window.showYtShieldControls === 'function') {
            window.showYtShieldControls(false);
        }
        seekTimelineFromEvent(e);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
    });

    container.addEventListener('touchstart', (e) => {
        isUserDraggingTimeline = true;
        if (typeof window.showYtShieldControls === 'function') {
            window.showYtShieldControls(false);
        }
        seekTimelineFromEvent(e);
        window.addEventListener('touchmove', onPointerMove, { passive: true });
        window.addEventListener('touchend', onPointerUp);
    }, { passive: true });
}

function initPlayerTouchControls() {
    const box = document.getElementById('activePlayerBox');
    const touchSurface = document.getElementById('ytTouchSurface') || box;
    const bottomShield = document.getElementById('ytBottomShield');
    const topShield = document.getElementById('ytTopShield');

    if (!touchSurface) return;

    // Show controls initially for 5 seconds, then slide down automatically
    window.showYtShieldControls(true);

    // Keep controls alive & reset 5-second timer when interacting with bottom shield
    if (bottomShield && !bottomShield.__hasTouchShieldListeners) {
        bottomShield.__hasTouchShieldListeners = true;
        const events = ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mousemove', 'click'];
        events.forEach(evt => {
            bottomShield.addEventListener(evt, () => {
                if (!isUserDraggingTimeline) {
                    window.resetYtControlsTimeout(5000);
                }
            }, { passive: true });
        });
    }

    // Keep controls alive & reset 5-second timer when interacting with top shield
    if (topShield && !topShield.__hasTouchShieldListeners) {
        topShield.__hasTouchShieldListeners = true;
        const events = ['touchstart', 'click'];
        events.forEach(evt => {
            topShield.addEventListener(evt, () => {
                window.resetYtControlsTimeout(5000);
            }, { passive: true });
        });
    }

    if (touchSurface.__hasTouchControlsListeners) return;
    touchSurface.__hasTouchControlsListeners = true;

    let lastTapTime = 0;
    let lastTapX = 0;
    let singleTapTimeout = null;

    // Handle touch on the screen (Mobile)
    touchSurface.addEventListener('touchend', (e) => {
        const now = Date.now();
        const touch = e.changedTouches && e.changedTouches[0];
        if (!touch) return;
        const rect = touchSurface.getBoundingClientRect();
        const tapX = touch.clientX - rect.left;

        if (now - lastTapTime < 320 && Math.abs(tapX - lastTapX) < 90) {
            // Double tap detected: cancel single tap
            if (singleTapTimeout) {
                clearTimeout(singleTapTimeout);
                singleTapTimeout = null;
            }
            lastTapTime = 0;

            if (tapX < rect.width * 0.45) {
                window.skipVideoSeconds(-10);
            } else if (tapX > rect.width * 0.55) {
                window.skipVideoSeconds(10);
            } else {
                window.toggleYtPlayPause();
            }
            window.showYtShieldControls(true);
        } else {
            // Single tap: toggle / show bottom shield for 5 seconds
            lastTapTime = now;
            lastTapX = tapX;

            if (singleTapTimeout) clearTimeout(singleTapTimeout);
            singleTapTimeout = setTimeout(() => {
                singleTapTimeout = null;
                window.toggleYtShieldControls();
            }, 260);
        }
    }, { passive: false });

    // Desktop click handling
    touchSurface.addEventListener('click', (e) => {
        if (e.detail <= 1) {
            window.toggleYtShieldControls();
        }
    });

    touchSurface.addEventListener('mousemove', () => {
        window.showYtShieldControls(true);
    });

    if (box && !box.__hasMouseLeaveListener) {
        box.__hasMouseLeaveListener = true;
        box.addEventListener('mouseleave', () => {
            if (isYtControlsVisible && !isUserDraggingTimeline) {
                window.resetYtControlsTimeout(1800);
            }
        });
    }
}

function initPlayerDoubleTapSkip() {
    initPlayerTouchControls();
}

// Global keyboard shortcuts for video skip and play/pause
document.addEventListener('keydown', (e) => {
    const box = document.getElementById('activePlayerBox');
    if (!box) return;
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        window.skipVideoSeconds(-10);
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        window.skipVideoSeconds(10);
    } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        window.toggleYtPlayPause();
    }
});

function setupYouTubePlayer(iframeId) {
    if (currentYtPlayerInstance) {
        try {
            if (typeof currentYtPlayerInstance.destroy === 'function') {
                currentYtPlayerInstance.destroy();
            }
        } catch (e) {}
        currentYtPlayerInstance = null;
    }

    const onPlayerStateChange = (event) => {
        updateYtTimelineProgress();
        if (event && (event.data === 0 || (window.YT && event.data === window.YT.PlayerState.ENDED))) {
            handleVideoEnded();
        }
    };

    function attachYt() {
        const el = document.getElementById(iframeId);
        if (!el) return;
        try {
            currentYtPlayerInstance = new window.YT.Player(iframeId, {
                events: {
                    'onReady': () => {
                        startYtTimelineSync();
                        updateYtTimelineProgress();
                        initTimelineDragEvents();
                        initPlayerDoubleTapSkip();
                        applyStoredYtPreferences();
                    },
                    'onStateChange': onPlayerStateChange
                }
            });
            startYtTimelineSync();
            initTimelineDragEvents();
            initPlayerDoubleTapSkip();
        } catch (e) {
            console.warn('YT Player attachment warning:', e);
            startYtTimelineSync();
            initTimelineDragEvents();
            initPlayerDoubleTapSkip();
        }
    }

    if (window.YT && window.YT.Player) {
        attachYt();
    } else {
        const prevReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function() {
            if (typeof prevReady === 'function') prevReady();
            attachYt();
        };
    }
}

// Extract episode playable URL safely from string or object
function extractEpisodeUrl(ep) {
    if (!ep) return '';
    if (typeof ep === 'string') return ep.trim();
    return String(
        ep.link || ep.url || ep.video || ep.videoUrl || ep.streamUrl ||
        ep.src || ep.file || ep.embed || ep.drive || ep.gdrive || ep.id || ''
    ).trim();
}

// Extracts and cleans Google Drive ID by stripping any trailing extra character or word
function cleanGoogleDriveId(raw) {
    if (!raw) return '';
    let val = String(raw).trim();
    if (val.startsWith('hhttps://')) {
        val = val.replace('hhttps://', 'https://');
    }

    let id = '';
    const m = val.match(/\/file\/d\/([-\w]+)/i) ||
              val.match(/\/d\/([-\w]+)/i) ||
              val.match(/[?&]id=([-\w]+)/i) ||
              val.match(/id=([-\w]+)/i);
    if (m && m[1]) {
        id = m[1].trim();
    } else {
        const rawMatch = val.match(/[-\w]{15,}/);
        if (rawMatch) {
            id = rawMatch[0].trim();
        } else {
            id = val;
        }
    }

    // Google Drive file IDs are standard 33 characters (e.g. 18f2-h5i1OBj0yQawljfNilHg2UMtiC0).
    // If user has an extra character or word appended at the end (e.g. 34 characters:
    // "18f2-h5i1OBj0yQawljfNilHg2UMtiC0I" or "18f2-h5i1OBj0yQawljfNilHg2UMtiC0l", or longer),
    // strip the trailing extra character/word to preserve the clean 33-character Google Drive ID:
    if (id.length > 33) {
        id = id.slice(0, 33);
    } else if (id.length === 29) {
        id = id.slice(0, 28);
    }

    return id;
}
window.cleanGoogleDriveId = cleanGoogleDriveId;

// Detect video source ("gdrive", "yt", "video", or "drc")
// Rule per exact user instruction:
// - ONLY when link is https://drive.google.com/file/d/.../preview (Drive Preview URL) -> "gdrive" (Iframe)
// - YouTube links -> "yt" (YouTube Embed)
// - Raw Google Drive ID (e.g. 1DlvdGn8QaXGuJVbeU6wrKxGUJfV-0Txh0) -> "video" (Plays in previous Plyr via Worker stream)
// - All other link types (direct MP4, worker, m3u8, webm, http/https) -> "drc" (Plyr player)
function detectMovieVideoSource(movie) {
    if (!movie) {
        return {
            type: 'drc',
            id: 'default',
            url: '',
            raw: ''
        };
    }

    // Parse episodes if provided as JSON string
    if (typeof movie.episodes === 'string' && movie.episodes.trim().startsWith('[')) {
        try {
            movie.episodes = JSON.parse(movie.episodes);
        } catch (e) {}
    }

    const hasEpisodes = Array.isArray(movie.episodes) && movie.episodes.length > 0;

    // For movies without episodes, use verified source if already determined
    if (!hasEpisodes && movie._verifiedSource) {
        return movie._verifiedSource;
    }

    // Check active episode if movie has episodes
    let activeVideoSource = '';
    if (hasEpisodes) {
        const epIdx = window.currentActiveEpisodeIndex || 0;
        const currentEp = movie.episodes[epIdx] || movie.episodes[0];
        if (currentEp) {
            activeVideoSource = extractEpisodeUrl(currentEp);
        }
    }

    if (!activeVideoSource) {
        activeVideoSource = String(movie.video || movie.videoUrl || movie.streamUrl || movie.link || movie.url || '').trim();
    }

    if (activeVideoSource.startsWith('hhttps://')) {
        activeVideoSource = activeVideoSource.replace('hhttps://', 'https://');
    }

    // 1. Google Drive Preview Links: ONLY when link is https://drive.google.com/file/d/.../preview -> IFRAME PREVIEW
    const isDrivePreviewLink = activeVideoSource.startsWith('http') && (
        (activeVideoSource.includes('drive.google.com') && (activeVideoSource.includes('/preview') || activeVideoSource.includes('/view') || activeVideoSource.includes('/file/d/'))) ||
        (activeVideoSource.includes('docs.google.com') && activeVideoSource.includes('/preview'))
    );

    if (isDrivePreviewLink) {
        const driveId = cleanGoogleDriveId(activeVideoSource);
        const previewUrl = driveId
            ? `https://drive.google.com/file/d/${driveId}/preview`
            : (activeVideoSource.includes('/preview') ? activeVideoSource : `${activeVideoSource.replace(/\/view(\?.*)?$/i, '')}/preview`);
        return {
            type: 'gdrive',
            id: driveId || activeVideoSource,
            url: previewUrl,
            raw: activeVideoSource
        };
    }

    // 1.5 Cloudflare Worker Stream Links (e.g. https://debasis.installapkapps.workers.dev/?id=...)
    if (activeVideoSource.startsWith('http') && activeVideoSource.includes('workers.dev') && activeVideoSource.includes('id=')) {
        const driveId = cleanGoogleDriveId(activeVideoSource);
        const workerUrl = `https://debasis.installapkapps.workers.dev/?id=${encodeURIComponent(driveId)}`;
        return {
            type: 'video',
            id: driveId,
            rawId: driveId,
            url: workerUrl,
            raw: activeVideoSource
        };
    }

    // 2. Check "yt" key or youtube url
    const rawYt = String(movie.yt || movie.youtube || "").trim();
    if ((!hasEpisodes && rawYt) || activeVideoSource.includes('youtube.com') || activeVideoSource.includes('youtu.be')) {
        let ytId = (!hasEpisodes && rawYt) ? rawYt : '';
        const targetStr = ytId || activeVideoSource;
        const match = targetStr.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
        if (match && match[1]) {
            ytId = match[1];
        } else if (!ytId) {
            ytId = targetStr;
        }
        return {
            type: 'yt',
            id: ytId,
            url: `https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1&rel=0&playsinline=1&iv_load_policy=3&modestbranding=1&fs=0`,
            raw: targetStr
        };
    }

    // 3. Raw Google Drive file ID (e.g. "1DlvdGn8QaXGuJVbeU6wrKxGUJfV-0Txh0") -> PREVIOUS PLYR PLAYER!
    if (activeVideoSource && !activeVideoSource.startsWith('http') && /^[-\w]{15,}$/.test(activeVideoSource)) {
        const driveId = cleanGoogleDriveId(activeVideoSource);
        const workerUrl = `https://debasis.installapkapps.workers.dev/?id=${encodeURIComponent(driveId)}`;
        return {
            type: 'video',
            id: driveId,
            rawId: driveId,
            url: workerUrl,
            raw: activeVideoSource
        };
    }

    // 4. ALL OTHER LINKS -> PLYR DIRECT PLAYER (Direct MP4, worker stream, m3u8, webm, cdn, etc.)
    if (activeVideoSource) {
        return {
            type: 'drc',
            id: activeVideoSource,
            url: activeVideoSource,
            raw: activeVideoSource
        };
    }

    const rawDrc = String(movie.drc || movie.direct || "").trim();
    if (rawDrc) {
        return {
            type: 'drc',
            id: rawDrc,
            url: rawDrc,
            raw: rawDrc
        };
    }

    // Default fallback
    return {
        type: 'drc',
        id: 'default',
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
        raw: ''
    };
}

// Generate Stream URLs based on detected video type ("gdrive", "yt", "video", or "drc")
function getMovieServers(movie) {
    const source = detectMovieVideoSource(movie);

    // ONLY Google Drive Preview Links use iframe preview
    if (source.type === 'gdrive') {
        const driveId = cleanGoogleDriveId(source.id || source.url || source.raw);
        const previewUrl = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : source.url;
        const workerUrl = driveId ? `https://debasis.installapkapps.workers.dev/?id=${encodeURIComponent(driveId)}` : '';
        return [
            {
                name: "Server 1 (Drive Preview HD)",
                quality: "1080p Ultra HD",
                url: previewUrl,
                type: "gdrive"
            },
            {
                name: "Server 2 (Fast Worker Stream)",
                quality: "720p HD",
                url: workerUrl || previewUrl,
                type: workerUrl ? "video" : "gdrive"
            },
            {
                name: "Server 3 (Drive Direct HD)",
                quality: "Auto Quality",
                url: driveId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}` : previewUrl,
                type: driveId ? "video" : "gdrive"
            }
        ];
    }

    // YouTube links
    if (source.type === 'yt') {
        const originParam = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) 
            ? `&origin=${encodeURIComponent(window.location.origin)}` 
            : '';
        return [
            {
                name: "Server 1 (Cloud HD Player)",
                quality: "Auto / 1080p",
                url: `https://www.youtube-nocookie.com/embed/${source.id}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&iv_load_policy=3&modestbranding=1&fs=0${originParam}`,
                type: "yt"
            },
            {
                name: "Server 2 (Fast Stream)",
                quality: "720p HD",
                url: `https://www.youtube.com/embed/${source.id}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&iv_load_policy=3&modestbranding=1&fs=0${originParam}`,
                type: "yt"
            }
        ];
    }

    // Raw Google Drive ID -> Previous Plyr with Worker Stream & Direct Drive
    if (source.type === 'video') {
        const driveId = cleanGoogleDriveId(source.id || source.rawId || source.raw);
        const workerUrl = source.url || `https://debasis.installapkapps.workers.dev/?id=${encodeURIComponent(driveId)}`;
        const previewUrl = `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`;
        return [
            {
                name: "Server 1 (Fast Worker Stream)",
                quality: "1080p Ultra HD",
                url: workerUrl,
                type: "video"
            },
            {
                name: "Server 2 (Drive Direct HD)",
                quality: "720p HD",
                url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}`,
                type: "video"
            },
            {
                name: "Server 3 (Drive Preview HD)",
                quality: "Auto Quality",
                url: previewUrl,
                type: "gdrive"
            }
        ];
    }

    // All other links -> Plyr Direct Stream (Server 1 & 2)
    return [
        {
            name: "Server 1 (Direct HD Stream)",
            quality: "1080p Ultra HD",
            url: source.url,
            type: "drc"
        },
        {
            name: "Server 2 (Direct Fast Stream)",
            quality: "720p HD",
            url: source.url,
            type: "drc"
        }
    ];
}

// Screen Orientation Landscape Lock & Unlock on Fullscreen
async function tryNativeOrientationLock() {
    // 1. Android APK native interface
    if (window.Android && typeof window.Android.setLandscape === 'function') {
        try {
            window.Android.setLandscape();
            return true;
        } catch (e) {}
    }
    if (window.Android && typeof window.Android.setOrientation === 'function') {
        try {
            window.Android.setOrientation('landscape');
            return true;
        } catch (e) {}
    }

    // 2. Screen Orientation API (Modern mobile browsers)
    const targets = ['landscape', 'landscape-primary', 'landscape-secondary'];
    for (const orient of targets) {
        try {
            if (screen.orientation && typeof screen.orientation.lock === 'function') {
                await screen.orientation.lock(orient);
                return true;
            }
        } catch (err) {}
    }

    // 3. Legacy vendor prefixes
    try {
        const so = screen;
        if (so.lockOrientation && so.lockOrientation('landscape')) return true;
        if (so.mozLockOrientation && so.mozLockOrientation('landscape')) return true;
        if (so.msLockOrientation && so.msLockOrientation('landscape')) return true;
        if (so.webkitLockOrientation && so.webkitLockOrientation('landscape')) return true;
    } catch (e) {}

    return false;
}

function applyCssLandscapeIfPortrait() {
    const playerBox = document.getElementById('activePlayerBox');
    const isFs = isManualPlayerFullscreen || !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        (playerBox && (playerBox.classList.contains('is-fullscreen') || playerBox.classList.contains('plyr-force-landscape'))) ||
        (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active)
    );
    const plyrContainer = currentPlyrInstance?.elements?.container || playerBox;

    if (isFs && window.innerHeight > window.innerWidth) {
        if (plyrContainer) plyrContainer.classList.add('plyr-force-landscape');
        if (playerBox) playerBox.classList.add('plyr-force-landscape');
        if (playerBox) playerBox.classList.add('is-fullscreen');
        document.body.classList.add('player-is-fullscreen');
    } else if (isFs) {
        // Device is physically in landscape orientation: player fills 100vw x 100vh cleanly
        if (plyrContainer) plyrContainer.classList.remove('plyr-force-landscape');
        if (playerBox) {
            playerBox.classList.remove('plyr-force-landscape');
            playerBox.classList.add('is-fullscreen');
        }
        document.body.classList.add('player-is-fullscreen');
    } else {
        if (plyrContainer) plyrContainer.classList.remove('plyr-force-landscape');
        if (playerBox) {
            playerBox.classList.remove('plyr-force-landscape');
            playerBox.classList.remove('is-fullscreen');
        }
        document.body.classList.remove('player-is-fullscreen');
    }
}

async function lockLandscapeOrientation() {
    // Immediate attempt on user gesture
    let locked = await tryNativeOrientationLock();

    // Fullscreen transitions are asynchronous on mobile devices (100-300ms).
    // Retry native orientation lock as fullscreen activates:
    const delays = [60, 150, 300, 500];
    delays.forEach(delay => {
        setTimeout(async () => {
            if (!locked) {
                locked = await tryNativeOrientationLock();
            }
            // If device is still in portrait orientation, apply CSS landscape rotation fallback
            if (window.innerHeight > window.innerWidth) {
                applyCssLandscapeIfPortrait();
            } else {
                const playerBox = document.getElementById('activePlayerBox');
                const plyrContainer = currentPlyrInstance?.elements?.container || playerBox;
                if (plyrContainer) plyrContainer.classList.remove('plyr-force-landscape');
                if (playerBox) playerBox.classList.remove('plyr-force-landscape');
            }
        }, delay);
    });
}

function unlockScreenOrientation() {
    // If auto-next is transitioning or fullscreen should be preserved, DO NOT UNLOCK!
    if (isAutoNextTransitioning || wasFullscreenBeforeNext) {
        return;
    }

    isManualPlayerFullscreen = false;
    document.body.classList.remove('player-is-fullscreen');

    // 1. Android APK native interface
    if (window.Android && typeof window.Android.unlockOrientation === 'function') {
        try { window.Android.unlockOrientation(); } catch (e) {}
    } else if (window.Android && typeof window.Android.setPortrait === 'function') {
        try { window.Android.setPortrait(); } catch (e) {}
    }

    // 2. Remove CSS rotation & exit fallback fullscreen
    const playerBox = document.getElementById('activePlayerBox');
    const plyrContainer = currentPlyrInstance?.elements?.container || playerBox;
    if (plyrContainer) {
        plyrContainer.classList.remove('plyr-force-landscape');
    }
    if (playerBox) {
        playerBox.classList.remove('plyr-force-landscape');
        const fsEl = document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement;
        if (!fsEl) {
            playerBox.classList.remove('is-fullscreen');
        }
    }

    // 3. Screen orientation unlock
    try {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
            screen.orientation.unlock();
            return;
        }
    } catch (e) {}

    try {
        const so = screen;
        if (so.unlockOrientation) so.unlockOrientation();
        else if (so.mozUnlockOrientation) so.mozUnlockOrientation();
        else if (so.msUnlockOrientation) so.msUnlockOrientation();
        else if (so.webkitUnlockOrientation) so.webkitUnlockOrientation();
    } catch (e) {}
}

function maintainFullscreenLandscape() {
    isAutoNextTransitioning = true;
    wasFullscreenBeforeNext = true;
    const box = document.getElementById('activePlayerBox');
    if (box) {
        box.classList.add('is-fullscreen');
        if (window.innerHeight > window.innerWidth) {
            box.classList.add('plyr-force-landscape');
        }
        try {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (box.requestFullscreen) {
                    box.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
                } else if (box.webkitRequestFullscreen) {
                    box.webkitRequestFullscreen();
                }
            }
        } catch (e) {}
    }
    const plyrContainer = currentPlyrInstance?.elements?.container;
    if (plyrContainer && window.innerHeight > window.innerWidth) {
        plyrContainer.classList.add('plyr-force-landscape');
    }
    updateFullscreenButtonState(true);
    lockLandscapeOrientation();

    // Re-lock orientation at staggered intervals to prevent Android / browser orientation drift
    [60, 150, 300, 600, 1000].forEach(delay => {
        setTimeout(() => {
            if (wasFullscreenBeforeNext) {
                const b = document.getElementById('activePlayerBox');
                if (b) {
                    b.classList.add('is-fullscreen');
                    if (window.innerHeight > window.innerWidth) {
                        b.classList.add('plyr-force-landscape');
                    }
                }
                const pc = currentPlyrInstance?.elements?.container;
                if (pc && window.innerHeight > window.innerWidth) {
                    pc.classList.add('plyr-force-landscape');
                }
                lockLandscapeOrientation();
                updateFullscreenButtonState(true);
            }
        }, delay);
    });

    setTimeout(() => {
        isAutoNextTransitioning = false;
        wasFullscreenBeforeNext = false;
    }, 1500);
}
window.maintainFullscreenLandscape = maintainFullscreenLandscape;

function updateFullscreenButtonState(isFs) {
    const fsBtn = document.getElementById('ytShieldFsBtn');
    if (fsBtn) {
        fsBtn.innerHTML = `<i class="fa-solid ${isFs ? 'fa-compress' : 'fa-expand'}"></i>`;
        fsBtn.title = isFs ? 'Exit Fullscreen' : 'Fullscreen';
    }
    const epFsBtns = document.querySelectorAll('.ep-nav-fullscreen, #epNavFullscreenBtn');
    epFsBtns.forEach(btn => {
        btn.innerHTML = `<i class="fa-solid ${isFs ? 'fa-compress' : 'fa-expand'}"></i> ${isFs ? 'Exit FS' : 'Fullscreen'}`;
        btn.title = isFs ? 'Exit Fullscreen' : 'Fullscreen Video Player';
        if (isFs) {
            btn.classList.add('active-fs');
        } else {
            btn.classList.remove('active-fs');
        }
    });
    const topShield = document.getElementById('ytTopShield');
    if (topShield) {
        if (isFs) topShield.classList.add('active-fullscreen');
        else topShield.classList.remove('active-fullscreen');
    }
    syncFooterAdWithFullscreen(isFs);
}
window.updateFullscreenButtonState = updateFullscreenButtonState;

function syncFooterAdWithFullscreen(isFs) {
    const footerAd = document.getElementById('fixedFooterAdContainer');
    if (!footerAd) return;
    if (window.__isVipSubscribed) {
        footerAd.style.setProperty('display', 'none', 'important');
        return;
    }

    const fsElement = document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;

    footerAd.style.setProperty('display', 'flex', 'important');
    footerAd.style.setProperty('visibility', 'visible', 'important');
    footerAd.style.setProperty('opacity', '1', 'important');
    footerAd.style.setProperty('z-index', '2147483645', 'important');
    footerAd.style.setProperty('justify-content', 'center', 'important');
    footerAd.style.setProperty('align-items', 'center', 'important');
    footerAd.style.setProperty('text-align', 'center', 'important');
    footerAd.style.setProperty('background', 'transparent', 'important');
    footerAd.style.setProperty('border', 'none', 'important');
    footerAd.style.setProperty('box-shadow', 'none', 'important');
    footerAd.style.setProperty('pointer-events', 'none', 'important');

    const inner = document.getElementById('fixedFooterAdInner');
    if (inner) {
        inner.style.setProperty('margin', '0 auto', 'important');
        inner.style.setProperty('display', 'flex', 'important');
        inner.style.setProperty('justify-content', 'center', 'important');
        inner.style.setProperty('align-items', 'center', 'important');
        inner.style.setProperty('pointer-events', 'auto', 'important');
        inner.style.setProperty('background', 'transparent', 'important');
        inner.style.setProperty('border', 'none', 'important');
        inner.style.setProperty('box-shadow', 'none', 'important');
    }

    const playerBox = document.getElementById('activePlayerBox');
    const isPlayerInFs = isFs || !!(
        fsElement ||
        (playerBox && (playerBox.classList.contains('is-fullscreen') || playerBox.classList.contains('plyr-force-landscape'))) ||
        document.body.classList.contains('player-is-fullscreen')
    );

    if (isPlayerInFs) {
        // Fullscreen is active: host inside the active fullscreen container (fsElement or playerBox)
        // so it stays overlayed in native fullscreen top-layer as well as rotated landscape mode
        const targetHost = fsElement || playerBox || document.body;
        if (targetHost && !targetHost.contains(footerAd)) {
            targetHost.appendChild(footerAd);
        }
    } else {
        // Regular mode: keep footer ad in document.body
        if (footerAd.parentElement && footerAd.parentElement !== document.body) {
            document.body.appendChild(footerAd);
        }
    }
}
window.syncFooterAdWithFullscreen = syncFooterAdWithFullscreen;

// Global Fullscreen Event Listeners for Automatic Landscape Orientation
const handleGlobalFullscreenOrientation = () => {
    // Retain landscape orientation if Smartlink interstitial ad is active over fullscreen
    if (isSmartlinkInterstitialActive && wasFullscreenBeforeInterstitial) {
        return;
    }
    // Retain landscape orientation during auto-next transition between videos
    if (isAutoNextTransitioning || wasFullscreenBeforeNext) {
        return;
    }
    const box = document.getElementById('activePlayerBox');
    const iframe = document.getElementById('vdoSkyYouTube');
    const fsEl = document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement;

    // If the YouTube iframe itself was put into fullscreen, switch fullscreen to activePlayerBox
    // so protective shields remain active and fully cover the YouTube logo and playlist controls!
    if (fsEl && iframe && fsEl === iframe && box) {
        if (document.exitFullscreen) {
            document.exitFullscreen().then(() => {
                if (box.requestFullscreen) {
                    box.requestFullscreen({ navigationUI: 'hide' }).then(() => {
                        lockLandscapeOrientation();
                    }).catch(() => {
                        lockLandscapeOrientation();
                    });
                } else if (box.webkitRequestFullscreen) {
                    box.webkitRequestFullscreen();
                    lockLandscapeOrientation();
                }
            }).catch(() => {});
        }
        return;
    }

    const isFs = Boolean(
        isManualPlayerFullscreen ||
        fsEl ||
        (box && (box.classList.contains('is-fullscreen') || box.classList.contains('plyr-force-landscape'))) ||
        (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active && currentPlyrInstance.elements?.container?.classList?.contains('plyr--fullscreen-fallback'))
    );
    if (isFs) {
        if (box) box.classList.add('is-fullscreen');
        document.body.classList.add('player-is-fullscreen');
        lockLandscapeOrientation();
        updateFullscreenButtonState(true);
    } else {
        isManualPlayerFullscreen = false;
        document.body.classList.remove('player-is-fullscreen');
        if (box) {
            box.classList.remove('is-fullscreen');
            box.classList.remove('plyr-force-landscape');
        }
        const plyrContainer = currentPlyrInstance?.elements?.container;
        if (plyrContainer) {
            plyrContainer.classList.remove('plyr-force-landscape');
        }
        unlockScreenOrientation();
        updateFullscreenButtonState(false);
    }
};

document.addEventListener('fullscreenchange', handleGlobalFullscreenOrientation);
document.addEventListener('webkitfullscreenchange', handleGlobalFullscreenOrientation);
document.addEventListener('mozfullscreenchange', handleGlobalFullscreenOrientation);
document.addEventListener('MSFullscreenChange', handleGlobalFullscreenOrientation);

window.addEventListener('resize', () => {
    const playerBox = document.getElementById('activePlayerBox');
    const isFs = (isAutoNextTransitioning || wasFullscreenBeforeNext || isManualPlayerFullscreen) || !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        (playerBox && (playerBox.classList.contains('is-fullscreen') || playerBox.classList.contains('plyr-force-landscape'))) ||
        (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active)
    );
    const plyrContainer = currentPlyrInstance?.elements?.container || playerBox;
    if (isFs) {
        document.body.classList.add('player-is-fullscreen');
        if (playerBox) playerBox.classList.add('is-fullscreen');
        if (window.innerWidth > window.innerHeight) {
            if (plyrContainer) plyrContainer.classList.remove('plyr-force-landscape');
            if (playerBox) playerBox.classList.remove('plyr-force-landscape');
        } else {
            applyCssLandscapeIfPortrait();
        }
    } else {
        document.body.classList.remove('player-is-fullscreen');
        if (plyrContainer) plyrContainer.classList.remove('plyr-force-landscape');
        if (playerBox) {
            playerBox.classList.remove('plyr-force-landscape');
            playerBox.classList.remove('is-fullscreen');
        }
    }
});

window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        const playerBox = document.getElementById('activePlayerBox');
        const isFs = (isAutoNextTransitioning || wasFullscreenBeforeNext || isManualPlayerFullscreen) || !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            (playerBox && (playerBox.classList.contains('is-fullscreen') || playerBox.classList.contains('plyr-force-landscape'))) ||
            (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active)
        );
        const plyrContainer = currentPlyrInstance?.elements?.container || playerBox;
        if (isFs) {
            document.body.classList.add('player-is-fullscreen');
            if (playerBox) playerBox.classList.add('is-fullscreen');
            if (window.innerWidth > window.innerHeight) {
                if (plyrContainer) plyrContainer.classList.remove('plyr-force-landscape');
                if (playerBox) playerBox.classList.remove('plyr-force-landscape');
            } else {
                applyCssLandscapeIfPortrait();
            }
        } else {
            document.body.classList.remove('player-is-fullscreen');
            if (plyrContainer) plyrContainer.classList.remove('plyr-force-landscape');
            if (playerBox) {
                playerBox.classList.remove('plyr-force-landscape');
                playerBox.classList.remove('is-fullscreen');
            }
        }
    }, 200);
});

// Initialize Plyr player on HTML5 video element
function initPlyrPlayer(videoEl, movie, activeServerIndex) {
    destroyCurrentPlyr();
    if (!videoEl) return;

    const PlyrConstructor = window.Plyr;
    if (!PlyrConstructor) {
        console.warn("Plyr not found on window, fallback to native video controls");
        videoEl.controls = true;
        return;
    }

    try {
        currentPlyrInstance = new PlyrConstructor(videoEl, {
            controls: [
                'play-large',
                'rewind',
                'play',
                'fast-forward',
                'progress',
                'current-time',
                'duration',
                'mute',
                'volume',
                'captions',
                'fullscreen'
            ],
            settings: [],
            seekTime: 10,
            keyboard: { focused: true, global: false },
            tooltips: { controls: true, seek: true },
            fullscreen: { enabled: true, fallback: true, iosNative: true }
        });

        // Intercept user click on Plyr's fullscreen icon button during user activation
        currentPlyrInstance.on('ready', () => {
            const container = currentPlyrInstance.elements.container;
            if (container) {
                container.style.position = 'relative';

                // Inject central buffering spinner directly inside Plyr container (visible in normal & fullscreen)
                let bufferOverlay = container.querySelector('.plyr-buffering-overlay');
                if (!bufferOverlay) {
                    bufferOverlay = document.createElement('div');
                    bufferOverlay.className = 'plyr-buffering-overlay';
                    bufferOverlay.style.display = 'none';
                    bufferOverlay.innerHTML = `
                        <div class="plyr-buffer-spinner-ring"></div>
                        <span class="plyr-buffer-text">Buffering Stream...</span>
                    `;
                    container.appendChild(bufferOverlay);
                }

                const showBuffering = () => {
                    if (bufferOverlay) bufferOverlay.style.display = 'flex';
                };
                const hideBuffering = () => {
                    if (bufferOverlay) bufferOverlay.style.display = 'none';
                };

                // Plyr seek & buffering events
                currentPlyrInstance.on('seeking', showBuffering);
                currentPlyrInstance.on('waiting', showBuffering);
                currentPlyrInstance.on('loadstart', showBuffering);
                currentPlyrInstance.on('playing', hideBuffering);
                currentPlyrInstance.on('canplay', hideBuffering);
                currentPlyrInstance.on('canplaythrough', hideBuffering);
                currentPlyrInstance.on('seeked', () => {
                    setTimeout(() => {
                        if (videoEl.readyState >= 3 && !videoEl.seeking) {
                            hideBuffering();
                        }
                    }, 200);
                });

                // Direct timeline range slider clicks & drags
                const seekRange = container.querySelector('[data-plyr="seek"]');
                if (seekRange) {
                    seekRange.addEventListener('pointerdown', showBuffering);
                    seekRange.addEventListener('mousedown', showBuffering);
                    seekRange.addEventListener('touchstart', showBuffering);
                    seekRange.addEventListener('input', showBuffering);
                    seekRange.addEventListener('change', showBuffering);
                }

                // Rewind / Fast-forward buttons
                const rewindBtn = container.querySelector('[data-plyr="rewind"]');
                if (rewindBtn) rewindBtn.addEventListener('click', showBuffering);
                const fastFwdBtn = container.querySelector('[data-plyr="fast-forward"]');
                if (fastFwdBtn) fastFwdBtn.addEventListener('click', showBuffering);

                container.addEventListener('click', (e) => {
                    const btn = e.target.closest('[data-plyr="fullscreen"]');
                    if (btn) {
                        const isCurrentlyFs = !!(
                            (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active) ||
                            document.fullscreenElement ||
                            document.webkitFullscreenElement
                        );
                        if (!isCurrentlyFs) {
                            const box = document.getElementById('activePlayerBox');
                            if (box) box.classList.add('is-fullscreen');
                            lockLandscapeOrientation();
                            updateFullscreenButtonState(true);
                        } else {
                            const box = document.getElementById('activePlayerBox');
                            if (box) {
                                box.classList.remove('is-fullscreen');
                                box.classList.remove('plyr-force-landscape');
                            }
                            if (container) {
                                container.classList.remove('plyr-force-landscape');
                            }
                            unlockScreenOrientation();
                            updateFullscreenButtonState(false);
                        }
                    }
                }, true);
            }

            // Attempt autoplay smoothly
            try {
                const playPromise = currentPlyrInstance.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {
                        // Expected when browser blocks unmuted autoplay
                    });
                }
            } catch (e) {}
        });

        // Native video listeners for buffering
        videoEl.addEventListener('seeking', () => {
            const overlay = currentPlyrInstance?.elements?.container?.querySelector('.plyr-buffering-overlay');
            if (overlay) overlay.style.display = 'flex';
        });
        videoEl.addEventListener('waiting', () => {
            const overlay = currentPlyrInstance?.elements?.container?.querySelector('.plyr-buffering-overlay');
            if (overlay) overlay.style.display = 'flex';
        });
        videoEl.addEventListener('stalled', () => {
            const overlay = currentPlyrInstance?.elements?.container?.querySelector('.plyr-buffering-overlay');
            if (overlay) overlay.style.display = 'flex';
        });
        videoEl.addEventListener('playing', () => {
            const overlay = currentPlyrInstance?.elements?.container?.querySelector('.plyr-buffering-overlay');
            if (overlay) overlay.style.display = 'none';
        });
        videoEl.addEventListener('canplay', () => {
            const overlay = currentPlyrInstance?.elements?.container?.querySelector('.plyr-buffering-overlay');
            if (overlay) overlay.style.display = 'none';
        });

        // Lock landscape on Plyr fullscreen event
        currentPlyrInstance.on('enterfullscreen', () => {
            const box = document.getElementById('activePlayerBox');
            if (box) box.classList.add('is-fullscreen');
            lockLandscapeOrientation();
            updateFullscreenButtonState(true);
        });

        // Restore orientation and exit fullscreen cleanly on Plyr exit fullscreen
        currentPlyrInstance.on('exitfullscreen', () => {
            if (isAutoNextTransitioning || wasFullscreenBeforeNext) {
                return;
            }
            const box = document.getElementById('activePlayerBox');
            if (box) {
                box.classList.remove('is-fullscreen');
                box.classList.remove('plyr-force-landscape');
            }
            const container = currentPlyrInstance?.elements?.container;
            if (container) {
                container.classList.remove('plyr-force-landscape');
            }
            unlockScreenOrientation();
            updateFullscreenButtonState(false);
        });

        // Native iOS & WebKit video fullscreen handlers
        videoEl.addEventListener('webkitbeginfullscreen', () => {
            const box = document.getElementById('activePlayerBox');
            if (box) box.classList.add('is-fullscreen');
            lockLandscapeOrientation();
            updateFullscreenButtonState(true);
        });
        videoEl.addEventListener('webkitendfullscreen', () => {
            if (isAutoNextTransitioning || wasFullscreenBeforeNext) {
                return;
            }
            const box = document.getElementById('activePlayerBox');
            if (box) {
                box.classList.remove('is-fullscreen');
                box.classList.remove('plyr-force-landscape');
            }
            const container = currentPlyrInstance?.elements?.container;
            if (container) {
                container.classList.remove('plyr-force-landscape');
            }
            unlockScreenOrientation();
            updateFullscreenButtonState(false);
        });

        // Video completion triggers Auto Next
        currentPlyrInstance.on('ended', () => {
            handleVideoEnded();
        });
        videoEl.addEventListener('ended', () => {
            handleVideoEnded();
        });

        // Listen for errors to prompt user to switch stream server (capture phase catches <source> errors too)
        videoEl.addEventListener('error', (e) => {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            const errorBox = document.getElementById('playerStreamErrorNotice');
            if (errorBox) errorBox.style.display = 'flex';
        }, true);

    } catch (err) {
        console.warn("Failed to initialize Plyr, using native controls:", err);
        videoEl.controls = true;
    }
}

// ==========================================
// 300x250 MEDIUM RECTANGLE AD UNITS
// ==========================================
let ad300x250Observer = null;

function getAd300x250Observer() {
    if (!ad300x250Observer && window.IntersectionObserver) {
        ad300x250Observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const target = entry.target;
                    renderAd300x250Iframe(target);
                    observer.unobserve(target);
                }
            });
        }, { rootMargin: "250px 0px" });
    }
    return ad300x250Observer;
}

function renderAd300x250Iframe(container) {
    if (window.__isVipSubscribed) {
        if (container) {
            container.innerHTML = '';
            const parent = container.closest('.ad-slot-300x250');
            if (parent) parent.remove();
        }
        return;
    }
    if (!container || container.dataset.loaded === 'true') return;
    container.dataset.loaded = 'true';

    const iframe = document.createElement('iframe');
    iframe.width = '300';
    iframe.height = '250';
    iframe.style.width = '300px';
    iframe.style.height = '250px';
    iframe.style.border = 'none';
    iframe.style.overflow = 'hidden';
    iframe.scrolling = 'no';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('marginwidth', '0');
    iframe.setAttribute('marginheight', '0');
    iframe.setAttribute('allowtransparency', 'true');

    const adHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: transparent;
            overflow: hidden;
            width: 300px;
            height: 250px;
            display: flex;
            justify-content: center;
            align-items: center;
        }
    </style>
</head>
<body>
    <script type="text/javascript">
        // Intercept links and window.open to open directly in Chrome app
        var origOpen = window.open;
        window.open = function(url) {
            try {
                if (window.parent && window.parent.openInChrome) {
                    window.parent.openInChrome(url);
                    return null;
                }
            } catch (e) {}
            return origOpen.apply(window, arguments);
        };
        document.addEventListener('click', function(e) {
            try {
                var target = e.target;
                if (!target || typeof target.closest !== 'function') return;
                var a = target.closest('a');
                if (a && a.href && a.href !== '#' && !a.href.startsWith('javascript:')) {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        if (window.parent && window.parent.openInChrome) {
                            window.parent.openInChrome(a.href);
                            return;
                        }
                    } catch (err) {}
                    window.open(a.href, '_blank');
                }
            } catch (err) {}
        }, true);
    <\/script>
    <script type="text/javascript">
        atOptions = {
            'key' : '0b1e87c8ccc1319d59bdeee59249318d',
            'format' : 'iframe',
            'height' : 250,
            'width' : 300,
            'params' : {}
        };
    <\/script>
    <script type="text/javascript" src="https://www.highrevenueformat.com/0b1e87c8ccc1319d59bdeee59249318d/invoke.js"><\/script>
</body>
</html>`;

    container.appendChild(iframe);

    try {
        iframe.srcdoc = adHtml;
    } catch (e) {
        try {
            iframe.contentWindow.document.open();
            iframe.contentWindow.document.write(adHtml);
            iframe.contentWindow.document.close();
        } catch (err) {}
    }
}

function createAd300x250Element(lazy = true) {
    if (window.__isVipSubscribed) {
        const dummy = document.createElement('div');
        dummy.className = 'ad-slot-300x250 vip-suppressed';
        dummy.style.display = 'none';
        return dummy;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'ad-slot-300x250';
    wrapper.innerHTML = `
        <span class="ad-label">Advertisement</span>
        <div class="ad-slot-300x250-inner"></div>
    `;

    const inner = wrapper.querySelector('.ad-slot-300x250-inner');
    if (lazy && window.IntersectionObserver) {
        getAd300x250Observer().observe(inner);
    } else {
        renderAd300x250Iframe(inner);
    }

    return wrapper;
}

function rebindUnloadedAds() {
    if (window.__isVipSubscribed) return;
    if (!window.IntersectionObserver) return;
    const observer = getAd300x250Observer();
    const unloadedSlots = document.querySelectorAll('.ad-slot-300x250-inner:not([data-loaded="true"])');
    unloadedSlots.forEach(slot => {
        observer.observe(slot);
    });
}

/* ==================================================
   GOOGLE DRIVE & MOVIE VIDEO LINK VERIFIER & ERROR POPUP
   ================================================== */
window.__lastFailedMovieForComment = null;

window.showThemePlayerError = function(movie) {
    window.__lastFailedMovieForComment = movie || null;
    const errPopup = document.getElementById("errorPopup");
    const movieNameEl = document.getElementById("errorPopupMovieName");
    if (movieNameEl) {
        if (movie && (movie.title || movie.name)) {
            movieNameEl.textContent = `"${movie.title || movie.name}"`;
            movieNameEl.style.display = 'block';
        } else {
            movieNameEl.style.display = 'none';
        }
    }
    if (errPopup) errPopup.style.display = "flex";
};

window.closeThemeErrorPopup = function() {
    const errPopup = document.getElementById("errorPopup");
    if (errPopup) errPopup.style.display = "none";
};

window.handleThemeCommentClick = function() {
    const movie = window.__lastFailedMovieForComment;
    const movieTitle = movie ? (movie.title || movie.name || '') : '';
    window.closeThemeErrorPopup();
    
    // Automatically copy pre-filled comment text to clipboard
    if (movieTitle) {
        const commentTemplate = `Report: Movie "${movieTitle}" is not working / video link broken. Please fix!`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(commentTemplate).then(() => {
                showToast(`Copied movie report: "${movieTitle}"! Paste in comment.`);
            }).catch(() => {});
        } else {
            showToast(`Report for: "${movieTitle}"`);
        }
    }

    if (typeof window.openCommentSection === 'function') {
        window.openCommentSection(movieTitle);
    } else {
        const commentSection = document.getElementById("comments") || document.getElementById("comment-holder") || document.querySelector('.comments');
        if (commentSection) {
            commentSection.scrollIntoView({ behavior: 'smooth' });
        }
    }
};

function performOpenPlayerDirect(movie, preserveFullscreen = false) {
    if (!movie) return;

    if (currentPlayingMovie !== movie) {
        window.currentActiveEpisodeIndex = 0;
    }

    // Save previous scroll position
    if (!isPlayerView) {
        savedScrollPosition = window.scrollY;
    }
    currentPlayingMovie = movie;
    isPlayerView = true;
    updateHeaderButton();

    window.history.pushState({ view: 'player', title: movie.title }, '');
    if (!preserveFullscreen) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    renderPlayerSection(movie, 0, preserveFullscreen);
}

// Test if a specific Google Drive candidate ID is active & working
function testDriveCandidate(cand) {
    return new Promise((resolve) => {
        if (!cand || cand === 'default' || cand.length < 10) {
            resolve(false);
            return;
        }

        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                resolve(false);
            }
        }, 3200);

        function markSuccess() {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(true);
            }
        }

        // Method 1: Lightweight Worker probe with Range request (CORS-enabled, 1-byte check)
        const workerUrl = "https://debasis.installapkapps.workers.dev/?id=" + encodeURIComponent(cand);
        fetch(workerUrl, {
            method: 'GET',
            headers: { 'Range': 'bytes=0-1' },
            cache: 'no-store'
        }).then(res => {
            // Worker returns 200 or 206 for valid active files; 404 or 400 for dead/deleted/invalid IDs
            if (res.status === 200 || res.status === 206) {
                markSuccess();
            }
        }).catch(() => {});

        // Method 2: Google lh3 thumbnail ping (cross-origin image check)
        try {
            const checkUrl = "https://lh3.googleusercontent.com/u/0/d/" + encodeURIComponent(cand) + "=w200-h200-p";
            const img = new Image();
            img.onload = function() {
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    markSuccess();
                }
            };
            img.onerror = function(e) {
                if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            };
            img.src = checkUrl;
        } catch (err) {}
    });
}

// Test direct video URLs (drc / mp4 / m3u8)
function testDirectVideoUrl(url) {
    return new Promise((resolve) => {
        if (!url || !url.startsWith('http')) {
            resolve(false);
            return;
        }

        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                resolve(false);
            }
        }, 3500);

        // Probe 1: Fetch with Range
        fetch(url, {
            method: 'GET',
            headers: { 'Range': 'bytes=0-1' },
            cache: 'no-store'
        }).then(res => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(res.ok || res.status === 200 || res.status === 206 || res.status === 302);
            }
        }).catch(() => {
            // Probe 2: Native HTML5 video metadata check
            try {
                const probeVideo = document.createElement('video');
                probeVideo.preload = 'metadata';
                probeVideo.onloadedmetadata = () => {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        probeVideo.removeAttribute('src');
                        probeVideo.load();
                        resolve(true);
                    }
                };
                probeVideo.onerror = () => {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timer);
                        probeVideo.removeAttribute('src');
                        probeVideo.load();
                        resolve(false);
                    }
                };
                probeVideo.src = url;
            } catch (e) {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    resolve(false);
                }
            }
        });
    });
}

// Test YouTube ID validity
function testYouTubeVideo(ytId) {
    return new Promise((resolve) => {
        if (!ytId || ytId.length !== 11) {
            resolve(false);
            return;
        }

        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                resolve(true); // Don't block YouTube if network thumbnail check times out
            }
        }, 2500);

        const img = new Image();
        img.onload = () => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                // When YouTube video is unavailable/deleted, mqdefault returns a 120px wide placeholder
                resolve(img.naturalWidth > 120);
            }
        };
        img.onerror = () => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(false);
            }
        };
        img.src = `https://img.youtube.com/vi/${encodeURIComponent(ytId)}/mqdefault.jpg`;
    });
}

// Master Link Verifier: accurately checks if stream link is valid and working
async function verifyMovieLink(movie) {
    if (!movie) return { valid: false, reason: 'no_movie' };

    const hasEpisodes = Array.isArray(movie.episodes) && movie.episodes.length > 0;
    const currentEp = hasEpisodes ? (movie.episodes[window.currentActiveEpisodeIndex || 0] || movie.episodes[0]) : null;
    const epLink = currentEp ? extractEpisodeUrl(currentEp) : '';

    const rawVideo = epLink || String(movie.video || movie.videoUrl || movie.streamUrl || movie.link || movie.url || '').trim();
    const rawYt = String(movie.yt || movie.youtube || '').trim();
    const rawDrc = String(movie.drc || movie.direct || '').trim();

    // 1. If completely empty or default mock, fail immediately unless episodes exist
    if (!rawVideo && !rawYt && !rawDrc && !hasEpisodes) {
        return { valid: false, reason: 'empty_link' };
    }
    if (rawVideo === 'default' && !rawYt && !rawDrc && !hasEpisodes) {
        return { valid: false, reason: 'default_link' };
    }

    // 2. Google Drive Preview Links: ONLY when link is https://drive.google.com/file/d/.../preview -> IFRAME PREVIEW
    const isDrivePreviewLink = rawVideo.startsWith('http') && (
        (rawVideo.includes('drive.google.com') && (rawVideo.includes('/preview') || rawVideo.includes('/view') || rawVideo.includes('/file/d/'))) ||
        (rawVideo.includes('docs.google.com') && rawVideo.includes('/preview'))
    );
    if (isDrivePreviewLink) {
        const driveId = cleanGoogleDriveId(rawVideo);
        const previewUrl = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : rawVideo;
        return {
            valid: true,
            verifiedSource: {
                type: 'gdrive',
                id: driveId || rawVideo,
                url: previewUrl,
                raw: rawVideo
            }
        };
    }

    // 3. YouTube Links
    if (rawYt || rawVideo.includes('youtube.com') || rawVideo.includes('youtu.be')) {
        let ytId = (!hasEpisodes && rawYt) ? rawYt : '';
        if (!ytId) {
            const match = rawVideo.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
            ytId = match ? match[1] : '';
        }
        if (ytId && ytId.length === 11) {
            const isYtAlive = await testYouTubeVideo(ytId);
            if (isYtAlive) {
                return {
                    valid: true,
                    verifiedSource: {
                        type: 'yt',
                        id: ytId,
                        url: `https://www.youtube.com/embed/${ytId}?autoplay=1&enablejsapi=1&rel=0&playsinline=1&iv_load_policy=3&modestbranding=1&fs=0`,
                        raw: rawYt || rawVideo
                    }
                };
            }
        }
    }

    // 4. Raw Google Drive file IDs (e.g. "1DlvdGn8QaXGuJVbeU6wrKxGUJfV-0Txh0") -> PREVIOUS PLYR PLAYER!
    let baseDriveId = '';
    if (!rawVideo.startsWith('http') && /^[-\w]{15,}$/.test(rawVideo)) {
        baseDriveId = cleanGoogleDriveId(rawVideo);
    } else if (rawVideo.includes('id=')) {
        baseDriveId = cleanGoogleDriveId(rawVideo);
    }

    if (baseDriveId) {
        const workerUrl = `https://debasis.installapkapps.workers.dev/?id=${encodeURIComponent(baseDriveId)}`;
        return {
            valid: true,
            verifiedSource: {
                type: 'video',
                id: baseDriveId,
                rawId: baseDriveId,
                url: workerUrl,
                raw: rawVideo
            }
        };
    }

    // 5. Direct video URL (drc)
    const directUrl = rawDrc || (rawVideo.startsWith('http') ? rawVideo : '');
    if (directUrl) {
        if (directUrl.includes('TearsOfSteel.mp4') || directUrl.includes('sample/')) {
            return { valid: false, reason: 'sample_placeholder' };
        }
        const isDirectAlive = await testDirectVideoUrl(directUrl);
        if (isDirectAlive) {
            return {
                valid: true,
                verifiedSource: {
                    type: 'drc',
                    id: directUrl,
                    url: directUrl,
                    raw: directUrl
                }
            };
        }
        return { valid: false, reason: 'direct_dead' };
    }

    if (hasEpisodes) {
        return { valid: true };
    }

    // Default: link cannot be resolved
    return { valid: false, reason: 'unknown_source' };
}

// Open Dedicated Player Section with Accurate Link Verification & Spring Loader
window.openPlayer = async function(movie, preserveFullscreen = false) {
    if (!movie) return;
    if (typeof window.stopGpsCamera === 'function') window.stopGpsCamera();
    isInGpsCameraView = false;

    // Non-subscribers can freely watch movies with ads.
    // VIP subscribers stream 100% ad-free.
    // Ensure the 320x50 overlay banner ad is loaded and active if not subscribed.
    if (!window.__isVipSubscribed && typeof loadFooterBannerAd === 'function') {
        loadFooterBannerAd();
    }

    // Close any previous error popup
    window.closeThemeErrorPopup();

    continueOpenPlayer(movie, preserveFullscreen);
};

async function continueOpenPlayer(movie, preserveFullscreen = false) {
    const hasEpisodes = Array.isArray(movie.episodes) && movie.episodes.length > 0;
    const rawVideoStr = String(movie.video || movie.videoUrl || movie.streamUrl || movie.link || movie.url || '').trim();
    const rawYt = String(movie.yt || movie.youtube || '').trim();
    const rawDrc = String(movie.drc || movie.direct || '').trim();

    // If completely empty, reject immediately without delay
    if (!rawVideoStr && !rawYt && !rawDrc && !hasEpisodes) {
        window.showThemePlayerError(movie);
        return;
    }

    // Show spring loader while checking link
    const springLoader = document.getElementById("movieVerifierLoader");
    if (springLoader) {
        springLoader.style.display = "flex";
        const subEl = springLoader.querySelector('.spring-loader-sub');
        if (subEl) subEl.textContent = 'Verifying stream server, please wait...';
    }

    try {
        const verifyResult = await verifyMovieLink(movie);

        // Always hide loader once check is finished
        if (springLoader) springLoader.style.display = "none";

        if (verifyResult && verifyResult.valid) {
            // Apply verified working source to the movie object (single movie only; web series resolve per episode)
            if (verifyResult.verifiedSource && !hasEpisodes) {
                movie._verifiedSource = verifyResult.verifiedSource;
            }
            performOpenPlayerDirect(movie, preserveFullscreen);
        } else {
            // STRICT REJECTION: Invalid, dead, or broken links MUST NEVER open the player!
            console.warn("Link verification failed for movie:", movie.title || movie.name, verifyResult?.reason);
            window.showThemePlayerError(movie);
        }
    } catch (err) {
        console.error("Link verification encountered unexpected error:", err);
        if (springLoader) springLoader.style.display = "none";
        window.showThemePlayerError(movie);
    }
}

// Safe trim helper that handles arrays, objects, strings, numbers, and null/undefined
function safeTrim(val) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean).join(', ');
    return String(val).trim();
}

// Calculate 20 highly related movies based on Category, Cast, Title Keywords, and Tags
function getRelatedMovies(currentMovie, limit = 20) {
    if (!Array.isArray(allMovies) || allMovies.length === 0) return [];
    if (!currentMovie) return allMovies.slice(0, limit);

    const curTitle = safeTrim(currentMovie.title || currentMovie.name).toLowerCase();
    const curCategory = safeTrim(currentMovie.category).toLowerCase();
    const curCast = safeTrim(currentMovie.cast).toLowerCase();
    const curTags = safeTrim(currentMovie.tags).toLowerCase();
    
    // Meaningful title keywords (skip common words)
    const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'movie', 'full', 'hd', 'part', 'hindi', 'dubbed', 'watch', 'video']);
    const curWords = curTitle.replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

    // Exclude current playing movie
    const candidates = allMovies.filter(m => {
        if (!m) return false;
        if (m === currentMovie) return false;
        if (m.id && currentMovie.id && m.id === currentMovie.id) return false;
        const t = safeTrim(m.title || m.name).toLowerCase();
        if (t && curTitle && t === curTitle) return false;
        return true;
    });

    if (candidates.length <= limit) return candidates;

    // Score relevance
    const scored = candidates.map(m => {
        let score = 0;
        const mCat = safeTrim(m.category).toLowerCase();
        const mCast = safeTrim(m.cast).toLowerCase();
        const mTags = safeTrim(m.tags).toLowerCase();
        const mTitle = safeTrim(m.title || m.name).toLowerCase();

        // 1. Same category match (primary factor)
        if (curCategory && mCat) {
            if (curCategory === mCat) {
                score += 50;
            } else if (mCat.includes(curCategory) || curCategory.includes(mCat)) {
                score += 35;
            }
        }

        // 2. Cast match
        if (curCast && mCast) {
            const castItems = curCast.split(/[,/]+/).map(c => safeTrim(c).toLowerCase()).filter(c => c.length > 2);
            for (const c of castItems) {
                if (mCast.includes(c)) score += 30;
            }
        }

        // 3. Title keywords overlap
        for (const w of curWords) {
            if (mTitle.includes(w)) score += 20;
        }

        // 4. Tags overlap
        if (curTags && mTags && curTags === mTags) {
            score += 15;
        }

        // 5. Rating weight
        const rating = parseFloat(m.rating) || 0;
        score += Math.min(rating, 5);

        return { movie: m, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const result = [];
    const seen = new Set();

    for (const item of scored) {
        if (result.length >= limit) break;
        const idOrTitle = item.movie.id || item.movie.title;
        if (!seen.has(idOrTitle)) {
            seen.add(idOrTitle);
            result.push(item.movie);
        }
    }

    // Fill remaining slots up to limit from candidate list
    if (result.length < limit) {
        for (const m of candidates) {
            if (result.length >= limit) break;
            const idOrTitle = m.id || m.title;
            if (!seen.has(idOrTitle)) {
                seen.add(idOrTitle);
                result.push(m);
            }
        }
    }

    return result.slice(0, limit);
}

// Curated High Quality Real YouTube Full Movies & Videos Catalog (100% verified working IDs & thumbnails)
const CURATED_YOUTUBE_CATALOG = [
    {
        videoId: 'DKhcGYlnfdY',
        yt: 'DKhcGYlnfdY',
        title: 'Yeh Majhdhaar (1996) Full Hindi Movie | Salman Khan, Manisha Koirala, Rahul Roy',
        poster: 'https://i.ytimg.com/vi/DKhcGYlnfdY/hqdefault.jpg',
        duration: '2:19:41',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Goldmines Bollywood'
    },
    {
        videoId: 'QaloT95dYRE',
        yt: 'QaloT95dYRE',
        title: 'Judwaa (HD) Full Hindi Comedy Movie | Salman Khan, Karisma Kapoor, Rambha',
        poster: 'https://i.ytimg.com/vi/QaloT95dYRE/hqdefault.jpg',
        duration: '2:18:30',
        rating: '4.9',
        category: 'YouTube Video',
        channel: 'Shemaroo'
    },
    {
        videoId: 'eOEGcZupyWU',
        yt: 'eOEGcZupyWU',
        title: 'Karan Arjun (1995) Full Hindi Action Movie | Shah Rukh Khan, Salman Khan, Kajol',
        poster: 'https://i.ytimg.com/vi/eOEGcZupyWU/hqdefault.jpg',
        duration: '2:45:00',
        rating: '4.9',
        category: 'YouTube Video',
        channel: 'Ultra Bollywood'
    },
    {
        videoId: '2mwVKYPl4P8',
        yt: '2mwVKYPl4P8',
        title: 'Sanam Bewafa {HD} Superhit Romantic Movie | Salman Khan, Chandni, Danny',
        poster: 'https://i.ytimg.com/vi/2mwVKYPl4P8/hqdefault.jpg',
        duration: '2:38:12',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Shemaroo'
    },
    {
        videoId: 'Js2C11L7DU4',
        yt: 'Js2C11L7DU4',
        title: 'Biwi Ho To Aisi Full Movie | Salman Khan First Movie | Rekha, Farooq Shaikh',
        poster: 'https://i.ytimg.com/vi/Js2C11L7DU4/hqdefault.jpg',
        duration: '2:14:40',
        rating: '4.7',
        category: 'YouTube Video',
        channel: 'NH Studioz'
    },
    {
        videoId: '8YcicFH4ODQ',
        yt: '8YcicFH4ODQ',
        title: 'Suryavanshi | Hindi Full Movie | Salman Khan | Amrita Singh | Hindi Action Movie',
        poster: 'https://i.ytimg.com/vi/8YcicFH4ODQ/hqdefault.jpg',
        duration: '2:24:15',
        rating: '4.6',
        category: 'YouTube Video',
        channel: 'Bolly Blockbuster'
    },
    {
        videoId: 'ZvdIpqnHf5g',
        yt: 'ZvdIpqnHf5g',
        title: 'Salman Khan Birthday Special | Yeh Majhdhaar HD | Rahul Roy, Manisha Koirala',
        poster: 'https://i.ytimg.com/vi/ZvdIpqnHf5g/hqdefault.jpg',
        duration: '2:15:20',
        rating: '4.7',
        category: 'YouTube Video',
        channel: 'Goldmines Bollywood'
    },
    {
        videoId: 'YBXtjHi2HZg',
        yt: 'YBXtjHi2HZg',
        title: 'Kya Zamana Aa Gaya | Yeh Majhdhaar 1996 Songs | Salman Khan',
        poster: 'https://i.ytimg.com/vi/YBXtjHi2HZg/hqdefault.jpg',
        duration: '6:27',
        rating: '4.9',
        category: 'YouTube Video',
        channel: 'Goldmines Gaane Sune Ansune'
    },
    {
        videoId: 'XaFnsdQg3l8',
        yt: 'XaFnsdQg3l8',
        title: 'Main Isse Mohabbat Karta Hoon | Yeh Majhdhaar 1996 Songs | Salman Khan',
        poster: 'https://i.ytimg.com/vi/XaFnsdQg3l8/hqdefault.jpg',
        duration: '6:06',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Goldmines Gaane Sune Ansune'
    },
    {
        videoId: 'GLGUKqqu7sQ',
        yt: 'GLGUKqqu7sQ',
        title: 'Kung Fu Full Action Movie | Ram Charan | Pooja Hegde | South Hindi Action Movie',
        poster: 'https://i.ytimg.com/vi/GLGUKqqu7sQ/hqdefault.jpg',
        duration: '2:10:00',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Movie Zilla - Hindi Movies'
    },
    {
        videoId: 'UJHjQBA0Gc4',
        yt: 'UJHjQBA0Gc4',
        title: 'TARGET: THE BLACK COMMANDO - Hindi Dubbed Full Movie | Gopichand, Mehreen',
        poster: 'https://i.ytimg.com/vi/UJHjQBA0Gc4/hqdefault.jpg',
        duration: '2:05:00',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'ADMD South Flix'
    },
    {
        videoId: 'vXwRYN5AU2Q',
        yt: 'vXwRYN5AU2Q',
        title: 'ROBBERY Vijay Thalapathy Hindi Dubbed Action Movie | South Indian Movie',
        poster: 'https://i.ytimg.com/vi/vXwRYN5AU2Q/hqdefault.jpg',
        duration: '2:15:30',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Sur Hindi Manoranjan'
    },
    {
        videoId: '4XowbIYI6wM',
        yt: '4XowbIYI6wM',
        title: 'सुपरहिट (HD) ब्लॉकबस्टर साउथ इंडियन हिंदी डब्ड एक्शन मूवी || Jakkana',
        poster: 'https://i.ytimg.com/vi/4XowbIYI6wM/hqdefault.jpg',
        duration: '2:08:40',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Movies Digital'
    },
    {
        videoId: 'x2SeyqGjySs',
        yt: 'x2SeyqGjySs',
        title: 'MISSION PAK | Full Hindi Dubbed Movie | Allu Arjun & Kareena Kapoor',
        poster: 'https://i.ytimg.com/vi/x2SeyqGjySs/hqdefault.jpg',
        duration: '2:20:10',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Super South Movies'
    },
    {
        videoId: '8wtBevf0GA8',
        yt: '8wtBevf0GA8',
        title: "The Wolf's Revenge | Full Action Fantasy Movie | HD Stream",
        poster: 'https://i.ytimg.com/vi/8wtBevf0GA8/hqdefault.jpg',
        duration: '2h 22m',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Titan Entertainment'
    },
    {
        videoId: 'crEH4dKuKOY',
        yt: 'crEH4dKuKOY',
        title: 'Jason Statham & Josh Harnett ELITE SPY - Hollywood English Movie',
        poster: 'https://i.ytimg.com/vi/crEH4dKuKOY/hqdefault.jpg',
        duration: '1h 45m',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Blockbuster English Movies'
    },
    {
        videoId: 'SO2XafPXgm0',
        yt: 'SO2XafPXgm0',
        title: 'AAKHRI CHAAL AB KAUN BACHEGA | Vijay Sethupathi | South Action Hindi Dubbed',
        poster: 'https://i.ytimg.com/vi/SO2XafPXgm0/hqdefault.jpg',
        duration: '2:12:00',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Wam India Movie Talkies'
    },
    {
        videoId: 'MgXY8B4bXn0',
        yt: 'MgXY8B4bXn0',
        title: 'Jason Statham In ONE MAN WAR - Hollywood Free English Movie HD',
        poster: 'https://i.ytimg.com/vi/MgXY8B4bXn0/hqdefault.jpg',
        duration: '1h 50m',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Hollywood English Collection'
    },
    {
        videoId: 'zeVWTY31Vn8',
        yt: 'zeVWTY31Vn8',
        title: 'Top 30 Romantic Hindi Songs | Audio Jukebox | Bollywood Love Songs',
        poster: 'https://i.ytimg.com/vi/zeVWTY31Vn8/hqdefault.jpg',
        duration: '2:30:00',
        rating: '4.9',
        category: 'YouTube Video',
        channel: 'Sony Music India'
    },
    {
        videoId: 'LElOSR7cJyM',
        yt: 'LElOSR7cJyM',
        title: 'Top 20 Bollywood Romance | Audio Jukebox | Best Hindi Love Songs',
        poster: 'https://i.ytimg.com/vi/LElOSR7cJyM/hqdefault.jpg',
        duration: '1:45:00',
        rating: '4.9',
        category: 'YouTube Video',
        channel: 'YRF Music'
    },
    {
        videoId: 'PWyXe6fzsmM',
        yt: 'PWyXe6fzsmM',
        title: "Bollywood 90's Romantic Songs | Video Jukebox | Hindi Love Songs",
        poster: 'https://i.ytimg.com/vi/PWyXe6fzsmM/hqdefault.jpg',
        duration: '1:55:00',
        rating: '4.9',
        category: 'YouTube Video',
        channel: 'Tips Official'
    },
    {
        videoId: '2ohXK1kSX8A',
        yt: '2ohXK1kSX8A',
        title: 'BLACK VIOLET : Angelina Jolie | New Action Movie | Full Movie 4K',
        poster: 'https://i.ytimg.com/vi/2ohXK1kSX8A/hqdefault.jpg',
        duration: '1h 33m',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Joy Drama'
    },
    {
        videoId: 'Vzg7hNXk7lo',
        yt: 'Vzg7hNXk7lo',
        title: 'THE MERGER - Latest Full Movie HD Stream',
        poster: 'https://i.ytimg.com/vi/Vzg7hNXk7lo/hqdefault.jpg',
        duration: '1h 34m',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Uche Montana TV'
    },
    {
        videoId: '9Tw7oOVaUEE',
        yt: '9Tw7oOVaUEE',
        title: 'DEATH ORDER : Angelina Jolie | New Action Movie | Full Movie 4K',
        poster: 'https://i.ytimg.com/vi/9Tw7oOVaUEE/hqdefault.jpg',
        duration: '1h 32m',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Joy Drama'
    },
    {
        videoId: 'KuEzbaxEdww',
        yt: 'KuEzbaxEdww',
        title: 'LOVE & FAITH - Latest Full Movie HD Stream',
        poster: 'https://i.ytimg.com/vi/KuEzbaxEdww/hqdefault.jpg',
        duration: '1h 40m',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Amal motion pictures'
    },
    {
        videoId: 'qy5gcu2zRIs',
        yt: 'qy5gcu2zRIs',
        title: 'SHADOW FIGHT : Jackie Chan | NEW ACTION Movie | Full Movie 4K',
        poster: 'https://i.ytimg.com/vi/qy5gcu2zRIs/hqdefault.jpg',
        duration: '1h 36m',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'X Drama'
    },
    {
        videoId: 'hNbRVElRkes',
        yt: 'hNbRVElRkes',
        title: 'ENCOUNTER 2 | New Released Full Action Thriller South Hindi Dubbed Movie',
        poster: 'https://i.ytimg.com/vi/hNbRVElRkes/hqdefault.jpg',
        duration: '2:15:00',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'Super South Movies'
    },
    {
        videoId: 'KpUHwT29n20',
        yt: 'KpUHwT29n20',
        title: 'Revolver Rita | Keerthy Suresh South Action Movie HD',
        poster: 'https://i.ytimg.com/vi/KpUHwT29n20/hqdefault.jpg',
        duration: '2:05:00',
        rating: '4.8',
        category: 'YouTube Video',
        channel: 'RKD Studios'
    }
];

// Popular Indian & International actors/superstars for highly targeted recommendations
const POPULAR_ACTOR_NAMES = [
    // South Superstars
    'Allu Arjun', 'Prabhas', 'Ram Charan', 'Jr NTR', 'NTR', 'Mahesh Babu',
    'Thalapathy Vijay', 'Vijay', 'Ajith Kumar', 'Ajith', 'Suriya', 'Dhanush',
    'Chiyaan Vikram', 'Vikram', 'Kamal Haasan', 'Rajinikanth', 'Yash', 'Rishab Shetty',
    'Ravi Teja', 'Nani', 'Vijay Sethupathi', 'Sivakarthikeyan', 'Karthi', 'Nagarjuna',
    'Venkatesh', 'Chiranjeevi', 'Balakrishna', 'Puneeth Rajkumar', 'Upendra', 'Sudeep', 'Kiccha Sudeep',
    'Dulquer Salmaan', 'Fahadh Faasil', 'Mohanlal', 'Mammootty', 'Prithviraj Sukumaran', 'Tovino Thomas',
    'Vijay Deverakonda', 'Naga Chaitanya', 'Akhil Akkineni', 'Ram Pothineni', 'Kalyan Ram',
    'Varun Tej', 'Sai Dharam Tej', 'Bellamkonda Sreenivas',
    // Bollywood Superstars
    'Salman Khan', 'Shah Rukh Khan', 'SRK', 'Aamir Khan', 'Akshay Kumar', 'Ajay Devgn', 'Ajay Devgan',
    'Hrithik Roshan', 'Ranbir Kapoor', 'Ranveer Singh', 'Shahid Kapoor', 'Sunny Deol', 'Bobby Deol',
    'Dharmendra', 'Amitabh Bachchan', 'Mithun Chakraborty', 'Sanjay Dutt', 'John Abraham', 'Tiger Shroff',
    'Varun Dhawan', 'Sidharth Malhotra', 'Vicky Kaushal', 'Kartik Aaryan', 'Ayushmann Khurrana',
    'Rajkummar Rao', 'Nawazuddin Siddiqui', 'Emraan Hashmi', 'Saif Ali Khan', 'Anil Kapoor',
    'Jackie Shroff', 'Govinda', 'Suniel Shetty', 'Arshad Warsi', 'Riteish Deshmukh', 'Paresh Rawal',
    // Leading Actresses
    'Deepika Padukone', 'Katrina Kaif', 'Alia Bhatt', 'Samantha', 'Rashmika Mandanna',
    'Nayanthara', 'Anushka Shetty', 'Kajal Aggarwal', 'Tamannaah', 'Pooja Hegde',
    'Keerthy Suresh', 'Trisha', 'Shruti Haasan', 'Kiara Advani', 'Kriti Sanon', 'Shraddha Kapoor',
    'Disha Patani', 'Kareena Kapoor', 'Priyanka Chopra', 'Rani Mukerji', 'Preity Zinta', 'Kajol',
    'Madhuri Dixit', 'Aishwarya Rai', 'Vidya Balan', 'Taapsee Pannu', 'Mrunal Thakur', 'Sai Pallavi', 'Sreeleela',
    // Hollywood Action Stars
    'Tom Cruise', 'Dwayne Johnson', 'The Rock', 'Vin Diesel', 'Jason Statham', 'Keanu Reeves',
    'Jackie Chan', 'Arnold Schwarzenegger', 'Sylvester Stallone', 'Bruce Willis', 'Will Smith', 'Chris Hemsworth'
];

const FAMOUS_MOVIE_TO_STAR = {
    'pushpa': 'Allu Arjun', 'kgf': 'Yash', 'k.g.f': 'Yash', 'bahubali': 'Prabhas', 'baahubali': 'Prabhas',
    'salaar': 'Prabhas', 'kalki': 'Prabhas', 'saaho': 'Prabhas', 'rrr': 'Ram Charan', 'magadheera': 'Ram Charan',
    'rangasthalam': 'Ram Charan', 'game changer': 'Ram Charan', 'devara': 'Jr NTR', 'janatha garage': 'Jr NTR',
    'temper': 'Jr NTR', 'guntur kaaram': 'Mahesh Babu', 'sarileru neekevvaru': 'Mahesh Babu', 'maharshi': 'Mahesh Babu',
    'srimanthudu': 'Mahesh Babu', 'dookudu': 'Mahesh Babu', 'pokiri': 'Mahesh Babu', 'leo': 'Thalapathy Vijay',
    'master': 'Thalapathy Vijay', 'beast': 'Thalapathy Vijay', 'varisu': 'Thalapathy Vijay', 'mersal': 'Thalapathy Vijay',
    'sarkar': 'Thalapathy Vijay', 'theri': 'Thalapathy Vijay', 'bigil': 'Thalapathy Vijay', 'jailer': 'Rajinikanth',
    'robot': 'Rajinikanth', 'enthiran': 'Rajinikanth', 'vikram': 'Kamal Haasan', 'indian': 'Kamal Haasan',
    'kantara': 'Rishab Shetty', 'asuran': 'Dhanush', 'karnan': 'Dhanush', 'soorarai pottru': 'Suriya',
    'jai bhim': 'Suriya', 'singam': 'Suriya', 'dhamaka': 'Ravi Teja', 'krack': 'Ravi Teja',
    'hi nanna': 'Nani', 'dasara': 'Nani', 'valimai': 'Ajith Kumar', 'thunivu': 'Ajith Kumar',
    'radhe': 'Salman Khan', 'tiger': 'Salman Khan', 'dabangg': 'Salman Khan', 'sultan': 'Salman Khan',
    'bajrangi bhaijaan': 'Salman Khan', 'kick': 'Salman Khan', 'bodyguard': 'Salman Khan', 'wanted': 'Salman Khan',
    'judwaa': 'Salman Khan', 'jawan': 'Shah Rukh Khan', 'pathaan': 'Shah Rukh Khan', 'raees': 'Shah Rukh Khan',
    'chennai express': 'Shah Rukh Khan', 'don': 'Shah Rukh Khan', 'dunki': 'Shah Rukh Khan',
    'singham': 'Ajay Devgn', 'drishyam': 'Ajay Devgn', 'golmaal': 'Ajay Devgn', 'shaitaan': 'Ajay Devgn',
    'tanhaji': 'Ajay Devgn', 'animal': 'Ranbir Kapoor', 'sanju': 'Ranbir Kapoor', 'brahmastra': 'Ranbir Kapoor',
    'rockstar': 'Ranbir Kapoor', 'war': 'Hrithik Roshan', 'krrish': 'Hrithik Roshan', 'fighter': 'Hrithik Roshan',
    'dhoom': 'Hrithik Roshan', 'rowdy rathore': 'Akshay Kumar', 'sooryavanshi': 'Akshay Kumar',
    'khiladi': 'Akshay Kumar', 'hera pheri': 'Akshay Kumar', 'housefull': 'Akshay Kumar',
    'bhool bhulaiyaa': 'Kartik Aaryan', 'gadar': 'Sunny Deol', 'border': 'Sunny Deol',
    'dangal': 'Aamir Khan', '3 idiots': 'Aamir Khan', 'pk': 'Aamir Khan', 'kabir singh': 'Shahid Kapoor',
    'simmba': 'Ranveer Singh'
};

// Intelligently extract actor from movie title or cast, and compute clean title to exclude
function extractActorAndCleanTitle(movie) {
    const rawTitle = safeTrim(movie?.title || movie?.name || '');
    const cast = movie?.cast;
    let actorName = '';

    // 1. Detect actor name from rawTitle
    for (const actor of POPULAR_ACTOR_NAMES) {
        const regex = new RegExp('\\b' + actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
        if (regex.test(rawTitle)) {
            actorName = actor;
            break;
        }
    }

    // 2. Check cast if actor not found from title
    if (!actorName && cast) {
        const castStr = Array.isArray(cast) ? cast.join(' ') : String(cast);
        for (const actor of POPULAR_ACTOR_NAMES) {
            const regex = new RegExp('\\b' + actor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
            if (regex.test(castStr)) {
                actorName = actor;
                break;
            }
        }
        if (!actorName) {
            const firstCast = Array.isArray(cast) ? cast[0] : String(cast).split(/[,/|]+/)[0];
            const trimmed = (firstCast || '').trim();
            if (trimmed.length > 2 && !/youtube|channel|goldmines|shemaroo|ultra|creator|stream/i.test(trimmed)) {
                actorName = trimmed;
            }
        }
    }

    // 3. Check popular movie star mapping
    const lowTitle = rawTitle.toLowerCase();
    if (!actorName) {
        for (const [mName, star] of Object.entries(FAMOUS_MOVIE_TO_STAR)) {
            if (lowTitle.includes(mName)) {
                actorName = star;
                break;
            }
        }
    }

    // 4. Extract clean movie title for exclusion (to avoid duplicate uploads of the SAME movie)
    let cleaned = rawTitle
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\((19|20)\d{2}\)/g, ' ')
        .replace(/\b(full\s+movie|full\s+hindi\s+movie|hindi\s+dubbed\s+full\s+movie|hindi\s+dubbed\s+movie|hindi\s+dubbed|blockbuster\s+movie|blockbuster|superhit\s+movie|action\s+movie|romantic\s+movie|comedy\s+movie|hindi\s+movie|south\s+movie|movie|hd|4k|1080p|720p|latest|new|trailer|teaser|songs|song|video|scene|scenes|official)\b/gi, ' ');

    if (actorName) {
        const aRegex = new RegExp('\\b' + actorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
        cleaned = cleaned.replace(aRegex, ' ');
    }

    cleaned = cleaned.replace(/[|:–—].*$/, ' ');
    cleaned = cleaned.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

    return {
        actorName,
        cleanMovieTitle: cleaned,
        rawTitle
    };
}

// Asynchronously load exactly 20 related YouTube posts (actor-based, excluding current movie duplicates)
async function loadYouTubeRelatedPosts(currentMovie, currentYtId) {
    const carousel = document.getElementById('relatedCarousel');
    if (!carousel) return;

    // Show loading spinner
    carousel.className = 'yt-feed-container';
    carousel.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; padding: 30px 0; color: #8b949e; gap: 10px; font-size: 13px;">
            <i class="fa-solid fa-spinner fa-spin" style="color: #ff0000; font-size: 22px;"></i>
            <span>Finding related actor movie posts...</span>
        </div>
    `;

    const { actorName, cleanMovieTitle, rawTitle } = extractActorAndCleanTitle(currentMovie);

    // Update section title to reflect actor-focused related movies
    const relatedHeader = document.getElementById('relatedSectionTitle');
    if (relatedHeader) {
        if (actorName) {
            relatedHeader.innerHTML = `<i class="fa-brands fa-youtube" style="color: #ff0000; margin-right: 6px;"></i> ${actorName} Movies & Recommendations`;
        } else {
            relatedHeader.innerHTML = `<i class="fa-brands fa-youtube" style="color: #ff0000; margin-right: 6px;"></i> Related YouTube Movies`;
        }
    }

    // Helper: detect if a video title is the exact same movie that is currently playing
    const isSameCurrentMovie = (title) => {
        if (!cleanMovieTitle || cleanMovieTitle.length < 3) return false;
        const vLow = (title || '').toLowerCase();
        const cLow = cleanMovieTitle.toLowerCase();
        if (vLow.includes(cLow)) return true;
        const words = cLow.split(/\s+/).filter(w => w.length > 2);
        if (words.length > 0 && words.filter(w => vLow.includes(w)).length >= Math.min(2, words.length)) return true;
        return false;
    };

    // Helper: normalize core title for deduplication
    const normalizeCoreTitle = (t) => {
        return (t || '').toLowerCase()
            .replace(/\b(full\s+movie|hindi\s+dubbed|blockbuster|superhit|action|comedy|hd|4k|1080p|720p|movie|south|bollywood|new|latest|official)\b/gi, '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/\((19|20)\d{2}\)/g, '')
            .replace(/[-_:|]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim().slice(0, 18);
    };

    let ytList = [];
    const seenIds = new Set();
    if (currentYtId) seenIds.add(currentYtId);
    const seenCores = new Set();

    // 1. Try local dev-server / live backend endpoint
    try {
        const fetchUrl = `/api/youtube-related?q=${encodeURIComponent(rawTitle)}&actor=${encodeURIComponent(actorName || '')}&exclude=${encodeURIComponent(cleanMovieTitle || '')}&v=${encodeURIComponent(currentYtId || '')}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2600);
        const res = await fetch(fetchUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                for (const item of data) {
                    const id = item.videoId || item.yt || item.id;
                    if (!id || seenIds.has(id)) continue;
                    if (isSameCurrentMovie(item.title)) continue;

                    const core = normalizeCoreTitle(item.title);
                    if (core.length >= 4 && seenCores.has(core)) continue;
                    if (core.length >= 4) seenCores.add(core);

                    seenIds.add(id);
                    ytList.push(item);
                }
            }
        }
    } catch (e) {}

    // 2. Client-side Live Invidious Search targeted at the actor's OTHER movies
    if (ytList.length < 20) {
        try {
            const queriesToSearch = [];
            if (actorName) {
                queriesToSearch.push(`${actorName} hindi dubbed full movie`);
                queriesToSearch.push(`${actorName} blockbuster full movie hindi`);
                queriesToSearch.push(`${actorName} action movie hindi dubbed`);
            } else {
                queriesToSearch.push(`${cleanMovieTitle || rawTitle} full movie hindi`);
                queriesToSearch.push('latest hindi dubbed full movie');
            }

            for (const q of queriesToSearch) {
                if (ytList.length >= 20) break;
                const liveItems = await fetchInvidiousSearch(q);
                if (Array.isArray(liveItems) && liveItems.length > 0) {
                    for (const item of liveItems) {
                        const id = item.videoId || item.yt || item.id;
                        if (!id || seenIds.has(id)) continue;
                        if (isSameCurrentMovie(item.title)) continue;

                        const core = normalizeCoreTitle(item.title);
                        if (core.length >= 4 && seenCores.has(core)) continue;
                        if (core.length >= 4) seenCores.add(core);

                        seenIds.add(id);
                        ytList.push({
                            videoId: id,
                            yt: id,
                            id: `stream_${id}`,
                            title: item.title,
                            poster: item.poster || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                            duration: item.duration || 'Full HD',
                            rating: item.rating || '4.8',
                            category: 'YouTube Video',
                            channel: item.author || 'YouTube'
                        });
                        if (ytList.length >= 20) break;
                    }
                }
            }
        } catch (e) {
            console.warn('Invidious live fetch error:', e);
        }
    }

    // 3. Fallback from CURATED_CLOUD_CATALOG & CURATED_YOUTUBE_CATALOG (prioritizing actor, excluding current movie)
    if (ytList.length < 20) {
        const cloudCatalog = (typeof CURATED_CLOUD_CATALOG !== 'undefined' && Array.isArray(CURATED_CLOUD_CATALOG)) ? CURATED_CLOUD_CATALOG : [];
        const combinedPool = [
            ...CURATED_YOUTUBE_CATALOG,
            ...cloudCatalog.map(c => ({
                videoId: c.yt,
                yt: c.yt,
                id: c.id,
                title: c.title,
                poster: c.poster || `https://i.ytimg.com/vi/${c.yt}/hqdefault.jpg`,
                duration: c.duration || 'Full HD',
                rating: c.rating || '4.8',
                category: 'YouTube Video',
                channel: c.author || 'YouTube'
            }))
        ];

        // Sort curated catalog by actor match first, then relevant category
        const sortedCurated = combinedPool.sort((a, b) => {
            const aTitle = (a.title || '').toLowerCase();
            const bTitle = (b.title || '').toLowerCase();
            let aScore = 0;
            let bScore = 0;

            if (actorName) {
                const actLow = actorName.toLowerCase();
                if (aTitle.includes(actLow)) aScore += 100;
                if (bTitle.includes(actLow)) bScore += 100;
            }

            // Exclude current movie
            if (isSameCurrentMovie(a.title)) aScore -= 500;
            if (isSameCurrentMovie(b.title)) bScore -= 500;

            return bScore - aScore;
        });

        for (const item of sortedCurated) {
            if (ytList.length >= 20) break;
            const id = item.videoId || item.yt || item.id;
            if (id && !seenIds.has(id) && !isSameCurrentMovie(item.title)) {
                seenIds.add(id);
                ytList.push(item);
            }
        }
    }

    // Filter out current playing video one final time
    ytList = ytList.filter(v => {
        const vid = v.videoId || v.yt || v.id;
        return vid && vid !== currentYtId && !isSameCurrentMovie(v.title);
    });

    // Exactly 20 YouTube posts
    const final20 = ytList.slice(0, 20);

    carousel.className = 'yt-feed-container';
    carousel.innerHTML = '';
    final20.forEach(v => {
        const card = document.createElement('div');
        card.className = 'yt-post-item';

        const vidId = v.videoId || v.yt || v.id;
        const ytMovieObj = {
            id: vidId,
            title: v.title || 'YouTube Video',
            name: v.title || 'YouTube Video',
            yt: vidId,
            poster: v.poster || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
            category: 'YouTube Video',
            cast: [v.channel || v.author || 'YouTube'],
            rating: v.rating || '4.8',
            duration: v.duration || 'Full HD'
        };

        card.onclick = () => {
            window.openPlayer(ytMovieObj);
            showToast(`Playing YouTube: ${ytMovieObj.title}`);
        };

        const cardTitle = ytMovieObj.title;
        const channelName = v.channel || v.author || 'YouTube Channel';
        const durationText = ytMovieObj.duration;
        const viewsText = v.views || '1.5M views';

        card.innerHTML = `
            <div class="yt-thumb-wrapper">
                <img class="yt-thumb-img" 
                     src="${ytMovieObj.poster}" 
                     alt="${cardTitle}"
                     loading="lazy" 
                     decoding="async" 
                     referrerpolicy="no-referrer"
                     onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=60';">
                ${durationText ? `<span class="yt-thumb-duration">${durationText}</span>` : ''}
            </div>
            <div class="yt-post-details">
                <div class="yt-channel-avatar">
                    <i class="fa-brands fa-youtube"></i>
                </div>
                <div class="yt-details-box">
                    <div class="yt-title-text" title="${cardTitle}">${cardTitle}</div>
                    <div class="yt-channel-row">
                        <span class="yt-channel-name">${channelName} <i class="fa-solid fa-circle-check yt-verified-badge"></i></span>
                        <span class="yt-meta-dot">•</span>
                        <span>${viewsText}</span>
                        <span class="yt-meta-dot">•</span>
                        <span>${durationText}</span>
                    </div>
                </div>
                <button class="yt-menu-dots-btn" type="button" aria-label="Action" onclick="event.stopPropagation();">
                    <i class="fa-solid fa-ellipsis-vertical"></i>
                </button>
            </div>
        `;
        carousel.appendChild(card);
    });

    const countBadge = document.getElementById('relatedCountBadge');
    if (countBadge) {
        countBadge.innerText = `${final20.length} YouTube Posts`;
    }
}

window.switchRelatedView = function(mode) {
    const container = document.getElementById('relatedCarousel');
    const gridBtn = document.getElementById('relatedViewGridBtn');
    const scrollBtn = document.getElementById('relatedViewScrollBtn');
    if (!container) return;

    if (container.classList.contains('yt-feed-container')) {
        // YouTube Single-Post mode toggle
        if (mode === 'compact' || mode === 'scroll') {
            container.classList.add('yt-list-compact');
            if (gridBtn) gridBtn.classList.remove('active', 'yt-active');
            if (scrollBtn) scrollBtn.classList.add('active', 'yt-active');
        } else {
            container.classList.remove('yt-list-compact');
            if (gridBtn) gridBtn.classList.add('active', 'yt-active');
            if (scrollBtn) scrollBtn.classList.remove('active', 'yt-active');
        }
        return;
    }

    if (mode === 'scroll') {
        container.className = 'horizontal-scroll-container';
        container.querySelectorAll('.movie-card').forEach(c => {
            c.style.flex = "0 0 130px";
            c.style.minWidth = "130px";
            c.style.width = "auto";
        });
        if (gridBtn) gridBtn.classList.remove('active');
        if (scrollBtn) scrollBtn.classList.add('active');
    } else {
        container.className = 'gallery-grid';
        container.querySelectorAll('.movie-card').forEach(c => {
            c.style.flex = "none";
            c.style.minWidth = "unset";
            c.style.width = "100%";
        });
        if (gridBtn) gridBtn.classList.add('active');
        if (scrollBtn) scrollBtn.classList.remove('active');
    }
};

function renderPlayerSection(movie, activeServerIndex = 0, preserveFullscreen = false) {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    destroyCurrentPlyr(preserveFullscreen);
    currentActiveServerIndex = activeServerIndex;

    const sourceInfo = detectMovieVideoSource(movie);
    const servers = getMovieServers(movie);
    const activeServer = servers[activeServerIndex] || servers[0];
    const isYouTube = (activeServer.type === 'yt') || (sourceInfo.type === 'yt');
    const isGDrive = (activeServer.type === 'gdrive') || (sourceInfo.type === 'gdrive') ||
                     (activeServer.url && activeServer.url.startsWith('http') && (
                         (activeServer.url.includes('drive.google.com') && (activeServer.url.includes('/preview') || activeServer.url.includes('/view') || activeServer.url.includes('/file/d/'))) ||
                         (activeServer.url.includes('docs.google.com') && activeServer.url.includes('/preview'))
                     ));

    // Find 20 related movies
    const relatedMovies = getRelatedMovies(movie, 20);

    const serverPills = servers.map((s, idx) => `
        <button class="server-pill ${idx === activeServerIndex ? 'active' : ''}" onclick="switchServer(${idx})">
            <i class="fa-solid ${s.type === 'yt' ? 'fa-play' : s.type === 'gdrive' ? 'fa-cloud' : 'fa-server'}"></i> ${s.name}
        </button>
    `).join('');

    const titleText = movie.title || movie.name || 'Movie Player';
    const ratingText = movie.rating || '4.8';
    const categoryText = movie.category || 'General';

    // Player header badge & title
    let playerBadgeText = 'Plyr 1080p';
    let playerBadgeStyle = 'background: rgba(0, 210, 255, 0.15); color: #00d2ff; border: 1px solid rgba(0, 210, 255, 0.3);';
    let topBarIcon = '<i class="fa-solid fa-play" style="color: #00d2ff; font-size: 10px;"></i>';
    let topBarText = 'Plyr HD Player';

    if (isYouTube) {
        playerBadgeText = 'Cloud Stream HD';
        playerBadgeStyle = 'background: rgba(0, 210, 255, 0.15); color: #00d2ff; border: 1px solid rgba(0, 210, 255, 0.3);';
        topBarIcon = '<i class="fa-solid fa-play" style="color: #00d2ff; font-size: 11px;"></i>';
        topBarText = 'Cloud Stream Player';
    } else if (isGDrive) {
        playerBadgeText = 'Drive Iframe 1080p';
        playerBadgeStyle = 'background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3);';
        topBarIcon = '<i class="fa-solid fa-video" style="color: #22c55e; font-size: 11px;"></i>';
        topBarText = 'Google Drive Iframe Player';
    } else if (sourceInfo.type === 'video') {
        playerBadgeText = 'Worker CDN 1080p';
        playerBadgeStyle = 'background: rgba(0, 210, 255, 0.15); color: #00d2ff; border: 1px solid rgba(0, 210, 255, 0.3);';
        topBarIcon = '<i class="fa-solid fa-bolt" style="color: #00d2ff; font-size: 10px;"></i>';
        topBarText = 'Cloudflare Worker Stream Player';
    } else if (sourceInfo.type === 'drc') {
        playerBadgeText = 'Plyr Direct 1080p';
        playerBadgeStyle = 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);';
        topBarIcon = '<i class="fa-solid fa-play" style="color: #10b981; font-size: 10px;"></i>';
        topBarText = 'Plyr Direct Player';
    }

    // Parse cast list for clickable actor buttons
    let castList = [];
    if (Array.isArray(movie.cast)) {
        castList = movie.cast.map(c => String(c).trim()).filter(Boolean);
    } else if (typeof movie.cast === 'string' && movie.cast.trim().length > 0) {
        castList = movie.cast.split(/[,/|•]+/).map(c => c.trim()).filter(Boolean);
    }

    const castHtml = castList.length > 0 ? `
        <div class="player-cast-header">
            <span class="player-cast-title"><strong>Starring:</strong></span>
            <span class="player-cast-subtitle">Tap an actor to see all their movies</span>
        </div>
        <div class="player-cast-tags">
            ${castList.map(actor => `
                <button type="button" class="cast-pill-btn" onclick="filterByCast('${encodeURIComponent(actor).replace(/'/g, "%27")}')">
                    <i class="fa-solid fa-user"></i>
                    <span>${actor}</span>
                </button>
            `).join('')}
        </div>
    ` : `
        <div class="player-cast-header">
            <span class="player-cast-title"><strong>Starring:</strong></span>
        </div>
        <div style="font-size: 13px; color: #8b949e; margin-top: 4px;">All-Star Cast</div>
    `;

    container.innerHTML = `
        <div class="player-wrapper">
            <!-- Back Navigation Bar -->
            <div class="player-back-bar">
                <button class="back-nav-btn" onclick="exitPlayerView()">
                    <i class="fa-solid fa-arrow-left"></i> ${isInCloudStreamView ? 'Back to Watch Stream' : 'Back to Movies'}
                </button>
                <div style="font-size: 13px; color: #8b949e; display: flex; align-items: center; gap: 6px;">
                    ${topBarIcon}
                    <span>${topBarText}</span>
                </div>
            </div>

            <!-- Video Player Display: YouTube iframe OR Plyr Video Player -->
            <div class="player-video-box" id="activePlayerBox">
                ${isYouTube ? `
                    <iframe id="vdoSkyYouTube" class="player" src="${activeServer.url}" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen" allowfullscreen="true" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; margin: 0; padding: 0;"></iframe>
                    <!-- Touch surface overlay to capture user taps and gestures -->
                    <div class="yt-touch-surface" id="ytTouchSurface"></div>
                    <!-- Top portrait touch mask to prevent clicking YouTube channel/title in portrait mode -->
                    <div class="yt-top-portrait-mask"></div>
                    <!-- Protective Top Shield masking YouTube channel avatar & video title links in Fullscreen -->
                    <div class="yt-top-shield" id="ytTopShield">
                        <div class="yt-shield-top-left">
                            <button type="button" class="yt-shield-back-btn" onclick="window.triggerFullscreenPlayer(); event.stopPropagation();" title="Exit Fullscreen">
                                <i class="fa-solid fa-arrow-left"></i>
                            </button>
                            <span class="yt-shield-top-title">${titleText}</span>
                        </div>
                        <div class="yt-shield-top-right" style="display: flex; align-items: center; gap: 8px;">
                            <button type="button" class="yt-shield-back-btn" onclick="window.toggleYtQualitySettings(event);" title="Quality & Settings">
                                <i class="fa-solid fa-gear"></i>
                            </button>
                            <button type="button" class="yt-shield-back-btn" onclick="window.triggerFullscreenPlayer(); event.stopPropagation();" title="Exit Fullscreen">
                                <i class="fa-solid fa-compress"></i>
                            </button>
                        </div>
                    </div>
                    <!-- Touch Skip Visual Feedback Overlay -->
                    <div class="yt-touch-skip-overlay" id="ytTouchSkipOverlay">
                        <div class="yt-skip-anim yt-skip-left" id="ytSkipLeftAnim">
                            <i class="fa-solid fa-angles-left"></i>
                            <span>-10s</span>
                        </div>
                        <div class="yt-skip-anim yt-skip-right" id="ytSkipRightAnim">
                            <i class="fa-solid fa-angles-right"></i>
                            <span>+10s</span>
                        </div>
                    </div>

                    <!-- Protective Bottom Shield with Integrated Video Timeline & Controls -->
                    <div class="yt-bottom-shield" id="ytBottomShield">
                        <!-- Row 1: Interactive Video Progress Timeline (Seek Bar) -->
                        <div class="yt-timeline-container" id="ytTimelineContainer" onclick="handleTimelineClick(event)" onmousemove="handleTimelineHover(event)" onmouseleave="handleTimelineLeave()" title="Click or drag to seek">
                            <div class="yt-timeline-track" id="ytTimelineTrack">
                                <div class="yt-timeline-buffer" id="ytTimelineBuffer"></div>
                                <div class="yt-timeline-progress" id="ytTimelineProgress">
                                    <div class="yt-timeline-handle" id="ytTimelineHandle"></div>
                                </div>
                                <div class="yt-timeline-tooltip" id="ytTimelineTooltip">00:00</div>
                            </div>
                        </div>

                        <!-- Row 2: Play/Pause, Skip -10s/+10s, Timestamps, Auto Next, Next, Fullscreen -->
                        <div class="yt-bottom-bar-main">
                            <div class="yt-shield-left-controls">
                                <button type="button" class="yt-ctrl-btn" id="ytPlayPauseBtn" onclick="toggleYtPlayPause(); event.stopPropagation();" title="Play/Pause">
                                    <i class="fa-solid fa-play" id="ytPlayPauseIcon"></i>
                                </button>
                                <button type="button" class="yt-ctrl-btn yt-skip-btn" onclick="skipVideoSeconds(-10); event.stopPropagation();" title="Rewind 10 Seconds">
                                    <i class="fa-solid fa-rotate-left"></i>
                                    <span class="skip-num">10</span>
                                </button>
                                <button type="button" class="yt-ctrl-btn yt-skip-btn" onclick="skipVideoSeconds(10); event.stopPropagation();" title="Forward 10 Seconds">
                                    <i class="fa-solid fa-rotate-right"></i>
                                    <span class="skip-num">10</span>
                                </button>
                                <div class="yt-time-display" id="ytTimeDisplay">
                                    <span id="ytCurrentTime">00:00</span>
                                    <span class="yt-time-sep">/</span>
                                    <span id="ytDuration">00:00</span>
                                </div>
                            </div>

                            <div class="yt-shield-brand">
                                <i class="fa-solid fa-bolt" style="color: #00d2ff; font-size: 11px;"></i>
                                <span>Cloud Stream HD</span>
                            </div>

                            <div class="yt-shield-controls">
                                <button type="button" class="auto-next-pill-btn yt-shield-autonext ${isAutoNextEnabled ? 'active' : ''}" onclick="toggleAutoNext(); event.stopPropagation();" title="Toggle Auto Next">
                                    <i class="fa-solid ${isAutoNextEnabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                                    <span class="autonext-text">Auto Next: <strong>${isAutoNextEnabled ? 'ON' : 'OFF'}</strong></span>
                                </button>
                                <button type="button" class="quick-next-btn yt-shield-next-btn" onclick="playNextVideo(true); event.stopPropagation();" title="Play Next Stream">
                                    <i class="fa-solid fa-forward-step"></i> <span class="next-btn-text">Next</span>
                                </button>
                                <button type="button" class="yt-shield-gear-btn" id="ytShieldGearBtn" onclick="window.toggleYtQualitySettings(event);" title="Quality & Settings">
                                    <i class="fa-solid fa-gear" id="ytShieldGearIcon"></i>
                                </button>
                                <button type="button" class="yt-shield-fs-btn" id="ytShieldFsBtn" onclick="window.triggerFullscreenPlayer(); event.stopPropagation();" title="Toggle Fullscreen">
                                    <i class="fa-solid fa-expand"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Video Quality & Playback Settings Dropdown -->
                    <div class="yt-settings-menu" id="ytSettingsMenu" style="display: none;" onclick="event.stopPropagation();">
                        <div class="yt-settings-header">
                            <span><i class="fa-solid fa-gear" style="color: #00d2ff; margin-right: 5px;"></i> Quality & Settings</span>
                            <button type="button" class="yt-settings-close" onclick="window.closeYtSettingsMenu(event);" title="Close">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <!-- Video Resolution Quality -->
                        <div class="yt-settings-section-title">
                            <i class="fa-solid fa-sliders" style="color: #00d2ff;"></i> Video Quality
                        </div>
                        <div class="yt-quality-list" id="ytQualityList">
                            <div class="yt-quality-item" data-quality="auto" onclick="window.setYtVideoQuality('auto', event);">
                                <span>Auto (Best Quality)</span>
                                <i class="fa-solid fa-check yt-q-check" style="color: #00d2ff;"></i>
                            </div>
                            <div class="yt-quality-item" data-quality="hd1080" onclick="window.setYtVideoQuality('hd1080', event);">
                                <span>1080p Full HD</span>
                                <i class="fa-solid fa-check yt-q-check" style="display: none; color: #00d2ff;"></i>
                            </div>
                            <div class="yt-quality-item" data-quality="hd720" onclick="window.setYtVideoQuality('hd720', event);">
                                <span>720p HD</span>
                                <i class="fa-solid fa-check yt-q-check" style="display: none; color: #00d2ff;"></i>
                            </div>
                            <div class="yt-quality-item" data-quality="large" onclick="window.setYtVideoQuality('large', event);">
                                <span>480p SD</span>
                                <i class="fa-solid fa-check yt-q-check" style="display: none; color: #00d2ff;"></i>
                            </div>
                            <div class="yt-quality-item" data-quality="medium" onclick="window.setYtVideoQuality('medium', event);">
                                <span>360p Standard</span>
                                <i class="fa-solid fa-check yt-q-check" style="display: none; color: #00d2ff;"></i>
                            </div>
                            <div class="yt-quality-item" data-quality="small" onclick="window.setYtVideoQuality('small', event);">
                                <span>240p Data Saver</span>
                                <i class="fa-solid fa-check yt-q-check" style="display: none; color: #00d2ff;"></i>
                            </div>
                        </div>

                        <!-- Playback Speed -->
                        <div class="yt-settings-section-title">
                            <i class="fa-solid fa-gauge-high" style="color: #00d2ff;"></i> Playback Speed
                        </div>
                        <div class="yt-speed-row">
                            <button type="button" class="yt-speed-btn" data-speed="0.5" onclick="window.setYtPlaybackSpeed(0.5, event);">0.5x</button>
                            <button type="button" class="yt-speed-btn" data-speed="0.75" onclick="window.setYtPlaybackSpeed(0.75, event);">0.75x</button>
                            <button type="button" class="yt-speed-btn" data-speed="1" onclick="window.setYtPlaybackSpeed(1, event);">1x</button>
                            <button type="button" class="yt-speed-btn" data-speed="1.25" onclick="window.setYtPlaybackSpeed(1.25, event);">1.25x</button>
                            <button type="button" class="yt-speed-btn" data-speed="1.5" onclick="window.setYtPlaybackSpeed(1.5, event);">1.5x</button>
                            <button type="button" class="yt-speed-btn" data-speed="2" onclick="window.setYtPlaybackSpeed(2, event);">2x</button>
                        </div>

                        <!-- Touch Native YouTube Mode -->
                        <button type="button" class="yt-native-direct-touch-btn" onclick="window.enableDirectYtTouch(event);" title="Switch to direct YouTube player touch">
                            <i class="fa-brands fa-youtube" style="font-size: 14px;"></i>
                            <span>Touch Native YouTube Controls</span>
                        </button>
                    </div>

                    <!-- Floating Pill to Exit Direct YouTube Touch Mode -->
                    <div class="yt-exit-direct-touch" id="ytExitDirectTouch" style="display: none;" onclick="window.disableDirectYtTouch(event);">
                        <i class="fa-solid fa-arrow-left"></i>
                        <span>Restore App Controls</span>
                    </div>
                ` : isGDrive ? `
                    <!-- Google Drive Preview Iframe Player (Bypasses Plyr) -->
                    <iframe
                        id="vdoSkyGDrive"
                        class="player"
                        src="${activeServer.url}"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                        allowfullscreen
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; margin: 0; padding: 0; background: #000;"
                    ></iframe>
                    <!-- Floating Quick Exit Fullscreen Button for GDrive / Iframe -->
                    <button type="button" class="gdrive-floating-fs-btn" id="gdriveFloatingFsBtn" onclick="window.triggerFullscreenPlayer();" title="Exit Fullscreen">
                        <i class="fa-solid fa-compress"></i> Exit Fullscreen
                    </button>
                ` : `
                    <video id="vdoSkyPlyr" class="player" playsinline controls preload="metadata" poster="${movie.poster || ''}">
                        <source src="${activeServer.url}" type="video/mp4">
                        Your browser does not support HTML5 video.
                    </video>

                    <!-- Stream Error Fallback Notice -->
                    <div id="playerStreamErrorNotice" style="display: none; position: absolute; inset: 0; background: rgba(10,12,18,0.93); z-index: 30; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: #ffb703; margin-bottom: 10px;"></i>
                        <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 6px; color: #fff;">Stream Loading Interrupted</h3>
                        <p style="font-size: 12px; color: #8b949e; margin-bottom: 14px; max-width: 320px;">
                            This stream server is taking longer than expected. Please switch to another server to continue playing.
                        </p>
                        <button onclick="switchServer(${(activeServerIndex + 1) % servers.length})" style="background: #00d2ff; color: #1e1e2f; font-weight: bold; border: none; padding: 8px 18px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-rotate"></i> Try Server ${((activeServerIndex + 1) % servers.length) + 1}
                        </button>
                    </div>
                `}
            </div>

            <!-- Streaming Server Switcher & Auto Next Controls -->
            <div class="server-selector">
                <span class="server-label"><i class="fa-solid fa-bolt"></i> Stream Server:</span>
                ${serverPills}
                <div class="auto-next-server-wrap">
                    <button type="button" class="auto-next-pill-btn ${isAutoNextEnabled ? 'active' : ''}" onclick="toggleAutoNext()" title="Toggle Auto Next">
                        <i class="fa-solid ${isAutoNextEnabled ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                        <span>Auto Next: <strong>${isAutoNextEnabled ? 'ON' : 'OFF'}</strong></span>
                    </button>
                    <button type="button" class="quick-next-btn" onclick="playNextVideo(true)" title="Play Next Stream">
                        <i class="fa-solid fa-forward-step"></i> Next
                    </button>
                </div>
            </div>

            ${movie.episodes && movie.episodes.length > 0 ? `
            <!-- Episodes & Playlist System -->
            <div class="playlist-section" id="playerPlaylistSection">
                <div class="playlist-header">
                    <div class="playlist-title-left">
                        <i class="fa-solid fa-list-ol" style="color: #00d2ff; font-size: 16px;"></i>
                        <span class="playlist-main-title">Episodes / Playlist</span>
                        <span class="playlist-count-badge">${movie.episodes.length} Episodes</span>
                    </div>
                    <div class="playlist-nav-btns">
                        <button type="button" class="ep-nav-btn" onclick="window.goToPrevEpisode()" ${(window.currentActiveEpisodeIndex || 0) <= 0 ? 'disabled' : ''} title="Previous Episode">
                            <i class="fa-solid fa-backward-step"></i> Prev Ep
                        </button>
                        <button type="button" class="ep-nav-btn ep-nav-next" onclick="window.goToNextEpisode()" ${(window.currentActiveEpisodeIndex || 0) >= movie.episodes.length - 1 ? 'disabled' : ''} title="Next Episode">
                            Next Ep <i class="fa-solid fa-forward-step"></i>
                        </button>
                        <button type="button" class="ep-nav-btn ep-nav-fullscreen" id="epNavFullscreenBtn" onclick="window.triggerFullscreenPlayer()" title="Fullscreen Video Player">
                            <i class="fa-solid fa-expand"></i> Fullscreen
                        </button>
                    </div>
                </div>

                <div class="playlist-current-info">
                    <span class="now-playing-tag"><i class="fa-solid fa-circle-play"></i> NOW PLAYING:</span>
                    <span class="now-playing-ep-name">${(movie.episodes[window.currentActiveEpisodeIndex || 0]?.title) || ('Episode ' + ((window.currentActiveEpisodeIndex || 0) + 1))}</span>
                </div>

                ${movie.episodes.length > 6 ? `
                <div class="playlist-search-bar">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="playlistFilterInput" placeholder="Filter episode number or name..." oninput="window.filterPlaylistEpisodes(this.value)">
                </div>
                ` : ''}

                <div class="playlist-grid" id="playlistEpisodesGrid">
                    ${movie.episodes.map((ep, idx) => {
                        const isActive = idx === (window.currentActiveEpisodeIndex || 0);
                        const epTitle = (typeof ep === 'object' && ep ? (ep.title || ep.name) : '') || `Episode ${idx + 1}`;
                        const epLink = extractEpisodeUrl(ep);
                        const isEpDrivePreview = epLink.startsWith('http') && (
                            (epLink.includes('drive.google.com') && (epLink.includes('/preview') || epLink.includes('/view') || epLink.includes('/file/d/'))) ||
                            (epLink.includes('docs.google.com') && epLink.includes('/preview'))
                        );
                        const isEpYt = epLink.includes('youtube.com') || epLink.includes('youtu.be');
                        const epTagText = isEpDrivePreview ? 'Google Drive Embed' : (isEpYt ? 'Cloud Stream HD' : 'Plyr HD Stream');
                        return `
                            <button type="button" class="episode-pill-btn ${isActive ? 'active' : ''}" onclick="window.switchEpisode(${idx})" data-ep-title="${epTitle.toLowerCase()}" data-ep-num="${idx + 1}">
                                <div class="ep-num-tag">${idx + 1}</div>
                                <div class="ep-details">
                                    <span class="ep-title">${epTitle}</span>
                                    <span class="ep-source-tag">${epTagText}</span>
                                </div>
                                ${isActive ? '<span class="ep-active-indicator"><i class="fa-solid fa-circle-play fa-beat-fade"></i></span>' : '<i class="fa-solid fa-play ep-play-icon"></i>'}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : ''}

            <!-- Movie Details & Actions (Share & Fullscreen buttons removed from below player per request) -->
            <div class="player-info">
                <h1 class="player-movie-title">${titleText}</h1>
                
                <div class="player-badges">
                    <span class="player-badge badge-rating">★ ${ratingText}</span>
                    <span class="player-badge badge-category">${categoryText}</span>
                    <span class="player-badge" style="${playerBadgeStyle}">${playerBadgeText}</span>
                </div>

                <!-- Cast / Synopsis Box with Clickable Buttons -->
                <div class="player-cast-box">
                    ${castHtml}
                </div>

                <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
                    <button type="button" class="player-comment-action-btn" onclick="window.openCommentSection()" title="Leave comments, movie reviews or feedback">
                        <i class="fa-solid fa-comment-dots" style="color: #38bdf8;"></i>
                        <span>Comments & Requests</span>
                    </button>
                </div>
            </div>

            <!-- 300x250 Ad Unit Under Player (Non-VIP Only) -->
            ${!window.__isVipSubscribed ? `
            <div class="ad-slot-300x250" style="margin: 18px auto 12px auto;">
                <span class="ad-label">Advertisement</span>
                <div class="ad-slot-300x250-inner" id="playerUnderAdSlot"></div>
            </div>
            ` : ''}

            <!-- Related Videos Section (20 Posts) -->
            <div class="related-movies-section">
                <div class="section-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div class="section-title-wrapper" style="display: flex; align-items: center; gap: 8px;">
                        <div class="section-bar" style="${isYouTube ? 'background: #ff0000;' : ''}"></div>
                        <div class="section-title" id="relatedSectionTitle" style="font-size: 15px; font-weight: 700; color: #fff;">
                            ${isYouTube ? '<i class="fa-brands fa-youtube" style="color: #ff0000; margin-right: 6px;"></i> Related YouTube Videos' : '<i class="fa-solid fa-film" style="color: #00d2ff; margin-right: 6px;"></i> Related Movies'}
                        </div>
                        <span class="related-badge ${isYouTube ? 'yt-badge-theme' : ''}" id="relatedCountBadge">
                            ${isYouTube ? '20 YouTube Posts' : (relatedMovies.length + ' Posts')}
                        </span>
                    </div>
                    <div class="related-view-toggle" style="display: flex; align-items: center; gap: 6px;">
                        ${isYouTube ? `
                            <button type="button" id="relatedViewGridBtn" class="related-toggle-btn yt-active active" onclick="window.switchRelatedView('feed')" title="Single Card Feed">
                                <i class="fa-solid fa-square"></i>
                            </button>
                            <button type="button" id="relatedViewScrollBtn" class="related-toggle-btn" onclick="window.switchRelatedView('compact')" title="Compact List">
                                <i class="fa-solid fa-bars"></i>
                            </button>
                        ` : `
                            <button type="button" id="relatedViewGridBtn" class="related-toggle-btn active" onclick="window.switchRelatedView('grid')" title="Grid View">
                                <i class="fa-solid fa-border-all"></i>
                            </button>
                            <button type="button" id="relatedViewScrollBtn" class="related-toggle-btn" onclick="window.switchRelatedView('scroll')" title="Scroll View">
                                <i class="fa-solid fa-arrows-left-right"></i>
                            </button>
                        `}
                    </div>
                </div>
                <div class="${isYouTube ? 'yt-feed-container' : 'gallery-grid'}" id="relatedCarousel">
                    ${isYouTube ? `
                        <div style="display: flex; align-items: center; justify-content: center; padding: 25px 0; color: #8b949e; gap: 10px; font-size: 13px;">
                            <i class="fa-solid fa-spinner fa-spin" style="color: #ff0000; font-size: 20px;"></i>
                            <span>Loading 20 YouTube posts...</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    // Initialize YouTube player API instance, Google Drive iframe, or Plyr instance
    if (isYouTube) {
        setupYouTubePlayer('vdoSkyYouTube');
        initPlayerTouchControls();
        // Load exactly 20 related YouTube posts (from YouTube itself, not the movie section)
        loadYouTubeRelatedPosts(movie, sourceInfo.id);
    } else if (isGDrive) {
        destroyCurrentPlyr();
        // Populate standard movie section related movies (20 posts)
        populateMovieSectionCards(relatedMovies);
    } else {
        const videoEl = document.getElementById('vdoSkyPlyr');
        if (videoEl) {
            initPlyrPlayer(videoEl, movie, activeServerIndex);
        }
        // Populate standard movie section related movies (20 posts)
        populateMovieSectionCards(relatedMovies);
    }

    // Load ad under player (Non-VIP only)
    const playerUnderAdSlot = document.getElementById('playerUnderAdSlot');
    if (!window.__isVipSubscribed && playerUnderAdSlot) {
        renderAd300x250Iframe(playerUnderAdSlot);
    }

    function populateMovieSectionCards(list) {
        if (!list || list.length === 0) return;
        const carousel = document.getElementById('relatedCarousel');
        if (!carousel) return;
        carousel.innerHTML = '';
        list.forEach(m => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.style.flex = "none";
            card.style.minWidth = "unset";
            card.style.width = "100%";
            card.onclick = () => {
                window.openPlayer(m);
                showToast(`Playing: ${m.title || m.name || 'Movie'}`);
            };

            const cardTitle = m.title || m.name || '';
            const isLong = cardTitle.length > 18;

            card.innerHTML = `
                <span class="rating-badge">★ ${m.rating || '4.5'}</span>
                <div class="movie-card-play-hint"><i class="fa-solid fa-play"></i></div>
                <img src="${m.poster || m.image || ''}" loading="lazy" decoding="async">
                <div class="movie-title-container">
                    <div class="movie-title ${isLong ? 'marquee-title' : ''}">${cardTitle}</div>
                </div>
            `;
            carousel.appendChild(card);

            const posterUrl = m.poster || m.image;
            if (posterUrl) {
                getImage(posterUrl).then(imgUrl => {
                    if (imgUrl) {
                        const img = card.querySelector('img');
                        if (img) img.src = imgUrl;
                    }
                }).catch(() => {});
            }
        });
    }

    if (preserveFullscreen) {
        const box = document.getElementById('activePlayerBox');
        if (box) {
            box.classList.add('is-fullscreen');
            if (window.innerHeight > window.innerWidth) {
                box.classList.add('plyr-force-landscape');
            }
            updateFullscreenButtonState(true);
            lockLandscapeOrientation();
            try {
                if (box.requestFullscreen) {
                    box.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
                } else if (box.webkitRequestFullscreen) {
                    box.webkitRequestFullscreen();
                }
            } catch (e) {}
        }
        setTimeout(() => {
            isAutoNextTransitioning = false;
            wasFullscreenBeforeNext = false;
        }, 1200);
    }

    // Populate fullscreen player banner overlay
    try {
        if (!window.__isVipSubscribed && typeof loadFooterBannerAd === 'function') {
            loadFooterBannerAd();
        }
    } catch (e) {}
}

window.switchServer = function(serverIdx) {
    if (!currentPlayingMovie) return;
    currentActiveServerIndex = serverIdx;
    const servers = getMovieServers(currentPlayingMovie);
    const targetServer = servers[serverIdx] || servers[0];

    // Hide error banner if showing
    const errorBox = document.getElementById('playerStreamErrorNotice');
    if (errorBox) errorBox.style.display = 'none';

    // Update active pill styling
    document.querySelectorAll('.server-pill').forEach((pill, idx) => {
        pill.classList.toggle('active', idx === serverIdx);
    });

    const isTargetYouTube = targetServer.type === 'yt' || (targetServer.url && targetServer.url.includes('youtube'));
    const isTargetGDrive = targetServer.type === 'gdrive' || (targetServer.url && (targetServer.url.includes('drive.google.com') || targetServer.url.includes('/preview')));

    if (isTargetGDrive) {
        destroyCurrentPlyr();
        const gdriveIframe = document.getElementById('vdoSkyGDrive');
        if (gdriveIframe) {
            gdriveIframe.src = targetServer.url;
        } else {
            renderPlayerSection(currentPlayingMovie, serverIdx);
        }
        showToast(`Connected to ${targetServer.name}`);
        return;
    }

    if (currentPlyrInstance && !isTargetYouTube) {
        currentPlyrInstance.source = {
            type: 'video',
            title: currentPlayingMovie.title || 'Movie',
            sources: [
                {
                    src: targetServer.url,
                    type: 'video/mp4'
                }
            ],
            poster: currentPlayingMovie.poster || ''
        };
        currentPlyrInstance.play().catch(() => {});
        showToast(`Connected to ${targetServer.name}`);
    } else {
        renderPlayerSection(currentPlayingMovie, serverIdx);
        showToast(`Connected to ${targetServer.name}`);
    }
};

// Function to update playlist UI components smoothly without re-rendering active player DOM
function updateEpisodeUIElements(epIdx, epTitle, servers) {
    const grid = document.getElementById('playlistEpisodesGrid');
    if (grid) {
        grid.querySelectorAll('.episode-pill-btn').forEach((btn, idx) => {
            const isActive = (idx === epIdx);
            btn.classList.toggle('active', isActive);
            const indicator = btn.querySelector('.ep-active-indicator');
            const playIcon = btn.querySelector('.ep-play-icon');
            if (isActive) {
                if (!indicator) {
                    if (playIcon) playIcon.remove();
                    btn.insertAdjacentHTML('beforeend', '<span class="ep-active-indicator"><i class="fa-solid fa-circle-play fa-beat-fade"></i></span>');
                }
            } else {
                if (indicator) indicator.remove();
                if (!btn.querySelector('.ep-play-icon')) {
                    btn.insertAdjacentHTML('beforeend', '<i class="fa-solid fa-play ep-play-icon"></i>');
                }
            }
        });
        const activeBtn = grid.querySelector(`.episode-pill-btn[data-ep-num="${epIdx + 1}"]`);
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
    }

    const prevBtn = document.querySelector('.playlist-nav-btns button[title="Previous Episode"]');
    if (prevBtn) prevBtn.disabled = (epIdx <= 0);
    const nextBtn = document.querySelector('.ep-nav-btn.ep-nav-next');
    if (nextBtn) {
        const totalEps = (currentPlayingMovie && Array.isArray(currentPlayingMovie.episodes)) ? currentPlayingMovie.episodes.length : 1;
        nextBtn.disabled = (epIdx >= totalEps - 1);
    }

    const nowPlayingTitle = document.querySelector('.now-playing-title');
    if (nowPlayingTitle) nowPlayingTitle.innerText = epTitle;
    const currentTitleEl = document.querySelector('.playlist-current-info span:not(.now-playing-tag)');
    if (currentTitleEl) currentTitleEl.innerText = epTitle;
    const movieTitleEl = document.querySelector('.player-movie-title');
    if (movieTitleEl && currentPlayingMovie) {
        movieTitleEl.innerText = `${currentPlayingMovie.title || ''} - ${epTitle}`;
    }

    const serverSelector = document.querySelector('.server-selector');
    if (serverSelector && Array.isArray(servers) && servers.length > 0) {
        const serverPills = servers.map((s, idx) => `
            <button class="server-pill ${idx === 0 ? 'active' : ''}" onclick="switchServer(${idx})">
                <i class="fa-solid ${s.type === 'yt' ? 'fa-play' : s.type === 'gdrive' ? 'fa-cloud' : 'fa-server'}"></i> ${s.name}
            </button>
        `).join('');
        const labelSpan = serverSelector.querySelector('.server-label');
        const autoNextWrap = serverSelector.querySelector('.auto-next-server-wrap');
        const labelHtml = labelSpan ? labelSpan.outerHTML : '<span class="server-label"><i class="fa-solid fa-bolt"></i> Stream Server:</span>';
        const autoNextHtml = autoNextWrap ? autoNextWrap.outerHTML : '';
        serverSelector.innerHTML = `${labelHtml} ${serverPills} ${autoNextHtml}`;
    }
}
window.updateEpisodeUIElements = updateEpisodeUIElements;

// Playlist & Episode Management
window.switchEpisode = function(epIdx, preserveFullscreen = false) {
    if (!currentPlayingMovie) return;
    if (typeof currentPlayingMovie.episodes === 'string' && currentPlayingMovie.episodes.trim().startsWith('[')) {
        try { currentPlayingMovie.episodes = JSON.parse(currentPlayingMovie.episodes); } catch (e) {}
    }
    const episodes = currentPlayingMovie.episodes;
    if (!Array.isArray(episodes) || epIdx < 0 || epIdx >= episodes.length) return;

    const activeBox = document.getElementById('activePlayerBox');
    const wasFs = preserveFullscreen || isAutoNextTransitioning || wasFullscreenBeforeNext || !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement ||
        (activeBox && (activeBox.classList.contains('is-fullscreen') || activeBox.classList.contains('plyr-force-landscape'))) ||
        (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active)
    );

    if (wasFs) {
        isAutoNextTransitioning = true;
        wasFullscreenBeforeNext = true;
        if (activeBox) {
            activeBox.classList.add('is-fullscreen');
            if (window.innerHeight > window.innerWidth) {
                activeBox.classList.add('plyr-force-landscape');
            }
        }
        lockLandscapeOrientation();
        updateFullscreenButtonState(true);
    }

    window.currentActiveEpisodeIndex = epIdx;
    currentActiveServerIndex = 0;
    delete currentPlayingMovie._verifiedSource;

    const targetEp = episodes[epIdx];
    const epTitle = (typeof targetEp === 'object' && targetEp ? (targetEp.title || targetEp.name) : '') || `Episode ${epIdx + 1}`;

    const sourceInfo = detectMovieVideoSource(currentPlayingMovie);
    const servers = getMovieServers(currentPlayingMovie);
    const targetServer = servers[0] || { url: sourceInfo.url, name: 'Server 1', type: sourceInfo.type };
    const isTargetYouTube = (targetServer.type === 'yt') || (sourceInfo.type === 'yt');
    const isTargetGDrive = (targetServer.type === 'gdrive') || (sourceInfo.type === 'gdrive');

    const plyrVideoEl = document.getElementById('vdoSkyPlyr');
    const gdriveIframe = document.getElementById('vdoSkyGDrive');
    const ytIframe = document.getElementById('vdoSkyYouTube');

    // 1. Seamless in-place transition for Plyr player (Worker stream, direct mp4, Drive ID)
    if (activeBox && currentPlyrInstance && plyrVideoEl && !isTargetYouTube && !isTargetGDrive) {
        currentPlyrInstance.source = {
            type: 'video',
            title: `${currentPlayingMovie.title || ''} - ${epTitle}`,
            sources: [
                {
                    src: targetServer.url,
                    type: 'video/mp4'
                }
            ],
            poster: currentPlayingMovie.poster || ''
        };
        currentPlyrInstance.play().catch(() => {});
        updateEpisodeUIElements(epIdx, epTitle, servers);
        if (wasFs) {
            maintainFullscreenLandscape();
        }
        showToast(`Playing ${epTitle}`);
        return;
    }

    // 2. Seamless in-place transition for Google Drive Preview iframe
    if (activeBox && gdriveIframe && isTargetGDrive) {
        gdriveIframe.src = targetServer.url;
        updateEpisodeUIElements(epIdx, epTitle, servers);
        if (wasFs) {
            maintainFullscreenLandscape();
        }
        showToast(`Playing ${epTitle}`);
        return;
    }

    // 3. Seamless in-place transition for YouTube embed
    if (activeBox && currentYtPlayerInstance && ytIframe && isTargetYouTube) {
        if (typeof currentYtPlayerInstance.loadVideoById === 'function') {
            try {
                currentYtPlayerInstance.loadVideoById({ videoId: sourceInfo.id, startSeconds: 0 });
            } catch (e) {
                ytIframe.src = targetServer.url;
            }
        } else {
            ytIframe.src = targetServer.url;
        }
        updateEpisodeUIElements(epIdx, epTitle, servers);
        if (wasFs) {
            maintainFullscreenLandscape();
        }
        showToast(`Playing ${epTitle}`);
        return;
    }

    // Fallback: Full render preserving fullscreen & landscape orientation
    renderPlayerSection(currentPlayingMovie, 0, wasFs);
    showToast(`Playing ${epTitle}`);

    if (!wasFs) {
        const box = document.getElementById('activePlayerBox');
        if (box) {
            box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
};

window.goToNextEpisode = function() {
    if (!currentPlayingMovie || !Array.isArray(currentPlayingMovie.episodes)) return;
    const curIdx = window.currentActiveEpisodeIndex || 0;
    if (curIdx < currentPlayingMovie.episodes.length - 1) {
        const activeBox = document.getElementById('activePlayerBox');
        const wasFs = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            (activeBox && (activeBox.classList.contains('is-fullscreen') || activeBox.classList.contains('plyr-force-landscape'))) ||
            (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active) ||
            isAutoNextTransitioning ||
            wasFullscreenBeforeNext
        );
        if (wasFs) {
            isAutoNextTransitioning = true;
            wasFullscreenBeforeNext = true;
        }
        window.switchEpisode(curIdx + 1, wasFs);
    } else {
        showToast("You are on the last episode");
    }
};

window.goToPrevEpisode = function() {
    if (!currentPlayingMovie || !Array.isArray(currentPlayingMovie.episodes)) return;
    const curIdx = window.currentActiveEpisodeIndex || 0;
    if (curIdx > 0) {
        const activeBox = document.getElementById('activePlayerBox');
        const wasFs = !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            (activeBox && (activeBox.classList.contains('is-fullscreen') || activeBox.classList.contains('plyr-force-landscape'))) ||
            (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active) ||
            isAutoNextTransitioning ||
            wasFullscreenBeforeNext
        );
        if (wasFs) {
            isAutoNextTransitioning = true;
            wasFullscreenBeforeNext = true;
        }
        window.switchEpisode(curIdx - 1, wasFs);
    } else {
        showToast("You are on the first episode");
    }
};

window.filterPlaylistEpisodes = function(query) {
    const q = (query || '').toLowerCase().trim();
    const grid = document.getElementById('playlistEpisodesGrid');
    if (!grid) return;
    const buttons = grid.querySelectorAll('.episode-pill-btn');
    buttons.forEach((btn) => {
        const title = btn.getAttribute('data-ep-title') || '';
        const num = btn.getAttribute('data-ep-num') || '';
        if (!q || title.includes(q) || num === q || `ep ${num}`.includes(q) || `episode ${num}`.includes(q)) {
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    });
};

window.triggerFullscreenPlayer = function() {
    const box = document.getElementById('activePlayerBox');
    if (currentPlyrInstance && currentPlyrInstance.fullscreen) {
        const isCurrentlyFs = !!(
            isManualPlayerFullscreen ||
            currentPlyrInstance.fullscreen.active ||
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            (box && (box.classList.contains('is-fullscreen') || box.classList.contains('plyr-force-landscape')))
        );
        if (!isCurrentlyFs) {
            isManualPlayerFullscreen = true;
            document.body.classList.add('player-is-fullscreen');
            if (box) box.classList.add('is-fullscreen');
            currentPlyrInstance.fullscreen.enter();
            lockLandscapeOrientation();
            updateFullscreenButtonState(true);
        } else {
            isManualPlayerFullscreen = false;
            document.body.classList.remove('player-is-fullscreen');
            if (box) {
                box.classList.remove('is-fullscreen');
                box.classList.remove('plyr-force-landscape');
            }
            if (currentPlyrInstance.elements?.container) {
                currentPlyrInstance.elements.container.classList.remove('plyr-force-landscape');
            }
            try {
                currentPlyrInstance.fullscreen.exit();
            } catch (e) {}
            try {
                if (document.fullscreenElement || document.webkitFullscreenElement) {
                    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                }
            } catch (e) {}
            unlockScreenOrientation();
            updateFullscreenButtonState(false);
        }
    } else {
        if (!box) return;
        const isFs = !!(
            isManualPlayerFullscreen ||
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement ||
            box.classList.contains('is-fullscreen') ||
            box.classList.contains('plyr-force-landscape')
        );
        if (isFs) {
            isManualPlayerFullscreen = false;
            document.body.classList.remove('player-is-fullscreen');
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
            box.classList.remove('is-fullscreen');
            box.classList.remove('plyr-force-landscape');
            unlockScreenOrientation();
            updateFullscreenButtonState(false);
        } else {
            isManualPlayerFullscreen = true;
            document.body.classList.add('player-is-fullscreen');
            box.classList.add('is-fullscreen');
            if (box.requestFullscreen) {
                box.requestFullscreen({ navigationUI: 'hide' }).then(() => {
                    lockLandscapeOrientation();
                }).catch(() => {
                    lockLandscapeOrientation();
                });
            } else if (box.webkitRequestFullscreen) {
                box.webkitRequestFullscreen();
                lockLandscapeOrientation();
            } else {
                lockLandscapeOrientation();
            }
            updateFullscreenButtonState(true);
        }
    }
};

window.shareCurrentMovie = function() {
    if (!currentPlayingMovie) return;
    const title = currentPlayingMovie.title || 'Movie';
    const text = `Watch "${title}": ${window.location.href}`;

    if (navigator.share) {
        navigator.share({
            title: title,
            text: text,
            url: window.location.href
        }).catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("Movie link copied to clipboard!");
        }).catch(() => {
            showToast("Shared: " + title);
        });
    } else {
        showToast("Shared: " + title);
    }
};

window.exitPlayerView = function() {
    isManualPlayerFullscreen = false;
    document.body.classList.remove('player-is-fullscreen');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        try {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } catch (e) {}
    }
    const box = document.getElementById('activePlayerBox');
    if (box) box.classList.remove('is-fullscreen');
    unlockScreenOrientation();
    updateFullscreenButtonState(false);

    destroyCurrentPlyr();
    isPlayerView = false;
    currentPlayingMovie = null;
    updateHeaderButton();

    if (isInCloudStreamView) {
        window.openCloudStreamSection();
    } else if (isInCategoryView && currentCategoryName !== 'all') {
        window.filterAndDisplay(currentCategoryName, true);
    } else {
        const container = document.getElementById('mainContainer');
        if (!window.__isVipSubscribed && homeCachedHTML && container) {
            container.innerHTML = homeCachedHTML;
            rebindHomeCardClicks();
        } else {
            homeCachedHTML = "";
            renderContent(allMovies);
        }
    }

    // Restore smooth scroll position
    setTimeout(() => {
        window.scrollTo({ top: savedScrollPosition, behavior: 'instant' });
    }, 50);
};

function rebindHomeCardClicks() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    const cards = container.querySelectorAll('.movie-card');
    cards.forEach(card => {
        const movieIndex = card.dataset.movieIndex;
        if (movieIndex !== undefined && allMovies[movieIndex]) {
            card.onclick = () => window.openPlayer(allMovies[movieIndex]);
        }
    });

    rebindUnloadedAds();
}

// Render Home Screen Content
async function renderContent(movies) {
    if (isInGameView || isInSubscriptionView || isInCloudStreamView || isInCommentView || isInGpsCameraView || isInAdminView) {
        return;
    }
    isPlayerView = false;
    isInCategoryView = false;
    currentCategoryName = "all";
    updateHeaderButton(); 
    
    const searchEl = document.getElementById('searchInput');
    if (searchEl) searchEl.value = "";

    const container = document.getElementById('mainContainer');
    if (!container) return;
    container.innerHTML = "";

    // 1. Featured / Recently Added Section (Shows the latest added 8 movies at the very top)
    const recentMovies = movies.slice(0, 8);
    if (recentMovies.length > 0) {
        const recentDiv = document.createElement('div');
        recentDiv.style.marginBottom = "-25px";
        recentDiv.innerHTML = `
            <div class="section-header">
                <div class="section-title-wrapper">
                    <div class="section-bar" style="background: linear-gradient(180deg, #ff3b30, #ff9500);"></div>
                    <div class="section-title" style="color: #fff;"><i class="fa-solid fa-fire" style="color: #ff3b30; margin-right: 6px;"></i> Recently Added</div>
                </div>
            </div>
            <div class="horizontal-scroll-container"></div>
        `;

        container.appendChild(recentDiv);
        const recentRow = recentDiv.querySelector('.horizontal-scroll-container');

        for (let i = 0; i < recentMovies.length; i++) {
            const m = recentMovies[i];
            const card = document.createElement('div');
            card.className = 'movie-card';
            const globalIndex = allMovies.indexOf(m);
            card.dataset.movieIndex = globalIndex >= 0 ? globalIndex : i;
            card.onclick = () => window.openPlayer(m);

            const titleText = m.title || m.name || '';
            const isLong = titleText.length > 18;
            const isLatest = i === 0;

            card.innerHTML = `
                <span class="rating-badge">${isLatest ? '<span style="color: #00ff88; font-weight: 700; margin-right: 4px;">NEW</span>' : ''}★ ${m.rating || '0.0'}</span>
                <img src="${m.poster || m.image || ''}" loading="lazy" decoding="async">
                <div class="movie-title-container">
                    <div class="movie-title ${isLong ? 'marquee-title' : ''}">${titleText}</div>
                </div>
            `;
            recentRow.appendChild(card);

            if (m.poster) {
                getImage(m.poster).then(imgUrl => {
                    if (imgUrl) {
                        const img = card.querySelector('img');
                        if (img) img.src = imgUrl;
                    }
                }).catch(() => {});
            }
        }
    }

    const categories = [...new Set(movies.map(m => m.category).filter(Boolean))];

    let renderedCatCount = 0;
    for (const cat of categories) {
        const catMovies = movies.filter(m => m.category === cat);
        if (catMovies.length === 0) continue;
        renderedCatCount++;

        // Display up to 8 movies per category on the home page
        const displayMovies = catMovies.slice(0, 8);

        const sectionDiv = document.createElement('div');
        sectionDiv.style.marginBottom = "-25px";
        sectionDiv.innerHTML = `
            <div class="section-header">
                <div class="section-title-wrapper">
                    <div class="section-bar"></div>
                    <div class="section-title">${cat} (${catMovies.length})</div>
                </div>
                <button class="show-all-btn" onclick="showAllCategory('${cat.replace(/'/g, "\\'")}')">Show All</button>
            </div>
            <div class="horizontal-scroll-container"></div>
        `;

        container.appendChild(sectionDiv);
        const rowContainer = sectionDiv.querySelector('.horizontal-scroll-container');
        
        for (const m of displayMovies) {
            const card = document.createElement('div');
            card.className = 'movie-card';
            const globalIndex = allMovies.indexOf(m);
            card.dataset.movieIndex = globalIndex;
            card.onclick = () => window.openPlayer(m); 

            const titleText = m.title || m.name || '';
            const isLong = titleText.length > 18;

            card.innerHTML = `
                <span class="rating-badge">★ ${m.rating || '0.0'}</span>
                <img src="${m.poster || m.image || ''}" loading="lazy" decoding="async">
                <div class="movie-title-container">
                    <div class="movie-title ${isLong ? 'marquee-title' : ''}">${titleText}</div>
                </div>
            `;
            rowContainer.appendChild(card);

            if (m.poster) {
                getImage(m.poster).then(imgUrl => {
                    if (imgUrl) {
                        const img = card.querySelector('img');
                        if (img) img.src = imgUrl;
                    }
                }).catch(() => {});
            }
        }

        // Show 300x250 ad unit after every 3 categories (Non-VIP only)
        if (!window.__isVipSubscribed && renderedCatCount % 3 === 0) {
            const adSlot = createAd300x250Element(true);
            container.appendChild(adSlot);
        }
    }

    homeCachedHTML = container.innerHTML;
}

window.showAllCategory = async function(categoryName) {
    currentCategoryName = categoryName;
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = categoryName;
    isInCategoryView = true;
    isPlayerView = false;
    updateHeaderButton(); 
    await filterAndDisplay(categoryName, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.handleMenuOrBack = function() {
    if (isPlayerView) {
        exitPlayerView();
    } else if (isInAdminView) {
        isInAdminView = false;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInGpsCameraView) {
        isInGpsCameraView = false;
        if (typeof window.stopGpsCamera === 'function') window.stopGpsCamera();
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInPdfView) {
        isInPdfView = false;
        try {
            const meta = document.getElementById('appViewportMeta');
            if (meta) meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        } catch (e) {}
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInStore35View) {
        isInStore35View = false;
        openExtraToolsSection();
    } else if (isInGifMakerView) {
        isInGifMakerView = false;
        openExtraToolsSection();
    } else if (isInVoiceRecorderView) {
        isInVoiceRecorderView = false;
        if (typeof cleanupVoiceRecorder === 'function') cleanupVoiceRecorder();
        openExtraToolsSection();
    } else if (isInSketchView) {
        isInSketchView = false;
        openExtraToolsSection();
    } else if (isInCompressorView) {
        isInCompressorView = false;
        openExtraToolsSection();
    } else if (isInMp3TrimmerView) {
        isInMp3TrimmerView = false;
        if (typeof cleanupMp3Trimmer === 'function') cleanupMp3Trimmer();
        openExtraToolsSection();
    } else if (isInCoolTextView) {
        isInCoolTextView = false;
        openExtraToolsSection();
    } else if (isInTranslatorView) {
        isInTranslatorView = false;
        openExtraToolsSection();
    } else if (isInQrCodeView) {
        isInQrCodeView = false;
        openExtraToolsSection();
    } else if (isInExtraToolsView) {
        isInExtraToolsView = false;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInGameView) {
        isInGameView = false;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInCommentView) {
        isInCommentView = false;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInSubscriptionView) {
        isInSubscriptionView = false;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        homeCachedHTML = "";
        updateVipAdSuppression();
        renderContent(allMovies);
    } else if (isInCloudStreamView) {
        isInCloudStreamView = false;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInCategoryView) {
        isInCategoryView = false;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    } else {
        window.toggleDropdown();
    }
};

window.goHome = function() {
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isInPdfView = false;
    isInExtraToolsView = false;
    isInStore35View = false;
    isInGifMakerView = false;
    isInVoiceRecorderView = false;
    isInSketchView = false;
    isInCompressorView = false;
    isInMp3TrimmerView = false;
    isInQrCodeView = false;
    isInCoolTextView = false;
    isInTranslatorView = false;
    if (typeof window.stopTranslatorVoiceInput === 'function') {
        window.stopTranslatorVoiceInput();
    }
    if (typeof cleanupMp3Trimmer === 'function') {
        cleanupMp3Trimmer();
    }
    if (typeof cleanupVoiceRecorder === 'function') {
        cleanupVoiceRecorder();
    }
    try {
        const meta = document.getElementById('appViewportMeta');
        if (meta) meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    } catch (e) {}
    isInCategoryView = false;
    isPlayerView = false;
    if (typeof window.stopGpsCamera === 'function') {
        window.stopGpsCamera();
    }
    if (cloudScrollObserver) {
        cloudScrollObserver.disconnect();
    }
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('view')) {
            url.searchParams.delete('view');
            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
        }
    } catch (e) {}
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Enter Movie Name or Cast...';
    }
    if (clearBtn) clearBtn.style.display = 'none';
    updateHeaderButton();
    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }
    renderContent(allMovies);
};

window.exitApp = function() {
    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    // 1. If in video player, exit player first
    if (typeof window.exitPlayerView === 'function' && isPlayerView) {
        try { window.exitPlayerView(); } catch (e) {}
    }

    // 2. Capacitor Android Native Plugin
    try {
        if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
            if (window.Capacitor.Plugins && window.Capacitor.Plugins.App && typeof window.Capacitor.Plugins.App.exitApp === 'function') {
                window.Capacitor.Plugins.App.exitApp();
                return;
            }
        }
    } catch (e) {}

    // 3. Dynamic import of @capacitor/app (only on native platform)
    try {
        if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
            import('@capacitor/app').then(({ App }) => {
                if (App && typeof App.exitApp === 'function') {
                    App.exitApp().catch(() => {});
                }
            }).catch(() => {});
        }
    } catch (e) {}

    // 4. Native Android / WebView bridges
    try {
        if (window.Android && typeof window.Android.closeApp === 'function') {
            window.Android.closeApp();
            return;
        }
        if (window.Android && typeof window.Android.exitApp === 'function') {
            window.Android.exitApp();
            return;
        }
        if (window.Android && typeof window.Android.finish === 'function') {
            window.Android.finish();
            return;
        }
        if (window.AndroidInterface && typeof window.AndroidInterface.exitApp === 'function') {
            window.AndroidInterface.exitApp();
            return;
        }
    } catch (e) {}

    // 5. Cordova / PhoneGap / Navigator bridges
    try {
        if (navigator.app && typeof navigator.app.exitApp === 'function') {
            navigator.app.exitApp();
            return;
        }
        if (navigator.device && typeof navigator.device.exitApp === 'function') {
            navigator.device.exitApp();
            return;
        }
    } catch (e) {}

    // 6. Direct browser window closing attempts (WebViews, PWAs, popup tabs, etc.)
    try {
        window.close();
    } catch (e) {}

    try {
        window.open('', '_self', '');
        window.close();
    } catch (e) {}

    // 7. Graceful fallback for web browser where tab was opened directly
    try {
        if (window.history.length > 1) {
            window.history.back();
        }
    } catch (e) {}

    // Show sleek closing overlay
    let exitModal = document.getElementById('appExitModal');
    if (!exitModal) {
        exitModal = document.createElement('div');
        exitModal.id = 'appExitModal';
        exitModal.style.cssText = 'position:fixed;inset:0;background:rgba(11,14,23,0.96);backdrop-filter:blur(10px);z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;text-align:center;padding:24px;';
        exitModal.innerHTML = `
            <div style="width:68px;height:68px;border-radius:50%;background:rgba(239,68,68,0.15);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;margin-bottom:18px;color:#ef4444;font-size:28px;">
                <i class="fa-solid fa-right-from-bracket"></i>
            </div>
            <h2 style="font-size:22px;font-weight:700;margin:0 0 8px 0;letter-spacing:0.3px;">Closing Movie App...</h2>
            <p style="font-size:14px;color:#94a3b8;max-width:320px;line-height:1.5;margin:0 0 24px 0;">App closing signal sent. If your browser restricts auto-closing tabs, please close this tab.</p>
            <div style="display:flex;gap:12px;">
                <button onclick="try{window.close();}catch(e){}; this.innerText='Please close tab';" style="padding:10px 22px;background:#ef4444;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-xmark"></i> Close Tab
                </button>
                <button onclick="document.getElementById('appExitModal')?.remove();" style="padding:10px 20px;background:rgba(255,255,255,0.1);color:#cbd5e1;border:1px solid rgba(255,255,255,0.15);border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;">
                    Cancel
                </button>
            </div>
        `;
        document.body.appendChild(exitModal);
    }
    setTimeout(() => {
        try { window.close(); } catch (e) {}
    }, 200);
};

window.checkAppUpdate = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const updateUrl = "https://vdoskay.blogspot.com";

    // 1. Check window.openInChrome helper (handles Native Android Bridge & Intent)
    if (typeof window.openInChrome === 'function') {
        window.openInChrome(updateUrl);
        return true;
    }

    // 2. Android Native Bridge
    if (window.Android) {
        if (typeof window.Android.openChromeDirectly === 'function') {
            try { window.Android.openChromeDirectly(updateUrl); return true; } catch (err) {}
        }
        if (typeof window.Android.openInChrome === 'function') {
            try { window.Android.openInChrome(updateUrl); return true; } catch (err) {}
        }
        if (typeof window.Android.openExternalUrl === 'function') {
            try { window.Android.openExternalUrl(updateUrl); return true; } catch (err) {}
        }
        if (typeof window.Android.openUrl === 'function') {
            try { window.Android.openUrl(updateUrl); return true; } catch (err) {}
        }
    }

    // 3. Android Intent for Google Chrome
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid) {
        try {
            const cleanUrl = updateUrl.replace(/^https?:\/\//, '');
            const intentUrl = `intent://${cleanUrl}#Intent;scheme=https;package=com.android.chrome;end`;
            const intentA = document.createElement('a');
            intentA.href = intentUrl;
            document.body.appendChild(intentA);
            intentA.click();
            setTimeout(() => {
                try { document.body.removeChild(intentA); } catch (err) {}
            }, 100);
            return true;
        } catch (err) {}
    }

    // 4. Standard browser navigation / new tab
    try {
        window.open(updateUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
        window.location.href = updateUrl;
    }
    return true;
};

window.clearTopSearch = function() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    if (clearBtn) clearBtn.style.display = 'none';

    if (isInCommentView) {
        isInCommentView = false;
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInSubscriptionView) {
        isInSubscriptionView = false;
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInCloudStreamView) {
        if (isPlayerView) {
            destroyCurrentPlyr();
            isPlayerView = false;
            currentPlayingMovie = null;
            updateHeaderButton();
        }
        if (typeof ensureCloudStreamGrid === 'function') {
            ensureCloudStreamGrid();
        }
        renderCloudCategoryFilter(currentCloudCategory);
    } else {
        if (isPlayerView) {
            destroyCurrentPlyr();
            isPlayerView = false;
            currentPlayingMovie = null;
            updateHeaderButton();
        }
        isInCategoryView = false;
        updateHeaderButton();
        renderContent(allMovies);
    }
};

function updateHeaderButton() {
    const menuToggle = document.getElementById('menuToggle');
    const menuIcon = document.getElementById('menuIcon');
    const menuBtnText = document.getElementById('menuBtnText');

    if (!menuToggle || !menuIcon || !menuBtnText) return;

    if (isPlayerView || isInCategoryView || isInCloudStreamView || isInSubscriptionView || isInCommentView || isInGameView || isInAdminView || isInGpsCameraView || isInPdfView || isInExtraToolsView || isInStore35View || isInGifMakerView || isInVoiceRecorderView || isInSketchView || isInCompressorView || isInMp3TrimmerView || isInQrCodeView || isInCoolTextView || isInTranslatorView) {
        menuIcon.className = "fa-solid fa-arrow-left";
        menuBtnText.innerText = "Back";
        menuToggle.style.background = "#ff4757";
        menuToggle.style.color = "#fff";
    } else {
        menuIcon.className = "fa-solid fa-bars";
        menuBtnText.innerText = "Menu";
        menuToggle.style.background = "#00d2ff";
        menuToggle.style.color = "#1e1e2f";
    }
}

window.toggleDropdown = function() { 
    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown) {
        const willBeActive = !dropdown.classList.contains("active");
        dropdown.classList.toggle("active");
        if (willBeActive) {
            dropdown.scrollTop = 0;
        }
    }
};

window.handleMenuShareApp = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }
    
    const shareUrl = "https://vdoskay.blogspot.com";
    const shareTitle = "Movie App - Free Movies, Music & Streaming";
    const shareText = "Download Movie App to watch free HD Movies & Web Series: " + shareUrl;

    // 1. Try Android Native Interface
    if (window.Android && typeof window.Android.shareApp === 'function') {
        window.Android.shareApp(shareText, shareUrl);
        return;
    }

    // 2. Try Web Share API (Triggers native OS share dialog directly)
    if (navigator.share) {
        navigator.share({
            title: shareTitle,
            text: shareText,
            url: shareUrl
        }).catch((err) => {
            if (err && err.name !== 'AbortError') {
                window.location.href = "share.html";
            }
        });
        return;
    }

    // 3. Fallback: Open dedicated share.html section
    window.location.href = "share.html";
};

window.handleSearchInput = async function() {
    const searchInput = document.getElementById('searchInput');
    const term = searchInput ? searchInput.value.trim() : '';
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.style.display = term.length > 0 ? 'block' : 'none';

    // If currently in the YouTube / Watch Stream section, ONLY perform YouTube search!
    if (isInCloudStreamView) {
        performCloudStreamSearch(term);
        return;
    }

    if (term === "") {
        if (isPlayerView) {
            destroyCurrentPlyr();
            isPlayerView = false;
            currentPlayingMovie = null;
        }
        isInCategoryView = false;
        updateHeaderButton();
        await renderContent(allMovies);
    } else {
        if (isPlayerView) {
            destroyCurrentPlyr();
            isPlayerView = false;
            currentPlayingMovie = null;
        }
        isInCategoryView = true;
        updateHeaderButton();
        await filterAndDisplay(term);
    }
};

window.filterAndDisplay = async function(term, isExactCategory = false) {
    const container = document.getElementById('mainContainer');
    if (!container) return;
    const lowerTerm = term.toLowerCase();

    const filtered = allMovies.filter(m => {
        if (isExactCategory) {
            return m.category && m.category.toLowerCase() === lowerTerm;
        }
        return (m.title && m.title.toLowerCase().includes(lowerTerm)) || 
            (m.name && m.name.toLowerCase().includes(lowerTerm)) ||
            (m.category && m.category.toLowerCase().includes(lowerTerm)) ||
            (m.cast && (typeof m.cast === 'string' ? m.cast.toLowerCase().includes(lowerTerm) : Array.isArray(m.cast) && m.cast.join(' ').toLowerCase().includes(lowerTerm)));
    });

    const displayTitle = isExactCategory ? `${term} (${filtered.length})` : `Results for "${term}" (${filtered.length})`;

    container.innerHTML = `
        <div class="section-header">
            <div class="section-title-wrapper">
                <div class="section-bar"></div>
                <div class="section-title">${displayTitle}</div>
            </div>
        </div>
        <div class="gallery-grid" id="searchResultGrid"></div>
    `;

    const grid = document.getElementById('searchResultGrid');
    if (!grid) return;

    let postCount = 0;
    for (const m of filtered) {
        postCount++;
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.style.flex = "none";
        card.style.minWidth = "unset";
        card.onclick = () => window.openPlayer(m); 

        const titleText = m.title || m.name || '';
        const isLong = titleText.length > 18;

        card.innerHTML = `
            <span class="rating-badge">★ ${m.rating || '0.0'}</span>
            <img src="${m.poster || m.image || ''}" loading="lazy" decoding="async">
            <div class="movie-title-container">
                <div class="movie-title ${isLong ? 'marquee-title' : ''}">${titleText}</div>
            </div>
        `;
        grid.appendChild(card);

        // Show 300x250 ad after every 36 posts; lazy loads when user scrolls near it (Non-VIP only)
        if (!window.__isVipSubscribed && postCount % 36 === 0) {
            const adSlot = createAd300x250Element(true);
            adSlot.classList.add('ad-slot-grid-span');
            grid.appendChild(adSlot);
        }

        if (m.poster) {
            getImage(m.poster).then(imgUrl => {
                if (imgUrl) {
                    const img = card.querySelector('img');
                    if (img) img.src = imgUrl;
                }
            }).catch(() => {});
        }
    }
};

// Filter and display all movies for a clicked cast member
window.filterByCast = async function(encodedActor) {
    if (!encodedActor) return;
    let actorName = "";
    try {
        actorName = decodeURIComponent(encodedActor).trim();
    } catch (e) {
        actorName = String(encodedActor).trim();
    }
    if (!actorName) return;

    // Exit active player and navigate to category/search view
    destroyCurrentPlyr();
    isPlayerView = false;
    isInCategoryView = true;
    currentCategoryName = actorName;
    updateHeaderButton();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = actorName;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    await window.displayMoviesByCast(actorName);
};

window.displayMoviesByCast = async function(actorName) {
    const container = document.getElementById('mainContainer');
    if (!container) return;
    const lowerActor = actorName.toLowerCase();

    // Filter all movies where this actor is in the cast
    let filtered = allMovies.filter(m => {
        if (!m) return false;
        if (m.cast) {
            if (typeof m.cast === 'string' && m.cast.toLowerCase().includes(lowerActor)) return true;
            if (Array.isArray(m.cast) && m.cast.some(c => c && String(c).toLowerCase().includes(lowerActor))) return true;
        }
        return false;
    });

    // Fallback search across all fields if no direct cast match found
    if (filtered.length === 0) {
        filtered = allMovies.filter(m => 
            (m.title && m.title.toLowerCase().includes(lowerActor)) || 
            (m.name && m.name.toLowerCase().includes(lowerActor)) ||
            (m.cast && (typeof m.cast === 'string' ? m.cast.toLowerCase().includes(lowerActor) : Array.isArray(m.cast) && m.cast.join(' ').toLowerCase().includes(lowerActor)))
        );
    }

    container.innerHTML = `
        <div class="section-header">
            <div class="section-title-wrapper">
                <div class="section-bar"></div>
                <div class="section-title">
                    <i class="fa-solid fa-user-tag" style="color: #00d2ff; margin-right: 6px; font-size: 14px;"></i>
                    Movies Starring "${actorName}" (${filtered.length})
                </div>
            </div>
        </div>
        <div class="gallery-grid" id="searchResultGrid"></div>
    `;

    const grid = document.getElementById('searchResultGrid');
    if (!grid) return;

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: #8b949e;">
                <i class="fa-solid fa-film" style="font-size: 40px; margin-bottom: 14px; opacity: 0.4; color: #00d2ff;"></i>
                <p style="font-size: 15px; color: #fff; margin-bottom: 6px;">No movies found for "${actorName}"</p>
                <p style="font-size: 12px;">Try exploring other categories or search for another movie.</p>
            </div>
        `;
        return;
    }

    let postCount = 0;
    for (const m of filtered) {
        postCount++;
        const card = document.createElement('div');
        card.className = 'movie-card';
        card.style.flex = "none";
        card.style.minWidth = "unset";
        card.onclick = () => window.openPlayer(m); 

        const titleText = m.title || m.name || '';
        const isLong = titleText.length > 18;

        card.innerHTML = `
            <span class="rating-badge">★ ${m.rating || '0.0'}</span>
            <img src="${m.poster || m.image || ''}" loading="lazy" decoding="async">
            <div class="movie-title-container">
                <div class="movie-title ${isLong ? 'marquee-title' : ''}">${titleText}</div>
            </div>
        `;
        grid.appendChild(card);

        // Show 300x250 ad after every 36 posts (Non-VIP only)
        if (!window.__isVipSubscribed && postCount % 36 === 0) {
            const adSlot = createAd300x250Element(true);
            adSlot.classList.add('ad-slot-grid-span');
            grid.appendChild(adSlot);
        }

        if (m.poster) {
            getImage(m.poster).then(imgUrl => {
                if (imgUrl) {
                    const img = card.querySelector('img');
                    if (img) img.src = imgUrl;
                }
            }).catch(() => {});
        }
    }
};

// Ensure microphone permission is granted across Android native and Web browsers
window.ensureMicrophonePermission = function() {
    return new Promise(async (resolve) => {
        // 1. Android Native interface check & request
        if (window.Android) {
            try {
                if (typeof window.Android.hasMicrophonePermission === 'function' && window.Android.hasMicrophonePermission()) {
                    resolve(true);
                    return;
                }
                if (typeof window.Android.requestMicrophonePermission === 'function') {
                    let settled = false;
                    const prevGranted = window.onAndroidMicrophonePermissionGranted;
                    const prevDenied = window.onAndroidMicrophonePermissionDenied;

                    const cleanup = () => {
                        window.onAndroidMicrophonePermissionGranted = prevGranted;
                        window.onAndroidMicrophonePermissionDenied = prevDenied;
                    };

                    window.onAndroidMicrophonePermissionGranted = () => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        resolve(true);
                    };

                    window.onAndroidMicrophonePermissionDenied = () => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        resolve(false);
                    };

                    window.Android.requestMicrophonePermission();

                    setTimeout(() => {
                        if (!settled) {
                            settled = true;
                            cleanup();
                            const hasPerm = typeof window.Android.hasMicrophonePermission === 'function' && window.Android.hasMicrophonePermission();
                            resolve(hasPerm);
                        }
                    }, 8000);
                    return;
                }
            } catch (err) {
                console.warn("Android native mic check error:", err);
            }
        }

        // 2. Browser WebRTC getUserMedia permission prompt
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (stream) {
                    stream.getTracks().forEach(track => {
                        try { track.stop(); } catch(e) {}
                    });
                }
                resolve(true);
                return;
            } catch (err) {
                console.warn("Audio getUserMedia prompt error:", err);
                resolve(false);
                return;
            }
        }

        resolve(true);
    });
};

window.startVoiceSearch = async function() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast("Voice search not supported in this browser");
        return;
    }

    const micBtn = document.getElementById('micBtn');

    // Request native or browser microphone permission before starting speech recognition
    if (typeof window.ensureMicrophonePermission === 'function') {
        if (micBtn) micBtn.classList.add('requesting');
        const hasMicPermission = await window.ensureMicrophonePermission();
        if (micBtn) micBtn.classList.remove('requesting');
        if (!hasMicPermission) {
            showToast("Microphone permission denied. Please allow microphone access.");
            return;
        }
    }

    try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';

        recognition.onstart = function() {
            if (micBtn) micBtn.classList.add('listening');
        };

        recognition.onresult = async function(event) {
            const speechToText = event.results[0][0].transcript;
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = speechToText;
            const clearBtn = document.getElementById('searchClearBtn');
            if (clearBtn) clearBtn.style.display = 'block';

            if (isInCloudStreamView) {
                performCloudStreamSearch(speechToText);
            } else {
                if (isPlayerView) {
                    destroyCurrentPlyr();
                    isPlayerView = false;
                    currentPlayingMovie = null;
                }
                isInCloudStreamView = false;
                isInCategoryView = true;
                updateHeaderButton();
                await window.filterAndDisplay(speechToText);
            }
        };

        recognition.onerror = function(event) {
            if (micBtn) micBtn.classList.remove('listening');
            if (event && event.error === 'not-allowed') {
                showToast("Microphone permission denied. Please allow microphone access.");
            }
        };

        recognition.onend = function() {
            if (micBtn) micBtn.classList.remove('listening');
        };

        recognition.start();
    } catch(err) {
        if (micBtn) micBtn.classList.remove('listening');
        console.warn("Could not start speech recognition:", err);
    }
};

// Handle Browser / Android Hardware Back Button
window.addEventListener('popstate', () => {
    if (isPlayerView) {
        window.exitPlayerView();
    } else if (isInCloudStreamView) {
        isInCloudStreamView = false;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    } else if (isInCategoryView) {
        isInCategoryView = false;
        const searchInput = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Enter Movie Name or Cast...';
        }
        if (clearBtn) clearBtn.style.display = 'none';
        updateHeaderButton();
        renderContent(allMovies);
    }
});

// ==========================================
// FIXED FOOTER BANNER AD (320x50 with 45-55s Auto-refresh)
// ==========================================

function loadFooterBannerAd() {
    const container = document.getElementById('fixedFooterAdInner');
    const outer = document.getElementById('fixedFooterAdContainer');

    if (window.__isVipSubscribed) {
        if (outer) outer.style.display = 'none';
        if (container) container.innerHTML = '';
        return;
    }

    if (outer) {
        outer.style.display = 'flex';
        outer.style.background = 'transparent';
        outer.style.border = 'none';
        outer.style.boxShadow = 'none';
        outer.style.pointerEvents = 'none';
    }
    if (container) {
        container.style.pointerEvents = 'auto';
        container.style.background = 'transparent';
    }

    // HighRevenueFormat Ad Unit HTML
    const adDocContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: transparent;
            overflow: hidden;
            width: 320px;
            height: 50px;
            display: flex;
            justify-content: center;
            align-items: center;
        }
    </style>
</head>
<body>
    <script type="text/javascript">
        // Intercept links and window.open to open directly in Chrome app
        var origOpen = window.open;
        window.open = function(url) {
            try {
                if (window.parent && window.parent.openInChrome) {
                    window.parent.openInChrome(url);
                    return null;
                }
            } catch (e) {}
            return origOpen.apply(window, arguments);
        };
        document.addEventListener('click', function(e) {
            try {
                var target = e.target;
                if (!target || typeof target.closest !== 'function') return;
                var a = target.closest('a');
                if (a && a.href && a.href !== '#' && !a.href.startsWith('javascript:')) {
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                        if (window.parent && window.parent.openInChrome) {
                            window.parent.openInChrome(a.href);
                            return;
                        }
                    } catch (err) {}
                    window.open(a.href, '_blank');
                }
            } catch (err) {}
        }, true);
    <\/script>
    <script type="text/javascript">
        atOptions = {
            'key' : 'fec896668e376077dc0281401ab2b9ad',
            'format' : 'iframe',
            'height' : 50,
            'width' : 320,
            'params' : {}
        };
    <\/script>
    <script type="text/javascript" src="https://www.highrevenueformat.com/fec896668e376077dc0281401ab2b9ad/invoke.js"><\/script>
</body>
</html>`;

    if (!container) return;
    container.innerHTML = '';
    const iframe = document.createElement('iframe');
        iframe.id = 'vdoSkyBannerFrame_' + Math.random().toString(36).substring(2);
        iframe.width = '320';
        iframe.height = '50';
        iframe.style.width = '320px';
        iframe.style.height = '50px';
        iframe.style.display = 'block';
        iframe.style.margin = '0 auto';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.scrolling = 'no';
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('marginwidth', '0');
        iframe.setAttribute('marginheight', '0');
        container.appendChild(iframe);

        try {
            iframe.srcdoc = adDocContent;
        } catch (err) {
            try {
                iframe.contentWindow.document.open();
                iframe.contentWindow.document.write(adDocContent);
                iframe.contentWindow.document.close();
            } catch (e) {}
        }
}
window.loadPlayerFsBannerAd = loadFooterBannerAd;

function scheduleFooterAdRefresh() {
    if (adRefreshTimer) {
        clearTimeout(adRefreshTimer);
        adRefreshTimer = null;
    }
    if (window.__isVipSubscribed) return;
    // Random interval between 45 and 55 seconds
    const minSec = 45;
    const maxSec = 55;
    const randomSeconds = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;

    adRefreshTimer = setTimeout(() => {
        loadFooterBannerAd();
        scheduleFooterAdRefresh();
    }, randomSeconds * 1000);
}

function initFooterBannerAd() {
    if (window.__isVipSubscribed) return;
    loadFooterBannerAd();
    scheduleFooterAdRefresh();
}

// ==========================================
// SMARTLINK INTERSTITIAL AD & POPUNDER (10-min interval, 15s skip countdown, fullscreen support)
// ==========================================
const SMARTLINK_URL = "https://www.profitableratecpmnetwork.com/xvstux43?key=0c857c73c9952f0b87cdbb9b39755d98";
const POPUNDER_URL = "https://www.profitableratecpmnetwork.com/xvstux43?key=0c857c73c9952f0b87cdbb9b39755d98";
const INTERSTITIAL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let interstitialCountdownInterval = null;
let wasPlayingBeforeInterstitial = false;
let lastInterstitialTime = parseInt(localStorage.getItem('vdosky_last_interstitial') || '0', 10);

if (!lastInterstitialTime) {
    lastInterstitialTime = Date.now();
    localStorage.setItem('vdosky_last_interstitial', lastInterstitialTime.toString());
}

let wasFullscreenBeforeInterstitial = false;
let wasForcedLandscape = false;

function showSmartlinkInterstitial() {
    if (window.__isVipSubscribed) return;
    if (isSmartlinkInterstitialActive) return;
    isSmartlinkInterstitialActive = true;
    lastInterstitialTime = Date.now();
    localStorage.setItem('vdosky_last_interstitial', lastInterstitialTime.toString());

    // 1. Check if ANY fullscreen mode is active (browser native fullscreen or Plyr fullscreen)
    const fsEl = document.fullscreenElement ||
                 document.webkitFullscreenElement ||
                 document.mozFullScreenElement ||
                 document.msFullscreenElement;

    wasFullscreenBeforeInterstitial = !!(
        fsEl ||
        (currentPlyrInstance && currentPlyrInstance.fullscreen && currentPlyrInstance.fullscreen.active)
    );

    // If browser is in native fullscreen on any element (especially YouTube iframe),
    // exit native fullscreen so the ad modal on document.body is 100% visible on top of everything!
    if (fsEl) {
        try {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        } catch (e) {}
    }

    // If active player box is forced into landscape orientation, temporarily unforce it so modal is upright
    const activeBox = document.getElementById('activePlayerBox');
    if (activeBox && activeBox.classList.contains('plyr-force-landscape')) {
        wasForcedLandscape = true;
        activeBox.classList.remove('plyr-force-landscape');
    }

    // 2. Pause video playback (both HTML5/Plyr and YouTube iframe stream)
    if (currentPlyrInstance && !currentPlyrInstance.paused) {
        wasPlayingBeforeInterstitial = true;
        try { currentPlyrInstance.pause(); } catch (e) {}
    }

    const ytIframe = document.getElementById('vdoSkyYouTube');
    if (ytIframe && ytIframe.contentWindow) {
        wasPlayingBeforeInterstitial = true;
        try {
            ytIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
        } catch (e) {}
    }

    // 3. Ensure modal element exists and is located directly under document.body
    let modal = document.getElementById('smartlinkInterstitialModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'smartlinkInterstitialModal';
        modal.className = 'interstitial-modal';
        modal.innerHTML = `
            <div class="interstitial-header">
                <div class="interstitial-header-left">
                    <button class="interstitial-vip-btn" onclick="openVipFromAd();" title="VIP Subscription (No Ads)">
                        <i class="fa-solid fa-crown"></i>
                        <span>VIP (No Ads)</span>
                    </button>
                </div>
                <div class="interstitial-header-right">
                    <span class="interstitial-badge"><i class="fa-solid fa-rectangle-ad"></i> Sponsored</span>
                    <button id="interstitialSkipBtn" class="interstitial-skip-btn disabled" disabled onclick="closeSmartlinkInterstitial()">
                        <i class="fa-solid fa-lock"></i> 15s
                    </button>
                </div>
            </div>
            <div class="interstitial-body" id="smartlinkAdBody">
                <div class="interstitial-loader" id="smartlinkLoader">
                    <div class="interstitial-loader-spinner"></div>
                    <span>Loading Advertisement...</span>
                </div>
                <iframe id="smartlinkAdIframe" src="about:blank" sandbox="allow-scripts allow-forms allow-same-origin allow-presentation" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" onload="const l=document.getElementById('smartlinkLoader'); if(l) l.style.display='none';"></iframe>
            </div>
        `;
        document.body.appendChild(modal);
    } else if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';

    // Set Smartlink iframe src
    const iframe = document.getElementById('smartlinkAdIframe');
    if (iframe) {
        const loader = document.getElementById('smartlinkLoader');
        if (loader) loader.style.display = 'flex';
        iframe.src = SMARTLINK_URL;
    }

    // 15 seconds countdown
    let remainingSeconds = 15;
    const countdownEl = document.getElementById('interstitialCountdown');
    const timerNoticeEl = document.getElementById('interstitialTimerNotice');
    const skipBtn = document.getElementById('interstitialSkipBtn');

    if (countdownEl) countdownEl.innerText = remainingSeconds;
    if (timerNoticeEl) timerNoticeEl.innerHTML = `<i class="fa-solid fa-clock"></i> Skip in <strong id="interstitialCountdown">${remainingSeconds}</strong>s`;
    if (skipBtn) {
        skipBtn.className = 'interstitial-skip-btn disabled';
        skipBtn.disabled = true;
        skipBtn.innerHTML = `<i class="fa-solid fa-lock"></i> ${remainingSeconds}s`;
    }

    if (interstitialCountdownInterval) clearInterval(interstitialCountdownInterval);

    interstitialCountdownInterval = setInterval(() => {
        remainingSeconds--;
        const cEl = document.getElementById('interstitialCountdown');
        if (cEl) cEl.innerText = remainingSeconds;
        const currentSkipBtn = document.getElementById('interstitialSkipBtn');
        if (currentSkipBtn && remainingSeconds > 0) {
            currentSkipBtn.innerHTML = `<i class="fa-solid fa-lock"></i> ${remainingSeconds}s`;
        }

        if (remainingSeconds <= 0) {
            clearInterval(interstitialCountdownInterval);
            const notice = document.getElementById('interstitialTimerNotice');
            if (notice) {
                notice.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #00d2ff;"></i> Ad ready to skip`;
            }
            if (currentSkipBtn) {
                currentSkipBtn.className = 'interstitial-skip-btn ready';
                currentSkipBtn.disabled = false;
                currentSkipBtn.innerHTML = `<i class="fa-solid fa-xmark"></i> Skip Ad`;
            }
        }
    }, 1000);
}
window.showSmartlinkInterstitial = showSmartlinkInterstitial;

function closeSmartlinkInterstitial() {
    const modal = document.getElementById('smartlinkInterstitialModal');
    if (modal) {
        modal.style.display = 'none';
        if (modal.parentElement && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
    }
    const iframe = document.getElementById('smartlinkAdIframe');
    if (iframe) {
        iframe.src = 'about:blank';
    }
    if (interstitialCountdownInterval) {
        clearInterval(interstitialCountdownInterval);
    }
    isSmartlinkInterstitialActive = false;

    // If video was playing before ad interrupted, resume playing smoothly
    if (wasPlayingBeforeInterstitial) {
        wasPlayingBeforeInterstitial = false;
        if (currentPlyrInstance) {
            try { currentPlyrInstance.play().catch(() => {}); } catch (e) {}
        }
        const ytIframe = document.getElementById('vdoSkyYouTube');
        if (ytIframe && ytIframe.contentWindow) {
            try {
                ytIframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
            } catch (e) {}
        }
    }

    // Restore forced landscape if it was active
    if (wasForcedLandscape) {
        wasForcedLandscape = false;
        const activeBox = document.getElementById('activePlayerBox');
        if (activeBox) activeBox.classList.add('plyr-force-landscape');
    }

    // If user was watching video in fullscreen, restore fullscreen & orientation
    if (wasFullscreenBeforeInterstitial) {
        wasFullscreenBeforeInterstitial = false;
        setTimeout(() => {
            if (currentPlyrInstance && currentPlyrInstance.fullscreen) {
                try { currentPlyrInstance.fullscreen.enter(); } catch (e) {}
            } else {
                const box = document.getElementById('activePlayerBox');
                if (box) {
                    if (box.requestFullscreen) {
                        box.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
                    } else if (box.webkitRequestFullscreen) {
                        box.webkitRequestFullscreen();
                    }
                }
            }
            lockLandscapeOrientation();
        }, 120);
    }
}
window.closeSmartlinkInterstitial = closeSmartlinkInterstitial;

function openSmartlinkInChrome() {
    window.openInChrome(SMARTLINK_URL);
}
window.openSmartlinkInChrome = openSmartlinkInChrome;

function openVipFromAd() {
    if (typeof closeSmartlinkInterstitial === 'function') closeSmartlinkInterstitial();
    if (typeof closePopunderInterstitial === 'function') closePopunderInterstitial();
    if (typeof window.openSubscriptionSection === 'function') {
        window.openSubscriptionSection();
    }
}
window.openVipFromAd = openVipFromAd;

// Start.io SDK removed: stream plays directly without ads
function showStartIoRewardedAd(movie, onComplete) {
    if (onComplete) onComplete();
}
window.showStartIoRewardedAd = showStartIoRewardedAd;

// Popunder implementation using requested link
let lastPopunderTime = parseInt(localStorage.getItem('vdosky_last_popunder') || '0', 10);
const POPUNDER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between popunders

function triggerPopunderClick() {
    if (window.__isVipSubscribed) return;
    const now = Date.now();
    if (now - lastPopunderTime < POPUNDER_COOLDOWN_MS) return;

    lastPopunderTime = now;
    localStorage.setItem('vdosky_last_popunder', now.toString());

    try {
        if (typeof window.openInChrome === 'function') {
            window.openInChrome(POPUNDER_URL);
        } else {
            window.open(POPUNDER_URL, '_blank', 'noopener,noreferrer');
        }
    } catch (e) {
        console.warn('Popunder trigger error:', e);
    }
}

window.showPopunderInterstitial = function() {
    if (window.__isVipSubscribed) return;
    triggerPopunderClick();
};
window.closePopunderInterstitial = function() {
    isPopunderActive = false;
};

// Listen for first interaction gestures to trigger popunder when cooldown permits
document.addEventListener('click', function onFirstUserPopunderClick(e) {
    if (window.__isVipSubscribed) return;
    // Don't trigger on VIP buttons or ad close buttons
    const target = e.target;
    if (target && (target.closest('.interstitial-skip-btn') || target.closest('.interstitial-vip-btn') || target.closest('.vip-badge-pill') || target.closest('#vipMenuItem'))) {
        return;
    }
    const now = Date.now();
    if (now - lastPopunderTime >= POPUNDER_COOLDOWN_MS) {
        triggerPopunderClick();
    }
}, { passive: true });

// Check timer every 5 seconds to trigger every 15 minutes reliably
setInterval(() => {
    if (window.__isVipSubscribed) return;
    const elapsed = Date.now() - lastInterstitialTime;
    if (elapsed >= INTERSTITIAL_INTERVAL_MS) {
        showSmartlinkInterstitial();
    }
}, 5000);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFooterBannerAd);
} else {
    initFooterBannerAd();
}

// ==========================================
// CLOUD STREAM SECTION (NEUTRAL BRANDED STREAM ENGINE)
// ==========================================
let currentCloudCategory = "All";
let cloudStreamSearchDebounce = null;
let cloudRenderedCount = 0;
const CLOUD_BATCH_SIZE = 15;
let cloudIsLoadingMore = false;
let cloudCardCount = 0;
let cloudQueryIndex = 0;
let cloudScrollObserver = null;
let cloudWindowScrollAttached = false;
const INFINITE_YOUTUBE_QUERIES = [
    'latest hindi dubbed full movie 2024',
    'south indian action hindi dubbed movie',
    'new bollywood full movie hd',
    'superhit thriller suspense full movie hindi',
    'hollywood movies dubbed in hindi full',
    'comedy superhit full movie hindi',
    'latest blockbuster action full movie in hindi',
    'popular south movie hindi dubbed',
    'top rated full action movie hindi',
    'romantic action thriller movie in hindi'
];

const INVIDIOUS_INSTANCES = [
    'https://invidious.f5.si',
    'https://invidious.ducks.party',
    'https://invidious.projectsegfau.lt',
    'https://invidious.nerdvpn.de',
    'https://yt.drgnz.club'
];

async function fetchInvidiousSearch(query) {
    for (const base of INVIDIOUS_INSTANCES) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    return data.map(item => {
                        const sec = item.lengthSeconds || 0;
                        const mins = Math.floor(sec / 60);
                        const durStr = mins > 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
                        let poster = '';
                        if (item.videoId) {
                            poster = `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
                        } else if (item.videoThumbnails && item.videoThumbnails.length > 0) {
                            poster = item.videoThumbnails[item.videoThumbnails.length - 1].url || '';
                        }
                        return {
                            id: `stream_${item.videoId}`,
                            title: item.title || 'Stream Video',
                            category: "Search Results",
                            poster: poster,
                            rating: "4.8",
                            yt: item.videoId,
                            author: item.author || 'Creator',
                            duration: durStr || '10m',
                            views: item.viewCount ? `${(item.viewCount >= 1000000 ? (item.viewCount / 1000000).toFixed(1) + 'M' : item.viewCount >= 1000 ? Math.floor(item.viewCount / 1000) + 'K' : item.viewCount)} views` : 'HD Stream'
                        };
                    });
                }
            }
        } catch (e) {}
    }
    return null;
}

const YOUTUBE_SECTION_DEFAULT_QUERY = 'latest hindi dubbed full movie';
const YOUTUBE_SECTION_TARGET_URL = 'https://www.youtube.com/results?search_query=latest+hindi+dubbed+full+movie';

function ensureCloudStreamGrid() {
    let grid = document.getElementById('cloudStreamGrid');
    if (!grid) {
        const container = document.getElementById('mainContainer');
        if (!container) return null;

        if (isPlayerView) {
            destroyCurrentPlyr();
            isPlayerView = false;
            currentPlayingMovie = null;
            updateHeaderButton();
        }

        container.innerHTML = `
            <div class="cloud-stream-wrapper">
                <!-- Video Grid (Single post per row) -->
                <div id="cloudStreamGrid" class="cloud-stream-grid"></div>
            </div>
        `;
        grid = document.getElementById('cloudStreamGrid');
    }
    return grid;
}
window.ensureCloudStreamGrid = ensureCloudStreamGrid;

window.openCloudStreamSection = function() {
    if (typeof window.stopGpsCamera === 'function') window.stopGpsCamera();
    isInGpsCameraView = false;
    isInCloudStreamView = true;
    isInCommentView = false;
    isPlayerView = false;
    isInCategoryView = false;
    currentCloudCategory = "All";
    updateHeaderButton();

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    // Connect & Configure Top Search Bar specifically for YouTube / Stream Search
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search latest hindi dubbed full movies...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    const container = document.getElementById('mainContainer');
    if (!container) return;

    window.scrollTo({ top: 0, behavior: 'instant' });

    ensureCloudStreamGrid();

    // Prioritize South Action and Bollywood Hindi Dubbed Movies from Curated Catalog first
    const hindiDubbedCurated = CURATED_CLOUD_CATALOG.filter(c => 
        c.category === 'South Action Movies' || 
        c.category === 'Latest Full Movies' || 
        (c.title && /hindi|dubbed|action/i.test(c.title))
    );
    const initialList = hindiDubbedCurated.length > 0 ? hindiDubbedCurated : CURATED_CLOUD_CATALOG;
    renderCloudVideos(initialList);

    // Fetch live search results for exact link query: "latest hindi dubbed full movie"
    const targetQuery = YOUTUBE_SECTION_DEFAULT_QUERY;
    
    // 1. Try local dev-server endpoint if present
    fetch(`/api/youtube-related?q=${encodeURIComponent(targetQuery)}`)
        .then(r => r.json())
        .then(data => {
            if (Array.isArray(data) && data.length > 0 && isInCloudStreamView && currentCloudCategory === 'All') {
                const sInput = document.getElementById('searchInput');
                if (!sInput || sInput.value.trim() === '') {
                    const mapped = data.map(item => ({
                        id: `stream_${item.videoId || item.yt}`,
                        title: item.title,
                        category: 'Latest Hindi Dubbed Full Movie',
                        poster: item.poster || `https://i.ytimg.com/vi/${item.videoId || item.yt}/hqdefault.jpg`,
                        rating: item.rating || '4.8',
                        yt: item.videoId || item.yt,
                        author: item.channel || 'YouTube',
                        duration: item.duration || 'Full HD',
                        views: item.views || 'HD Stream'
                    }));
                    const existingYts = new Set(mapped.map(m => m.yt));
                    const remaining = initialList.filter(c => !existingYts.has(c.yt));
                    renderCloudVideos([...mapped, ...remaining]);
                }
            }
        })
        .catch(() => {});

    // 2. Also try client-side Invidious search for "latest hindi dubbed full movie"
    fetchInvidiousSearch(targetQuery).then(liveMovies => {
        if (liveMovies && liveMovies.length > 0 && isInCloudStreamView && currentCloudCategory === 'All') {
            const sInput = document.getElementById('searchInput');
            if (!sInput || sInput.value.trim() === '') {
                const existingYts = new Set(liveMovies.map(m => m.yt));
                const remaining = initialList.filter(c => !existingYts.has(c.yt));
                renderCloudVideos([...liveMovies, ...remaining]);
            }
        }
    }).catch(() => {});
};
window.openYouTubeSection = window.openCloudStreamSection;

window.performCloudStreamSearch = function(query) {
    if (cloudStreamSearchDebounce) clearTimeout(cloudStreamSearchDebounce);

    // If currently in player view, exit player view cleanly and restore the Watch Stream grid
    if (isPlayerView) {
        destroyCurrentPlyr();
        isPlayerView = false;
        currentPlayingMovie = null;
        updateHeaderButton();
    }

    const grid = ensureCloudStreamGrid();

    if (!query || query.length === 0) {
        renderCloudCategoryFilter(currentCloudCategory);
        return;
    }

    if (grid) {
        grid.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #00d2ff; font-size: 15px;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px; display: block;"></i>
                Searching YouTube for "${query}"...
            </div>
        `;
    }

    cloudStreamSearchDebounce = setTimeout(async () => {
        // 1. Try local catalog match first
        const lower = query.toLowerCase();
        const localMatches = CURATED_CLOUD_CATALOG.filter(item => 
            (item.title && item.title.toLowerCase().includes(lower)) ||
            (item.author && item.author.toLowerCase().includes(lower)) ||
            (item.category && item.category.toLowerCase().includes(lower))
        );

        // 2. Fetch live online search from Invidious instance
        const liveResults = await fetchInvidiousSearch(query);

        const currentGrid = ensureCloudStreamGrid();
        if (liveResults && liveResults.length > 0) {
            // Combine results, prioritizing live results
            const existingIds = new Set(liveResults.map(r => r.yt));
            const extraLocal = localMatches.filter(l => !existingIds.has(l.yt));
            renderCloudVideos([...liveResults, ...extraLocal]);
        } else if (localMatches.length > 0) {
            renderCloudVideos(localMatches);
        } else {
            if (currentGrid) {
                currentGrid.innerHTML = `
                    <div style="text-align: center; padding: 50px 20px; color: #8b949e;">
                        <i class="fa-solid fa-film" style="font-size: 32px; margin-bottom: 12px; opacity: 0.5; display: block;"></i>
                        <div style="font-size: 16px; font-weight: 600; color: #c9d1d9; margin-bottom: 6px;">No YouTube streams found for "${query}"</div>
                        <div style="font-size: 13px;">Try searching with different terms like "Arijit Singh", "Lofi songs", "CarryMinati", or "Short Film".</div>
                    </div>
                `;
            }
        }
    }, 400);
};

window.clearCloudStreamSearch = function() {
    window.clearTopSearch();
};

window.setCloudCategory = function(cat, btn) {
    currentCloudCategory = cat;
    const pills = document.querySelectorAll('.cloud-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';

    renderCloudCategoryFilter(cat);
};

function renderCloudCategoryFilter(cat) {
    if (cat === 'All') {
        renderCloudVideos(CURATED_CLOUD_CATALOG);
    } else {
        const filtered = CURATED_CLOUD_CATALOG.filter(item => item.category === cat);
        renderCloudVideos(filtered);
    }
}

function createCloudVideoCard(video) {
    const card = document.createElement('div');
    card.className = 'cloud-video-card';
    card.onclick = () => {
        playCloudStreamVideo(video);
    };

    const posterSrc = video.poster || `https://i.ytimg.com/vi/${video.yt}/hqdefault.jpg`;
    const titleText = video.title || 'Untitled Stream';
    const channelName = video.author || 'YouTube Channel';
    const durationText = video.duration || 'Full Movie';
    const viewsText = video.views || '1.8M views';

    card.innerHTML = `
        <div class="cloud-thumb-wrapper">
            <img src="${posterSrc}" alt="${titleText}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=60';">
            ${durationText ? `<span class="cloud-duration-tag">${durationText}</span>` : ''}
        </div>
        <div class="yt-post-details">
            <div class="yt-channel-avatar">
                <i class="fa-brands fa-youtube"></i>
            </div>
            <div class="yt-details-box">
                <div class="yt-title-text" title="${titleText}">${titleText}</div>
                <div class="yt-channel-row">
                    <span class="yt-channel-name">${channelName} <i class="fa-solid fa-circle-check yt-verified-badge"></i></span>
                    <span class="yt-meta-dot">•</span>
                    <span>${viewsText}</span>
                    <span class="yt-meta-dot">•</span>
                    <span>${durationText}</span>
                </div>
            </div>
            <button class="yt-menu-dots-btn" type="button" aria-label="Action" onclick="event.stopPropagation();">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
        </div>
    `;
    return card;
}

function appendCloudVideosBatch(batchSize = CLOUD_BATCH_SIZE) {
    const grid = document.getElementById('cloudStreamGrid');
    if (!grid) return 0;

    const sentinel = document.getElementById('cloudStreamLoadingSentinel');
    const toRender = currentCloudFilteredList.slice(cloudRenderedCount, cloudRenderedCount + batchSize);
    if (!toRender || toRender.length === 0) return 0;

    toRender.forEach((video) => {
        cloudCardCount++;
        const card = createCloudVideoCard(video);
        if (sentinel && sentinel.parentNode === grid) {
            grid.insertBefore(card, sentinel);
        } else {
            grid.appendChild(card);
        }

        // Insert native 300x250 ad unit after every 18 video cards (Non-VIP only)
        if (!window.__isVipSubscribed && cloudCardCount % 18 === 0) {
            const adSlot = createAd300x250Element(true);
            adSlot.classList.add('ad-slot-grid-span');
            if (sentinel && sentinel.parentNode === grid) {
                grid.insertBefore(adSlot, sentinel);
            } else {
                grid.appendChild(adSlot);
            }
        }
    });

    cloudRenderedCount += toRender.length;
    return toRender.length;
}

async function fetchMoreInfiniteCloudVideos() {
    const nextQuery = INFINITE_YOUTUBE_QUERIES[cloudQueryIndex % INFINITE_YOUTUBE_QUERIES.length];
    cloudQueryIndex++;

    const existingYts = new Set(currentCloudFilteredList.map(v => v.yt).filter(Boolean));
    const newVideos = [];

    // 1. Try local dev-server endpoint
    try {
        const res = await fetch(`/api/youtube-related?q=${encodeURIComponent(nextQuery)}`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                data.forEach(item => {
                    const yId = item.videoId || item.yt;
                    if (yId && !existingYts.has(yId)) {
                        existingYts.add(yId);
                        newVideos.push({
                            id: `stream_${yId}`,
                            title: item.title,
                            category: 'Latest Hindi Dubbed Full Movie',
                            poster: item.poster || `https://i.ytimg.com/vi/${yId}/hqdefault.jpg`,
                            rating: item.rating || '4.8',
                            yt: yId,
                            author: item.channel || 'YouTube',
                            duration: item.duration || 'Full HD',
                            views: item.views || 'HD Stream'
                        });
                    }
                });
            }
        }
    } catch (e) {}

    // 2. Try Invidious search
    if (newVideos.length === 0) {
        try {
            const liveMovies = await fetchInvidiousSearch(nextQuery);
            if (Array.isArray(liveMovies) && liveMovies.length > 0) {
                liveMovies.forEach(v => {
                    if (v.yt && !existingYts.has(v.yt)) {
                        existingYts.add(v.yt);
                        newVideos.push(v);
                    }
                });
            }
        } catch (e) {}
    }

    // 3. Fallback: If network searches yielded no new unique videos, cycle/remix curated catalog
    if (newVideos.length === 0 && Array.isArray(CURATED_CLOUD_CATALOG) && CURATED_CLOUD_CATALOG.length > 0) {
        const shuffled = [...CURATED_CLOUD_CATALOG].sort(() => 0.5 - Math.random());
        shuffled.slice(0, 15).forEach((item, idx) => {
            newVideos.push({
                ...item,
                id: `stream_remix_${cloudQueryIndex}_${idx}_${item.yt || idx}`,
                views: `${(Math.random() * 4 + 1).toFixed(1)}M views`
            });
        });
    }

    if (newVideos.length > 0) {
        currentCloudFilteredList.push(...newVideos);
    }
}

async function loadMoreCloudVideos() {
    if (!isInCloudStreamView || isPlayerView || cloudIsLoadingMore) return;
    cloudIsLoadingMore = true;

    const sentinel = document.getElementById('cloudStreamLoadingSentinel');
    if (sentinel) {
        sentinel.style.display = 'flex';
        sentinel.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Loading more YouTube videos...</span>`;
    }

    try {
        if (cloudRenderedCount < currentCloudFilteredList.length) {
            appendCloudVideosBatch(CLOUD_BATCH_SIZE);
            if (cloudRenderedCount >= currentCloudFilteredList.length - 8) {
                fetchMoreInfiniteCloudVideos().catch(() => {});
            }
        } else {
            await fetchMoreInfiniteCloudVideos();
            appendCloudVideosBatch(CLOUD_BATCH_SIZE);
        }
    } catch (e) {
        console.warn('Error loading more cloud stream videos:', e);
    } finally {
        setTimeout(() => {
            cloudIsLoadingMore = false;
        }, 150);
    }
}

function handleCloudWindowScroll() {
    if (!isInCloudStreamView || isPlayerView || cloudIsLoadingMore) return;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const windowHeight = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight || document.body.scrollHeight;
    if (scrollY + windowHeight >= docHeight - 650) {
        loadMoreCloudVideos();
    }
}

function ensureCloudStreamSentinel(grid) {
    let sentinel = document.getElementById('cloudStreamLoadingSentinel');
    if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.id = 'cloudStreamLoadingSentinel';
        sentinel.className = 'cloud-loading-sentinel';
        sentinel.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Loading more YouTube videos...</span>`;
        grid.appendChild(sentinel);
    } else {
        grid.appendChild(sentinel);
    }

    if (cloudScrollObserver) {
        cloudScrollObserver.disconnect();
    }
    if (window.IntersectionObserver) {
        cloudScrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && isInCloudStreamView && !isPlayerView && !cloudIsLoadingMore) {
                    loadMoreCloudVideos();
                }
            });
        }, { rootMargin: '600px 0px' });
        cloudScrollObserver.observe(sentinel);
    }

    if (!cloudWindowScrollAttached) {
        window.addEventListener('scroll', handleCloudWindowScroll, { passive: true });
        cloudWindowScrollAttached = true;
    }
}

function renderCloudVideos(videos) {
    currentCloudFilteredList = (videos && videos.length > 0) 
        ? [...videos] 
        : (typeof CURATED_CLOUD_CATALOG !== 'undefined' ? [...CURATED_CLOUD_CATALOG] : []);
    const grid = ensureCloudStreamGrid();
    if (!grid) return;

    grid.innerHTML = '';
    cloudRenderedCount = 0;
    cloudCardCount = 0;

    if (!currentCloudFilteredList || currentCloudFilteredList.length === 0) {
        grid.innerHTML = `
            <div style="text-align: center; width: 100%; padding: 40px 20px; color: #8b949e;">
                <i class="fa-solid fa-play" style="font-size: 28px; margin-bottom: 10px; opacity: 0.5; display: block;"></i>
                No videos available in this category.
            </div>
        `;
        return;
    }

    appendCloudVideosBatch(CLOUD_BATCH_SIZE);
    ensureCloudStreamSentinel(grid);
}

function playCloudStreamVideo(video, preserveFullscreen = false) {
    if (!preserveFullscreen) {
        savedScrollPosition = window.scrollY || window.pageYOffset || 0;
    }
    const movieObj = {
        title: video.title,
        name: video.title,
        poster: video.poster,
        category: video.category || 'Cloud Stream',
        rating: video.rating || '4.8',
        yt: video.yt,
        cast: [video.author || 'Cloud Stream Creator']
    };
    window.openPlayer(movieObj, preserveFullscreen);
}
window.playCloudStreamVideo = playCloudStreamVideo;

fetchMovies();

// ==========================================
// VIP SUBSCRIPTION CONTROLLER & UI
// ==========================================
function subToast(msg) {
    let t = document.getElementById('subToastPill');
    if (!t) {
        t = document.createElement('div');
        t.id = 'subToastPill';
        t.style.position = 'fixed';
        t.style.bottom = '80px';
        t.style.left = '50%';
        t.style.transform = 'translateX(-50%)';
        t.style.background = 'linear-gradient(135deg, #1e1e2f, #2d2d44)';
        t.style.color = '#ffffff';
        t.style.padding = '12px 20px';
        t.style.borderRadius = '25px';
        t.style.boxShadow = '0 10px 25px rgba(0,0,0,0.6), 0 0 15px rgba(197, 75, 255, 0.4)';
        t.style.border = '1px solid #c54bff';
        t.style.zIndex = '999999';
        t.style.fontSize = '13px';
        t.style.fontWeight = '600';
        t.style.pointerEvents = 'none';
        t.style.transition = 'all 0.3s ease';
        t.style.textAlign = 'center';
        t.style.maxWidth = '90%';
        document.body.appendChild(t);
    }
    t.innerText = msg;
    t.style.opacity = '1';
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => {
        t.style.opacity = '0';
    }, 3500);
}

window.openSubscriptionSection = function() {
    if (typeof window.stopGpsCamera === 'function') window.stopGpsCamera();
    isInGpsCameraView = false;
    applySubscriptionUserAgent();
    isInSubscriptionView = true;
    isInCommentView = false;
    isInCloudStreamView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'VIP Subscription & Wallet...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderSubscriptionPage();
};

async function renderSubscriptionPage() {
    applySubscriptionUserAgent();
    const container = document.getElementById('mainContainer');
    if (!container) return;

    const deviceId = getDeviceId();
    let isSub = false;
    let daysRemaining = 0;
    let expiresAtFormatted = '';

    try {
        const statusCheck = await checkActiveSubscription();
        isSub = statusCheck.isSubscribed;
        window.__isVipSubscribed = isSub;
        daysRemaining = statusCheck.daysRemaining;
        if (statusCheck.expiryDate) {
            expiresAtFormatted = statusCheck.expiryDate.toLocaleDateString();
        }
    } catch (e) {
        console.error('Error fetching subscription status:', e);
    }

    container.innerHTML = `
        <style>
        /* Base Style */
        .sub-user-theme-wrapper {
          background: #000 !important;
          color: #fff !important;
          font-family: 'Poppins', sans-serif !important;
          margin: 0 !important;
          padding: 20px 14px 60px 14px !important;
        }

        .sub-user-theme-wrapper .container h1 {
          text-align: center !important;
          margin-bottom: 12px !important;
          font-weight: 700 !important;
          font-size: 26px !important;
          color: #fff !important;
        }

        /* Pricing Plans Style */
        .sub-user-theme-wrapper .plans {
          display: grid !important;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)) !important;
          gap: 20px !important;
          max-width: 1200px !important;
          margin: 0 auto !important;
          padding: 10px 0 !important;
          box-sizing: border-box !important;
        }

        .sub-user-theme-wrapper .plan {
          background: linear-gradient(180deg, #111, #000) !important;
          border-radius: 12px !important;
          overflow: hidden !important;
          box-shadow: 0 10px 30px rgba(0,0,0,.6) !important;
          transition: .3s !important;
          border: 1px solid #333 !important;
          display: flex !important;
          flex-direction: column !important;
          box-sizing: border-box !important;
        }

        .sub-user-theme-wrapper .plan:hover {
          transform: translateY(-6px) !important;
          border-color: #e50914 !important;
          box-shadow: 0 14px 40px rgba(229, 9, 20, 0.3) !important;
        }

        .sub-user-theme-wrapper .plan-header {
          background: #e50914 !important;
          padding: 15px !important;
          text-align: center !important;
          font-weight: 600 !important;
          color: white !important;
          font-size: 16px !important;
        }

        .sub-user-theme-wrapper .plan-body {
          padding: 25px !important;
          text-align: center !important;
          flex-grow: 1 !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          box-sizing: border-box !important;
        }

        .sub-user-theme-wrapper .price {
          font-size: 36px !important;
          font-weight: 700 !important;
          margin: 10px 0 !important;
          color: white !important;
          line-height: 1.1 !important;
        }

        .sub-user-theme-wrapper .duration {
          opacity: .8 !important;
          margin-bottom: 10px !important;
          color: white !important;
          font-size: 14px !important;
        }

        .sub-user-theme-wrapper .device {
          opacity: .8 !important;
          margin-bottom: 20px !important;
          color: white !important;
          font-size: 13px !important;
        }

        .sub-user-theme-wrapper .btn {
          display: block !important;
          width: 100% !important;
          background: #e50914 !important;
          color: #fff !important;
          padding: 12px 25px !important;
          border-radius: 6px !important;
          text-decoration: none !important;
          font-weight: 600 !important;
          border: none !important;
          cursor: pointer !important;
          transition: 0.3s !important;
          font-size: 15px !important;
          box-sizing: border-box !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }

        .sub-user-theme-wrapper .btn:hover {
          background: #b80710 !important;
        }

        .sub-user-theme-wrapper .btn:disabled {
          opacity: 0.6 !important;
          cursor: not-allowed !important;
        }

        /* Custom Alert Popup UI */
        .custom-alert-overlay {
          position: fixed !important;
          top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important;
          background: rgba(0, 0, 0, 0.85) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          z-index: 99999 !important;
          opacity: 0 !important;
          visibility: hidden !important;
          transition: 0.3s ease-in-out !important;
        }

        .custom-alert-overlay.show {
          opacity: 1 !important;
          visibility: visible !important;
        }

        .custom-alert-box {
          background: #111 !important;
          border: 2px solid #e50914 !important;
          padding: 30px !important;
          border-radius: 14px !important;
          text-align: center !important;
          max-width: 400px !important;
          width: 90% !important;
          box-shadow: 0 10px 40px rgba(229, 9, 20, 0.3) !important;
          transform: scale(0.7) !important;
          transition: 0.3s ease-in-out !important;
          box-sizing: border-box !important;
        }

        .custom-alert-overlay.show .custom-alert-box {
          transform: scale(1) !important;
        }

        .custom-alert-box .icon {
          font-size: 45px !important;
          color: #04AA6D !important;
          margin-bottom: 15px !important;
        }

        .custom-alert-box h3 {
          margin: 0 0 10px 0 !important;
          font-size: 20px !important;
          font-weight: 700 !important;
          color: #fff !important;
        }

        .custom-alert-box p {
          margin: 0 !important;
          color: #ccc !important;
          font-size: 14px !important;
        }

        /* Loading Spinner for Popup */
        .alert-spinner {
          display: inline-block !important;
          width: 20px !important;
          height: 20px !important;
          border: 3px solid rgba(255,255,255,.3) !important;
          border-top-color: #e50914 !important;
          border-radius: 50% !important;
          animation: spin 1s linear infinite !important;
          margin-top: 15px !important;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        </style>

        <div class="sub-user-theme-wrapper" style="min-height: 80vh; background: #000; color: #fff; font-family: 'Poppins', sans-serif; padding: 20px 14px 60px 14px;">
            <!-- Top Navigation & Device Info -->
            <div style="max-width: 1200px; margin: 0 auto 24px auto; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #222; padding-bottom: 14px; flex-wrap: wrap; gap: 10px;">
                <button onclick="window.handleMenuOrBack()" style="background: #1a1a1a; color: #fff; border: 1px solid #333; padding: 8px 16px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-arrow-left"></i> Back to Movies
                </button>
                <div style="color: #888; font-size: 12px; font-family: monospace; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-shield-halved" style="color: #04AA6D;"></i> Device: ${deviceId.slice(0, 14)}
                </div>
            </div>

            ${isSub ? `
                <!-- Active VIP Status Banner -->
                <div style="max-width: 1200px; margin: 0 auto 28px auto; background: linear-gradient(90deg, #111, #1a0505, #111); border: 2px solid #e50914; border-radius: 12px; padding: 18px; box-shadow: 0 10px 30px rgba(229,9,20,0.3); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(229,9,20,0.2); border: 1px solid #e50914; display: flex; align-items: center; justify-content: center; color: #e50914; font-size: 22px;">
                            <i class="fa-solid fa-circle-check"></i>
                        </div>
                        <div>
                            <div style="font-size: 16px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px;">
                                <span>VIP Subscription Active</span>
                                <span style="font-size: 11px; background: #e50914; color: #fff; padding: 2px 8px; border-radius: 4px;">100% Ad-Free</span>
                            </div>
                            <div style="font-size: 12px; color: #aaa; margin-top: 4px;">
                                ${daysRemaining} Day(s) remaining • All video & banner ads removed
                                ${expiresAtFormatted ? ` • Expires: ${expiresAtFormatted}` : ''}
                            </div>
                        </div>
                    </div>
                    <button onclick="window.handleMenuOrBack()" style="background: #e50914; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; cursor: pointer;">
                        Enjoy HD Stream
                    </button>
                </div>
            ` : ''}

            <!-- Main Pricing Plans Container (User Defined) -->
            <div class="container" style="max-width: 1200px; margin: 0 auto;">
                <h1>Subscribe now at a very low price.</h1>
                <p style="text-align:center; color: #bbb; margin-bottom: 30px;">Recommended UPI Payment<br/><span style="color: #04AA6D; font-weight: 600;">Safe And Secure</span></p>
                <div class="plans">
                    <div class="plan">
                        <div class="plan-header">Basic Plan</div>
                        <div class="plan-body">
                            <div>
                                <div class="price">₹20.00</div>
                                <div class="duration">5 Day(s)</div>
                                <div class="device">Device Limit - 1</div>
                            </div>
                            <button onclick="window.payAndActivate(20, 5, 'Basic Plan', this)" class="btn">SELECT PLAN</button>
                        </div>
                    </div>

                    <div class="plan">
                        <div class="plan-header">Premium Plan</div>
                        <div class="plan-body">
                            <div>
                                <div class="price">₹70.99</div>
                                <div class="duration">1 Month(s)</div>
                                <div class="device">Device Limit - 1</div>
                            </div>
                            <button onclick="window.payAndActivate(70.99, 30, 'Premium Plan', this)" class="btn">SELECT PLAN</button>
                        </div>
                    </div>

                    <div class="plan">
                        <div class="plan-header">Platinum Plan</div>
                        <div class="plan-body">
                            <div>
                                <div class="price">₹500.00</div>
                                <div class="duration">6 Month(s)</div>
                                <div class="device">Device Limit - 1</div>
                            </div>
                            <button onclick="window.payAndActivate(500, 180, 'Platinum Plan', this)" class="btn">SELECT PLAN</button>
                        </div>
                    </div>

                    <div class="plan">
                        <div class="plan-header">Diamond Plan</div>
                        <div class="plan-body">
                            <div>
                                <div class="price">₹800.00</div>
                                <div class="duration">1 Year(s)</div>
                                <div class="device">Device Limit - 1</div>
                            </div>
                            <button onclick="window.payAndActivate(800, 365, 'Diamond Plan', this)" class="btn">SELECT PLAN</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Custom Alert Popup UI -->
            <div id="customAlert" class="custom-alert-overlay">
                <div class="custom-alert-box">
                    <div class="icon">✓</div>
                    <h3>Subscription Activated!</h3>
                    <p>Successfully processed. Redirecting...</p>
                    <div class="alert-spinner"></div>
                </div>
            </div>
        </div>
    `;
}
window.renderSubscriptionPage = renderSubscriptionPage;
window.payAndActivate = payAndActivate;
window.checkActiveSubscription = checkActiveSubscription;
window.saveSubscriptionToFirebase = saveSubscriptionToFirebase;
window.showCustomAlert = showCustomAlert;
window.hideCustomAlert = hideCustomAlert;


// ==========================================
// VIP SUBSCRIPTION CONTROLLER & MODAL POPUP
// ==========================================
window.isUserSubscribed = function() {
    if (window.__isVipSubscribed === true || window.__hasActiveSubscription === true) return true;
    try {
        const flag = localStorage.getItem('vdosky_is_vip');
        if (flag === 'true' || flag === '1') return true;
        const cache = localStorage.getItem('vdosky_subscription_cache');
        if (cache) {
            const parsed = JSON.parse(cache);
            if (parsed && parsed.isSubscribed) return true;
        }
    } catch (e) {}
    return false;
};

// Gatekeeper for Extra Tools (GPS Map Camera is excluded / stays free!)
window.checkExtraToolSubscription = function(onSuccess) {
    if (isInAdminView) {
        if (typeof onSuccess === 'function') onSuccess();
        return true;
    }
    if (!window.isUserSubscribed()) {
        window.showSubscriptionModal(() => {
            if (typeof onSuccess === 'function') onSuccess();
        });
        return false;
    }
    return true;
};

let pendingSubscriptionCallback = null;

window.showSubscriptionModal = function(callbackOnSuccess = null) {
    // Crucial: In Admin section, no subscription popup will appear!
    if (isInAdminView) {
        if (typeof callbackOnSuccess === 'function') {
            callbackOnSuccess();
        }
        return;
    }

    // If user is already subscribed, do NOT show any popup! Execute directly!
    if (window.isUserSubscribed()) {
        if (typeof callbackOnSuccess === 'function') {
            callbackOnSuccess();
        }
        return;
    }

    pendingSubscriptionCallback = callbackOnSuccess;

    if (typeof window.showSubscriptionAlert === 'function') {
        window.showSubscriptionAlert();
        return;
    }

    let modal = document.getElementById('vipSubscriptionModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'vipSubscriptionModal';
        modal.className = 'sub-alert-overlay';
        modal.onclick = () => window.closeSubscriptionModal();
        modal.innerHTML = `
            <div class="sub-alert-card" onclick="event.stopPropagation()">
                <div class="sub-alert-icon-box">
                    <span>?</span>
                </div>
                <h3 class="sub-alert-title">Go Ad-Free with VIP</h3>
                <p class="sub-alert-desc">Subscribe to remove all ads and enjoy uninterrupted movie & video streaming!</p>
                <div class="sub-alert-btn-group">
                    <button type="button" class="sub-alert-btn-cancel" onclick="window.closeSubscriptionModal()">Cancel</button>
                    <button type="button" class="sub-alert-btn-subscribe" onclick="window.closeSubscriptionModal(); window.openSubscriptionSection();">Subscribe Now</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

window.closeSubscriptionModal = function() {
    const modal = document.getElementById('vipSubscriptionModal');
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
    pendingSubscriptionCallback = null;
};

// Game Zone Launcher (Free to play with ads; VIP plays ad-free)
window.launchGame = function(gameUrl) {
    window.location.href = gameUrl;
};

// ==========================================
// COMMENT & COMMUNITY SECTION (contact2.me/viwem3)
// ==========================================
window.openCommentSection = function(prefillMovieTitle = '') {
    if (typeof window.stopGpsCamera === 'function') window.stopGpsCamera();
    isInGpsCameraView = false;
    isInCommentView = true;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Comments & Feedback...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderCommentPage(prefillMovieTitle);
};

function renderCommentPage(prefillMovieTitle = '') {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    const safeMovieTitle = String(prefillMovieTitle || '').trim();
    const movieReportBanner = safeMovieTitle ? `
        <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 10px; color: #fca5a5; font-size: 13px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; font-size: 16px; flex-shrink: 0;"></i>
                <div>
                    <strong>Report Movie:</strong> <span style="color: #ffffff; font-weight: 700;">"${safeMovieTitle}"</span>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Movie title is copied to your clipboard. Paste it in the comment box below.</div>
                </div>
            </div>
            <button type="button" onclick="navigator.clipboard.writeText('Report: Movie \\'${safeMovieTitle.replace(/'/g, "\\'")}\\' video link not working! Please fix.'); showToast('Report text copied!');" style="background: #ef4444; color: #fff; border: none; padding: 7px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-copy"></i> Copy Text
            </button>
        </div>
    ` : '';

    container.innerHTML = `
        <div class="comment-wrapper">
            <!-- Hero Header Banner -->
            <div class="comment-hero-banner">
                <div style="flex: 1; min-width: 240px;">
                    <div class="comment-hero-title">
                        <i class="fa-solid fa-comments" style="color: #38bdf8; font-size: 20px;"></i>
                        <span>Comments & Feedback</span>
                    </div>
                    <div class="comment-hero-sub">
                        Share your feedback, report broken movies, or leave a comment below.
                    </div>
                </div>
            </div>

            ${movieReportBanner}

            <!-- Comment Embed Frame -->
            <div class="comment-frame-card">
                <div class="comment-frame-loader" id="commentFrameLoader">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: #38bdf8;"></i>
                    <span>Loading Comments Section...</span>
                </div>
                <iframe id="commentSectionIframe"
                    src="https://contact2.me/viwem3"
                    allow="camera; microphone; clipboard-write; encrypted-media; fullscreen"
                    sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
                    onload="const l = document.getElementById('commentFrameLoader'); if(l) { l.style.opacity='0'; setTimeout(() => { l.style.display='none'; }, 300); }">
                </iframe>
            </div>

            <!-- Direct Link Helper -->
            <div style="text-align: center; margin-top: 14px; font-size: 12px; color: #94a3b8;">
                Having trouble loading? Open directly in browser: 
                <a href="#" onclick="window.openExternalCommentLink(); return false;" style="color: #38bdf8; text-decoration: underline; font-weight: 600;">
                    contact2.me/viwem3
                </a>
            </div>
        </div>
    `;
}

window.refreshCommentFrame = function() {
    const iframe = document.getElementById('commentSectionIframe');
    const loader = document.getElementById('commentFrameLoader');
    if (iframe) {
        if (loader) {
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        }
        iframe.src = "https://contact2.me/viwem3?_t=" + Date.now();
        showToast("Refreshing comments...");
    }
};

window.openExternalCommentLink = function() {
    const url = "https://contact2.me/viwem3";
    if (typeof window.openInChrome === 'function') {
        window.openInChrome(url);
    } else {
        window.open(url, '_blank');
    }
};

// ==========================================
// GAME ZONE SECTION
// ==========================================
window.openGameSection = function() {
    if (typeof window.stopGpsCamera === 'function') window.stopGpsCamera();
    isInGpsCameraView = false;
    isInGameView = true;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'games') {
            url.searchParams.set('view', 'games');
            window.history.replaceState({ view: 'games' }, '', url.toString());
        }
    } catch (e) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Games...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderGameZonePage();
};

function renderGameZonePage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 960px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <!-- Game Zone Hero Banner -->
            <div style="background: linear-gradient(135deg, #0d1b2a 0%, #112240 50%, #064e3b 100%); border: 1px solid rgba(0, 255, 136, 0.35); border-radius: 18px; padding: 22px 20px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(0, 255, 136, 0.15); position: relative; overflow: hidden;">
                <div style="position: absolute; right: -25px; top: -25px; font-size: 130px; color: rgba(0, 255, 136, 0.05); transform: rotate(15deg); pointer-events: none;">
                    <i class="fa-solid fa-gamepad"></i>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(0, 255, 136, 0.15); border: 2px solid #00ff88; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #00ff88; box-shadow: 0 0 18px rgba(0, 255, 136, 0.35);">
                            <i class="fa-solid fa-gamepad"></i>
                        </div>
                        <div>
                            <h2 style="font-size: 24px; font-weight: 800; margin: 0; color: #ffffff; letter-spacing: 0.5px; display: flex; align-items: center; gap: 10px;">
                                Game Zone
                                <span style="font-size: 11px; font-weight: 700; background: #00ff88; color: #000; padding: 3px 9px; border-radius: 20px; text-transform: uppercase;">4 Active</span>
                            </h2>
                            <p style="font-size: 13px; color: #94a3b8; margin: 4px 0 0 0;">Play exciting instant HTML5 games directly inside the app</p>
                        </div>
                    </div>
                    <button onclick="window.goHome();" style="padding: 9px 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-house"></i> Home
                    </button>
                </div>
            </div>

            <!-- Games Grid Container -->
            <div id="gameZoneList" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
                
                <!-- Game Card 1: Car Racing -->
                <div style="background: #151b2e; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.4); display: flex; flex-direction: column; transition: transform 0.2s ease, border-color 0.2s ease;">
                    <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #1c1c1c; overflow: hidden; cursor: pointer;" onclick="window.launchGame('car-racing.html')">
                        <img src="./games/car-racing/assets/car.jpg" alt="Car Racing" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.5); display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-fire"></i> HOT
                        </div>
                        <div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #facc15; border: 1px solid rgba(250, 204, 21, 0.4); display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-star"></i> 5.0
                        </div>
                        <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                            <div style="width: 54px; height: 54px; border-radius: 50%; background: #ef4444; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 0 20px rgba(239,68,68,0.6);">
                                <i class="fa-solid fa-play" style="margin-left: 3px;"></i>
                            </div>
                        </div>
                    </div>
                    <div style="padding: 16px; flex: 1; display: flex; flex-direction: column;">
                        <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 800; color: #ffffff; display: flex; align-items: center; justify-content: space-between;">
                            <span>Car Racing</span>
                            <span style="font-size: 12px; font-weight: 700; color: #ef4444; background: rgba(239, 68, 68, 0.15); padding: 2px 8px; border-radius: 6px;">Racing</span>
                        </h3>
                        <p style="margin: 0 0 16px 0; font-size: 13px; color: #94a3b8; line-height: 1.4; flex: 1;">
                            Drive through high-speed highway traffic! Dodge enemy cars using left and right steering to set record high scores.
                        </p>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="window.launchGame('car-racing.html')" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; font-size: 14px; font-weight: 800; border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.35);">
                                <i class="fa-solid fa-play"></i> Play Now
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Game Card 2: Ant Smash -->
                <div style="background: #151b2e; border: 1px solid rgba(0, 255, 136, 0.3); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.4); display: flex; flex-direction: column; transition: transform 0.2s ease, border-color 0.2s ease;">
                    <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #231815; overflow: hidden; cursor: pointer;" onclick="window.launchGame('ant-smash.html')">
                        <img src="./games/ant-smash/assets/anti.jpg" alt="Ant Smash" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.src='./games/ant-smash/assets/background.jpg'">
                        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #00ff88; border: 1px solid rgba(0, 255, 136, 0.4); display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-fire"></i> NEW GAME
                        </div>
                        <div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #facc15; border: 1px solid rgba(250, 204, 21, 0.4); display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-star"></i> 4.9
                        </div>
                        <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                            <div style="width: 54px; height: 54px; border-radius: 50%; background: #00ff88; color: #0b0e17; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 0 20px rgba(0,255,136,0.6);">
                                <i class="fa-solid fa-play" style="margin-left: 3px;"></i>
                            </div>
                        </div>
                    </div>
                    <div style="padding: 16px; flex: 1; display: flex; flex-direction: column;">
                        <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 800; color: #ffffff; display: flex; align-items: center; justify-content: space-between;">
                            <span>Ant Smash</span>
                            <span style="font-size: 12px; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 2px 8px; border-radius: 6px;">Arcade</span>
                        </h3>
                        <p style="margin: 0 0 16px 0; font-size: 13px; color: #94a3b8; line-height: 1.4; flex: 1;">
                            Protect the wooden table! Tap and smash incoming ants, spiders, scorpions, and flies before they reach the top.
                        </p>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="window.launchGame('ant-smash.html')" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #00ff88 0%, #059669 100%); color: #0b0e17; font-size: 14px; font-weight: 800; border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(0, 255, 136, 0.3);">
                                <i class="fa-solid fa-play"></i> Play Now
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Game Card 3: Fill The Gap -->
                <div style="background: #151b2e; border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.4); display: flex; flex-direction: column; transition: transform 0.2s ease, border-color 0.2s ease;">
                    <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #1c1a30; overflow: hidden; cursor: pointer;" onclick="window.launchGame('fill-the-gap.html')">
                        <img src="./games/fill-the-gap/assets/fill-the-gap.jpg" alt="Fill The Gap" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.5); display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-puzzle-piece"></i> PUZZLE
                        </div>
                        <div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #facc15; border: 1px solid rgba(250, 204, 21, 0.4); display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-star"></i> 4.9
                        </div>
                        <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                            <div style="width: 54px; height: 54px; border-radius: 50%; background: #a855f7; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 0 20px rgba(168,85,247,0.6);">
                                <i class="fa-solid fa-play" style="margin-left: 3px;"></i>
                            </div>
                        </div>
                    </div>
                    <div style="padding: 16px; flex: 1; display: flex; flex-direction: column;">
                        <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 800; color: #ffffff; display: flex; align-items: center; justify-content: space-between;">
                            <span>Fill The Gap</span>
                            <span style="font-size: 12px; font-weight: 700; color: #a855f7; background: rgba(168, 85, 247, 0.15); padding: 2px 8px; border-radius: 6px;">Tetris</span>
                        </h3>
                        <p style="margin: 0 0 16px 0; font-size: 13px; color: #94a3b8; line-height: 1.4; flex: 1;">
                            Arrange falling colorful blocks to complete horizontal lines and clear multiple rows simultaneously for mega bonus scores.
                        </p>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="window.launchGame('fill-the-gap.html')" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%); color: #ffffff; font-size: 14px; font-weight: 800; border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.35);">
                                <i class="fa-solid fa-play"></i> Play Now
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Game Card 4: Jewel Crush -->
                <div style="background: #151b2e; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,0.4); display: flex; flex-direction: column; transition: transform 0.2s ease, border-color 0.2s ease;">
                    <div style="position: relative; width: 100%; aspect-ratio: 16/9; background: #2c1605; overflow: hidden; cursor: pointer;" onclick="window.launchGame('jewel-crush.html')">
                        <img src="./games/jewel-crush/assets/jewel-crush.jpg" alt="Jewel Crush" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.5); display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-gem"></i> MATCH 3
                        </div>
                        <div style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #facc15; border: 1px solid rgba(250, 204, 21, 0.4); display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-star"></i> 5.0
                        </div>
                        <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s ease;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0'">
                            <div style="width: 54px; height: 54px; border-radius: 50%; background: #f59e0b; color: #1c0c02; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 0 20px rgba(245,158,11,0.6);">
                                <i class="fa-solid fa-play" style="margin-left: 3px;"></i>
                            </div>
                        </div>
                    </div>
                    <div style="padding: 16px; flex: 1; display: flex; flex-direction: column;">
                        <h3 style="margin: 0 0 6px 0; font-size: 18px; font-weight: 800; color: #ffffff; display: flex; align-items: center; justify-content: space-between;">
                            <span>Jewel Crush</span>
                            <span style="font-size: 12px; font-weight: 700; color: #f59e0b; background: rgba(245, 158, 11, 0.15); padding: 2px 8px; border-radius: 6px;">Casual</span>
                        </h3>
                        <p style="margin: 0 0 16px 0; font-size: 13px; color: #94a3b8; line-height: 1.4; flex: 1;">
                            Match 3 or more shiny gems of the same color to blast them! Reach target scores and unlock fun, challenging puzzle levels.
                        </p>
                        <div style="display: flex; gap: 10px;">
                            <button onclick="window.launchGame('jewel-crush.html')" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #1c0c02; font-size: 14px; font-weight: 800; border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.35);">
                                <i class="fa-solid fa-play"></i> Play Now
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Add More Games Placeholder Card -->
                <div style="background: rgba(22, 27, 46, 0.6); border: 2px dashed rgba(255, 255, 255, 0.15); border-radius: 16px; padding: 28px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 280px;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(255, 255, 255, 0.06); display: flex; align-items: center; justify-content: center; font-size: 24px; color: #94a3b8; margin-bottom: 14px;">
                        <i class="fa-solid fa-circle-plus"></i>
                    </div>
                    <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 700; color: #cbd5e1;">More Games Coming!</h4>
                    <p style="margin: 0; font-size: 13px; color: #64748b; max-width: 240px; line-height: 1.4;">
                        Send us more game codes or suggestions, and they will be added here step by step.
                    </p>
                </div>

            </div>
        </div>
    `;
}

// ==========================================
// ADMIN SECTION (LOCKED CONTENT & PLANS)
// ==========================================
window.openAdminSection = function() {
    if (typeof window.stopGpsCamera === 'function') window.stopGpsCamera();
    isInGpsCameraView = false;
    isInAdminView = true;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isPlayerView = false;
    isInCategoryView = false;
    
    // Crucial requirement: No subscription popup in Admin section!
    window.closeSubscriptionModal();
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'admin') {
            url.searchParams.set('view', 'admin');
            window.history.replaceState({ view: 'admin' }, '', url.toString());
        }
    } catch (e) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Admin Panel...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderAdminPage();
};

function renderAdminPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 1200px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: 'Poppins', sans-serif;">
            
            <!-- Top Admin Header Bar with Back Button -->
            <div style="background: linear-gradient(135deg, #1c1917 0%, #292524 50%, #451a03 100%); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 18px; padding: 20px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
                <div style="display: flex; align-items: center; gap: 14px;">
                    <div style="width: 52px; height: 52px; border-radius: 16px; background: rgba(245, 158, 11, 0.15); border: 2px solid #f59e0b; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #f59e0b; box-shadow: 0 0 18px rgba(245, 158, 11, 0.35);">
                        <i class="fa-solid fa-user-shield"></i>
                    </div>
                    <div>
                        <h2 style="font-size: 22px; font-weight: 800; margin: 0; color: #ffffff; letter-spacing: 0.5px; display: flex; align-items: center; gap: 10px;">
                            Admin Panel
                            <span style="font-size: 11px; font-weight: 700; background: #f59e0b; color: #000; padding: 2px 8px; border-radius: 20px; text-transform: uppercase;">Protected</span>
                        </h2>
                        <p style="font-size: 13px; color: #a8a29e; margin: 4px 0 0 0;">Authorized administrator configuration & plan manager</p>
                    </div>
                </div>
                <button onclick="window.goHome();" style="padding: 9px 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-house"></i> Home
                </button>
            </div>

            <!-- Password Protected Box -->
            <div id="protected-content-box" class="password-wrapper-flex">
              <div style="max-width: 400px; width: 90%; padding: 30px; border: 1px solid #333; border-radius: 12px; font-family: 'Poppins', sans-serif; text-align: center; background: #111; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.8);">
                <h3 style="color: #fff; margin-bottom: 10px; font-size: 22px;">🔒 Locked Content</h3>
                <p style="color: #ccc; font-size: 14px; margin-bottom: 20px;">To view this post, enter the password below:</p>
                
                <input type="password" id="post-password" placeholder="Enter Password Here" style="width: 100%; padding: 12px; font-size: 16px; border: 1px solid #444; background: #000; color: #fff; border-radius: 6px; margin-bottom: 15px; outline: none; box-sizing: border-box; text-align: center;" />
                
                <button onclick="window.checkAdminPassword()" style="width: 100%; padding: 12px; background-color: #e50914; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: 600;">Unlock Content</button>
                
                <p id="error-msg" style="color: #e50914; font-size: 13px; margin-top: 12px; display: none;">❌ Only Admin Access</p>
              </div>
            </div>

            <!-- Asol Content Jeta Password Dile Show Hobe (Pricing Plans) -->
            <div id="secret-content" style="display: none; padding: 20px 0;">
              <div class="container">
                <h1 style="text-align: center; margin-bottom: 40px; font-weight: 700; font-size: 26px;">Subscribe now at a very low price.</h1>
                <div class="plans">
                  <div class="plan">
                    <div class="plan-header">Basic Plan</div>
                    <div class="plan-body">
                      <div>
                        <div class="price">₹10.00</div>
                        <div class="duration">2 Day(s)</div>
                        <div class="device">Device Limit - 1</div>
                      </div>
                      <button onclick="window.activateAdminPlan(2, this)" class="btn">SELECT PLAN</button>
                    </div>
                  </div>

                  <div class="plan">
                    <div class="plan-header">Premium Plan</div>
                    <div class="plan-body">
                      <div>
                        <div class="price">₹39.99</div>
                        <div class="duration">1 Month(s)</div>
                        <div class="device">Device Limit - 1</div>
                      </div>
                      <button onclick="window.activateAdminPlan(30, this)" class="btn">SELECT PLAN</button>
                    </div>
                  </div>

                  <div class="plan">
                    <div class="plan-header">Platinum Plan</div>
                    <div class="plan-body">
                      <div>
                        <div class="price">₹299.00</div>
                        <div class="duration">6 Month(s)</div>
                        <div class="device">Device Limit - 1</div>
                      </div>
                      <button onclick="window.activateAdminPlan(180, this)" class="btn">SELECT PLAN</button>
                    </div>
                  </div>

                  <div class="plan">
                    <div class="plan-header">Diamond Plan</div>
                    <div class="plan-body">
                      <div>
                        <div class="price">₹579.00</div>
                        <div class="duration">1 Year(s)</div>
                        <div class="device">Device Limit - 1</div>
                      </div>
                      <button onclick="window.activateAdminPlan(365, this)" class="btn">SELECT PLAN</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Custom Alert Popup -->
              <div id="adminCustomAlert" class="custom-alert-overlay">
                <div class="custom-alert-box">
                  <div class="icon">✓</div>
                  <h3>Subscription Activated!</h3>
                  <p>Successfully processed. Redirecting to Home page...</p>
                  <div class="alert-spinner"></div>
                </div>
              </div>
            </div>

        </div>
    `;

    const passInput = document.getElementById("post-password");
    if (passInput) {
        passInput.focus();
        passInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                window.checkAdminPassword();
            }
        });
    }
}

window.checkAdminPassword = function() {
    const inputEl = document.getElementById("post-password");
    const errorMsg = document.getElementById("error-msg");
    const protectedBox = document.getElementById("protected-content-box");
    const secretContent = document.getElementById("secret-content");
    if (!inputEl) return;

    const userEntered = inputEl.value.trim();
    const correctPassword = "s2026kp";

    if (userEntered === correctPassword) {
        if (protectedBox) protectedBox.style.display = "none";
        if (secretContent) secretContent.style.display = "block";
        if (errorMsg) errorMsg.style.display = "none";
        showToast("Access Granted: Admin Plans Unlocked");
    } else {
        if (errorMsg) errorMsg.style.display = "block";
        inputEl.style.borderColor = "#e50914";
        showToast("❌ Only Admin Access");
    }
};

window.activateAdminPlan = async function(days, buttonEl) {
    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = "Processing...";
    }

    try {
        await saveSubscriptionToFirebase(days);
        const alertBox = document.getElementById("adminCustomAlert") || document.getElementById("customAlert");
        if (alertBox) {
            alertBox.classList.add("show");
        }
        setTimeout(() => {
            if (alertBox) alertBox.classList.remove("show");
            window.goHome();
        }, 2000);
    } catch(e) {
        console.error("Admin plan activation error:", e);
        alert("Database Error! Contact Support.");
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = "SELECT PLAN";
        }
    }
};

// ==========================================
// GPS MAP CAMERA (REAL GPS & CREATE GPS SUITE)
// ==========================================
window.openRealGps = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (window.Android && typeof window.Android.requestCameraAndLocationPermissions === 'function') {
        try { window.Android.requestCameraAndLocationPermissions(); } catch(err) {}
    }

    const realGpsUrl = "https://appcreator05.github.io/gps-image/3/index.html";
    if (typeof window.openCustomTab === 'function') {
        window.openCustomTab(realGpsUrl);
    } else if (typeof window.openInChrome === 'function') {
        window.openInChrome(realGpsUrl);
    } else {
        window.open(realGpsUrl, '_blank', 'noopener,noreferrer');
    }
    return false;
};

window.openCreateGps = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (window.Android && typeof window.Android.requestCameraAndLocationPermissions === 'function') {
        try { window.Android.requestCameraAndLocationPermissions(); } catch(err) {}
    }

    const createGpsUrl = "https://appcreator05.github.io/gps-image/1/index.html";
    if (typeof window.openCustomTab === 'function') {
        window.openCustomTab(createGpsUrl);
    } else if (typeof window.openInChrome === 'function') {
        window.openInChrome(createGpsUrl);
    } else {
        window.open(createGpsUrl, '_blank', 'noopener,noreferrer');
    }
    return false;
};

window.openGpsCameraSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    isInGpsCameraView = true;
    isInQrCodeView = false;
    isInMp3TrimmerView = false;
    if (typeof cleanupMp3Trimmer === 'function') {
        cleanupMp3Trimmer();
    }
    isInExtraToolsView = false;
    isInStore35View = false;
    isInGifMakerView = false;
    isInVoiceRecorderView = false;
    if (typeof cleanupVoiceRecorder === 'function') {
        cleanupVoiceRecorder();
    }
    isInSketchView = false;
    isInCompressorView = false;
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'gps-camera') {
            url.searchParams.set('view', 'gps-camera');
            window.history.replaceState({ view: 'gps-camera' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search GPS Camera...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    // Request native Android permissions if running in APK
    if (window.Android && typeof window.Android.requestCameraAndLocationPermissions === 'function') {
        try { window.Android.requestCameraAndLocationPermissions(); } catch(err) {}
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderGpsCameraSectionPage();
    return false;
};
window.openGpsCameraLink = window.openGpsCameraSection;

// GPS Image Global State
let gpsUploadedImage = new Image();
let gpsStaticMap = new Image();
gpsStaticMap.crossOrigin = "anonymous";
gpsStaticMap.src = "https://raw.githubusercontent.com/appcreator05/gps-image/refs/heads/main/logo.png";

function renderGpsCameraSectionPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 860px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            
            <!-- Top Navigation Controls -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.2s;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window.openChromeDownloadsModal();" style="padding: 9px 14px; background: rgba(66, 133, 244, 0.18); border: 1px solid rgba(66, 133, 244, 0.45); color: #8ab4f8; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-download"></i> Downloads
                    </button>
                    <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-house"></i> Home
                    </button>
                </div>
            </div>

            <!-- GPS Map Camera Main Card -->
            <div style="background: linear-gradient(145deg, #181126 0%, #0d0818 100%); border: 1.5px solid rgba(192, 132, 252, 0.5); border-radius: 20px; padding: 26px 20px; box-shadow: 0 16px 40px rgba(0,0,0,0.6);">
                
                <style>
                    .gps-form-group {
                        margin-bottom: 15px;
                        position: relative;
                        text-align: left;
                    }
                    .gps-label {
                        display: block;
                        margin-bottom: 6px;
                        font-weight: 700;
                        color: #e2e8f0;
                        font-size: 13.5px;
                    }
                    .gps-input-text {
                        width: 100%;
                        padding: 12px 14px;
                        background: #1c142e;
                        border: 1.5px solid rgba(192, 132, 252, 0.35);
                        border-radius: 10px;
                        box-sizing: border-box;
                        font-size: 14.5px;
                        color: #ffffff;
                        outline: none;
                        transition: border-color 0.2s, box-shadow 0.2s;
                    }
                    .gps-input-text:focus {
                        border-color: #c084fc;
                        box-shadow: 0 0 14px rgba(192, 132, 252, 0.35);
                    }
                    .gps-btn-primary {
                        width: 100%;
                        padding: 13px;
                        background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
                        color: white;
                        border: none;
                        border-radius: 11px;
                        font-size: 16px;
                        cursor: pointer;
                        margin-top: 12px;
                        font-weight: 800;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        box-shadow: 0 4px 16px rgba(40, 167, 69, 0.4);
                        transition: all 0.2s;
                    }
                    .gps-btn-primary:hover {
                        background: linear-gradient(135deg, #218838 0%, #19692c 100%);
                        transform: translateY(-1px);
                    }
                    .gps-btn-download {
                        width: 100%;
                        padding: 13px;
                        background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
                        color: white;
                        border: none;
                        border-radius: 11px;
                        font-size: 16px;
                        cursor: pointer;
                        margin-top: 15px;
                        font-weight: 800;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        box-shadow: 0 4px 16px rgba(0, 123, 255, 0.4);
                        transition: all 0.2s;
                    }
                    .gps-btn-download:hover {
                        background: linear-gradient(135deg, #0069d9 0%, #004494 100%);
                    }
                    #addressSuggestions {
                        position: absolute;
                        top: 100%;
                        left: 0;
                        right: 0;
                        background: #241a3a;
                        border: 1px solid rgba(192, 132, 252, 0.5);
                        border-top: none;
                        border-radius: 0 0 10px 10px;
                        max-height: 160px;
                        overflow-y: auto;
                        z-index: 9999;
                        display: none;
                        box-shadow: 0 8px 18px rgba(0,0,0,0.5);
                    }
                    .gps-suggestion-item {
                        padding: 12px 14px;
                        cursor: pointer;
                        font-size: 13.5px;
                        color: #f1f5f9;
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                        transition: background-color 0.15s;
                    }
                    .gps-suggestion-item:hover, .gps-suggestion-item:active {
                        background-color: rgba(192, 132, 252, 0.25);
                        color: #fff;
                    }
                </style>

                <!-- Header Icon & Title -->
                <div style="text-align: center; margin-bottom: 18px;">
                    <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: rgba(192, 132, 252, 0.2); border: 2px solid #c084fc; font-size: 26px; color: #c084fc; margin-bottom: 10px; box-shadow: 0 0 20px rgba(192, 132, 252, 0.35);">
                        <i class="fa-solid fa-camera"></i>
                    </div>
                    <h2 style="font-size: 24px; font-weight: 800; margin: 0 0 4px 0; color: #ffffff;">GPS Photo Creator (Original Size)</h2>
                    <p style="font-size: 13px; color: #cbd5e1; margin: 0;">Add live GPS location, real address, weather, map stamp and date/time to your photo</p>
                </div>

                <!-- GPS & Camera Permission / Live Detect Quick Bar -->
                <div style="background: rgba(192, 132, 252, 0.12); border: 1px solid rgba(192, 132, 252, 0.35); border-radius: 12px; padding: 10px 14px; margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #e9d5ff;">
                        <i class="fa-solid fa-location-crosshairs" style="color: #c084fc;"></i>
                        <span id="gpsPermissionStatusText">GPS &amp; Camera: Auto-Detect Ready</span>
                    </div>
                    <button type="button" onclick="window.requestGpsAndCameraPermissions(true);" style="padding: 6px 12px; background: rgba(192, 132, 252, 0.25); border: 1px solid #c084fc; color: #fff; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-satellite"></i> Fetch Real GPS
                    </button>
                </div>

                <!-- 1. Photo Selection: Camera or Gallery -->
                <div class="gps-form-group">
                    <label class="gps-label">Chobi Upload Korun (Upload Image):</label>
                    <input type="file" id="imageLoader" accept="image/*" style="display: none;" onchange="window.handleGpsImagePicked(event);">
                    <input type="file" id="frontCameraLoader" accept="image/*" capture="user" style="display: none;" onchange="window.handleGpsCameraCaptured(event);">
                    <input type="file" id="backCameraLoader" accept="image/*" capture="environment" style="display: none;" onchange="window.handleGpsCameraCaptured(event);">
                    
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button type="button" onclick="window.openGpsCameraChoiceModal();" style="flex: 1; min-width: 140px; padding: 12px 16px; background: rgba(192, 132, 252, 0.2); border: 1.5px solid #c084fc; color: #fff; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(192, 132, 252, 0.3);">
                            <i class="fa-solid fa-camera"></i> Take Camera
                        </button>
                        <button type="button" onclick="window.handleChooseFromGallery();" style="flex: 1; min-width: 140px; padding: 12px 16px; background: rgba(255, 255, 255, 0.08); border: 1.5px solid rgba(255, 255, 255, 0.22); color: #fff; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            <i class="fa-solid fa-image"></i> Choose from Gallery
                        </button>
                    </div>
                    <div id="gpsSelectedFileName" style="font-size: 12px; color: #94a3b8; margin-top: 6px; font-weight: 600;">
                        No image selected yet
                    </div>
                </div>

                <!-- 2. Address Input with Auto-Suggestions & Voice Mic -->
                <div class="gps-form-group">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                        <label for="addressInput" class="gps-label" style="margin-bottom: 0;">Thikana (Address):</label>
                        <span id="gpsMicStatus" style="font-size: 11.5px; color: #c084fc; font-weight: 600; display: none; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-microphone-lines fa-fade" style="color: #ef4444;"></i> Listening... Speak in English
                        </span>
                    </div>
                    <div style="position: relative; display: flex; gap: 8px; align-items: center;">
                        <input type="text" id="addressInput" class="gps-input-text" placeholder="Enter Your Address & Pin Code or speak via Mic" value="" autocomplete="off" style="flex: 1;">
                        <button type="button" id="gpsAddressMicBtn" onclick="window.startGpsAddressVoiceInput();" style="width: 48px; height: 46px; border-radius: 10px; background: rgba(192, 132, 252, 0.2); border: 1.5px solid #c084fc; color: #c084fc; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; transition: all 0.2s;" title="Speak Address in English">
                            <i class="fa-solid fa-microphone" id="gpsAddressMicIcon"></i>
                        </button>
                        <div id="addressSuggestions"></div>
                    </div>
                </div>

                <!-- 3. Lat & Lon Coordinates -->
                <div class="gps-form-group">
                    <label for="latLonInput" class="gps-label">Lat &amp; Lon:</label>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="latLonInput" class="gps-input-text" value="Lat: 22.59746  Lon: 88.31042">
                        <button type="button" onclick="window.requestGpsAndCameraPermissions(true);" style="padding: 10px 14px; background: rgba(192, 132, 252, 0.2); border: 1.5px solid #c084fc; color: #c084fc; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 700; shrink: 0;" title="Get Live Device GPS">
                            <i class="fa-solid fa-location-dot"></i> Live
                        </button>
                    </div>
                </div>

                <!-- 4. Weather Input -->
                <div class="gps-form-group">
                    <label for="weatherInput" class="gps-label">Abahawa (Weather):</label>
                    <input type="text" id="weatherInput" class="gps-input-text" value="Weather: 35.2°C, Wind 17.3km/h">
                </div>

                <!-- 5. Date & Time Input -->
                <div class="gps-form-group">
                    <label for="dateTimeInput" class="gps-label">Tarikh o Somoy (Date &amp; Time):</label>
                    <input type="text" id="dateTimeInput" class="gps-input-text" value="">
                </div>

                <!-- Submit Button -->
                <button id="generateBtn" class="gps-btn-primary" onclick="window.generateGpsPhoto()">
                    <i class="fa-solid fa-check"></i> Ok
                </button>

                <!-- Preview & Download Section -->
                <div id="previewContainer" style="display: none; margin-top: 24px; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px;">
                    <h3 style="font-size: 18px; font-weight: 800; color: #ffffff; margin: 0 0 14px 0;">Preview:</h3>
                    <div style="display: inline-block; max-width: 100%; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.7); border: 1.5px solid rgba(192, 132, 252, 0.4);">
                        <img id="outputImage" alt="GPS Tagged Output" style="max-width: 100%; height: auto; display: block;">
                    </div>
                    <canvas id="imageCanvas" style="display: none;"></canvas>
                    <button id="downloadBtn" class="gps-btn-download" onclick="window.downloadGpsImage()">
                        <i class="fa-solid fa-download"></i> Download Image
                    </button>
                    <span style="font-size: 12px; color: #94a3b8; margin-top: 8px; display: block;">
                        * Jodi download button kaj na kore, tobe uporer chobitir upor tepay (long-press) kore "Save Image" korun।
                    </span>
                </div>

            </div>
        </div>

        <!-- Camera Choice Popup Modal (Front Camera or Back Camera) -->
        <div id="gpsCameraChoiceModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.78); backdrop-filter: blur(4px); z-index: 100000; align-items: center; justify-content: center; padding: 16px;">
            <div style="background: linear-gradient(145deg, #1f1435 0%, #110920 100%); border: 2px solid #c084fc; border-radius: 22px; max-width: 380px; width: 100%; padding: 26px 20px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.85); position: relative;">
                <button type="button" onclick="window.closeGpsCameraChoiceModal();" style="position: absolute; right: 14px; top: 14px; background: rgba(255,255,255,0.1); border: none; color: #cbd5e1; width: 34px; height: 34px; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                
                <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(192, 132, 252, 0.2); border: 1.5px solid #c084fc; font-size: 26px; color: #c084fc; margin: 0 auto 14px auto; display: flex; align-items: center; justify-content: center;">
                    <i class="fa-solid fa-camera"></i>
                </div>
                
                <h3 style="font-size: 20px; font-weight: 800; color: #fff; margin: 0 0 6px 0;">Select Camera</h3>
                <p style="font-size: 13px; color: #cbd5e1; margin: 0 0 20px 0;">Apni kon camera diye chobi tulte chan?</p>
                
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <!-- Front Camera Option -->
                    <button type="button" onclick="window.selectCameraMode('user');" style="width: 100%; padding: 15px 18px; background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); border: none; border-radius: 14px; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 16px rgba(168, 85, 247, 0.45); transition: transform 0.15s;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 18px;">
                                <i class="fa-solid fa-user"></i>
                            </div>
                            <div style="text-align: left;">
                                <div style="font-size: 15px; font-weight: 800; color: #ffffff;">Front Camera</div>
                                <div style="font-size: 11.5px; opacity: 0.85;">Selfie Camera</div>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-right" style="font-size: 14px; opacity: 0.8;"></i>
                    </button>

                    <!-- Back Camera Option -->
                    <button type="button" onclick="window.selectCameraMode('environment');" style="width: 100%; padding: 15px 18px; background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%); border: none; border-radius: 14px; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 16px rgba(14, 165, 233, 0.45); transition: transform 0.15s;">
                        <div style="display: flex; align-items: center; gap: 14px;">
                            <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 18px;">
                                <i class="fa-solid fa-camera-rotate"></i>
                            </div>
                            <div style="text-align: left;">
                                <div style="font-size: 15px; font-weight: 800; color: #ffffff;">Back Camera</div>
                                <div style="font-size: 11.5px; opacity: 0.85;">Rear Camera</div>
                            </div>
                        </div>
                        <i class="fa-solid fa-chevron-right" style="font-size: 14px; opacity: 0.8;"></i>
                    </button>
                </div>

                <button type="button" onclick="window.closeGpsCameraChoiceModal();" style="width: 100%; margin-top: 14px; padding: 11px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 12px; color: #cbd5e1; font-size: 13.5px; font-weight: 600; cursor: pointer;">
                    Cancel
                </button>
            </div>
        </div>

        <!-- Live Camera Viewfinder Overlay -->
        <div id="gpsCameraViewfinderModal" style="display: none; position: fixed; inset: 0; background: #000; z-index: 100001; flex-direction: column; justify-content: space-between; align-items: center;">
            <!-- Top Controls -->
            <div style="width: 100%; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; background: linear-gradient(to bottom, rgba(0,0,0,0.85), transparent); z-index: 2;">
                <span id="gpsCameraLensBadge" style="font-size: 13px; font-weight: 700; color: #fff; background: rgba(192, 132, 252, 0.3); border: 1px solid #c084fc; padding: 6px 14px; border-radius: 20px; display: inline-flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-camera"></i> Camera Active
                </span>
                <div style="display: flex; gap: 10px;">
                    <button type="button" onclick="window.toggleGpsCameraFacing();" style="width: 42px; height: 42px; border-radius: 50%; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.4); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 17px;" title="Switch Camera">
                        <i class="fa-solid fa-camera-rotate"></i>
                    </button>
                    <button type="button" onclick="window.closeGpsCameraViewfinder();" style="width: 42px; height: 42px; border-radius: 50%; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.4); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px;" title="Close Camera">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>

            <!-- Video Live Feed -->
            <div style="flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background: #000;">
                <video id="gpsLiveVideo" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
            </div>

            <!-- Bottom Shutter & Controls -->
            <div style="width: 100%; padding: 20px 20px 36px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); z-index: 2;">
                <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
                    <!-- Big Circular Shutter Button -->
                    <button type="button" onclick="window.snapGpsLivePhoto();" style="width: 76px; height: 76px; border-radius: 50%; background: #ffffff; border: 5px solid rgba(192, 132, 252, 0.85); cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 24px rgba(255,255,255,0.6); transition: transform 0.1s;" title="Snap Photo">
                        <div style="width: 58px; height: 58px; border-radius: 50%; background: #c084fc;"></div>
                    </button>
                </div>
                <button type="button" onclick="window.openDeviceNativeCameraFallback();" style="background: none; border: none; color: #cbd5e1; font-size: 12.5px; text-decoration: underline; cursor: pointer;">
                    Or open device camera app
                </button>
            </div>
        </div>
    `;

    // Initialize Auto-Date/Time and Listeners
    initGpsPhotoCreator();
}

function initGpsPhotoCreator() {
    setGpsAutomaticDateTime();
    setupGpsAddressSuggestions();
    // Auto probe permissions and live GPS coordinates
    window.requestGpsAndCameraPermissions(false);
}

function setGpsAutomaticDateTime() {
    const now = new Date();
    const day = now.getDate();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();

    let suffix = "th";
    if (day === 1 || day === 21 || day === 31) suffix = "st";
    else if (day === 2 || day === 22) suffix = "nd";
    else if (day === 3 || day === 23) suffix = "rd";

    let hours = now.getHours();
    let minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;

    const formattedDateTime = `Date/Time: ${day}${suffix} ${monthName} ${year}, ${hours}:${minutes} ${ampm}`;
    const dateInput = document.getElementById('dateTimeInput');
    if (dateInput) {
        dateInput.value = formattedDateTime;
    }
}

function getSavedGpsAddresses() {
    try {
        const addresses = localStorage.getItem('savedAddresses');
        return addresses ? JSON.parse(addresses) : [];
    } catch {
        return [];
    }
}

function saveGpsAddress(newAddress) {
    if (!newAddress || !newAddress.trim()) return;
    try {
        let addresses = getSavedGpsAddresses();
        addresses = addresses.filter(item => item !== newAddress);
        addresses.unshift(newAddress);
        if (addresses.length > 10) addresses.pop();
        localStorage.setItem('savedAddresses', JSON.stringify(addresses));
    } catch {}
}

function setupGpsAddressSuggestions() {
    const addressInput = document.getElementById('addressInput');
    const addressSuggestions = document.getElementById('addressSuggestions');
    if (!addressInput || !addressSuggestions) return;

    function showSuggestions(filter = '') {
        let addresses = getSavedGpsAddresses();
        if (filter.trim() !== '') {
            addresses = addresses.filter(item => item.toLowerCase().includes(filter.toLowerCase()));
        }

        if (addresses.length === 0) {
            addressSuggestions.style.display = 'none';
            return;
        }

        addressSuggestions.innerHTML = '';
        addresses.forEach(addr => {
            const div = document.createElement('div');
            div.className = 'gps-suggestion-item';
            div.textContent = addr;

            div.addEventListener('mousedown', function(e) {
                e.preventDefault();
                addressInput.value = addr;
                addressSuggestions.style.display = 'none';
            });
            div.addEventListener('touchstart', function(e) {
                e.preventDefault();
                addressInput.value = addr;
                addressSuggestions.style.display = 'none';
            });

            addressSuggestions.appendChild(div);
        });
        addressSuggestions.style.display = 'block';
    }

    addressInput.addEventListener('input', function() {
        showSuggestions(this.value);
    });
    addressInput.addEventListener('focus', function() {
        showSuggestions(this.value);
    });
    addressInput.addEventListener('click', function() {
        showSuggestions(this.value);
    });

    document.addEventListener('click', function(e) {
        if (addressInput && addressSuggestions && !addressInput.contains(e.target) && !addressSuggestions.contains(e.target)) {
            addressSuggestions.style.display = 'none';
        }
    });
}

// GPS Camera & Speech Recognition Global State
let currentGpsCameraFacing = 'environment';
let gpsCameraStream = null;
let gpsSpeechRecognition = null;
let isGpsListening = false;
window._gpsGalleryModeActive = false;

window.openGpsCameraChoiceModal = function() {
    const modal = document.getElementById('gpsCameraChoiceModal');
    if (modal) {
        modal.style.display = 'flex';
    }
};

window.closeGpsCameraChoiceModal = function() {
    const modal = document.getElementById('gpsCameraChoiceModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.selectCameraMode = function(facingMode, useLiveViewfinder = false) {
    window.closeGpsCameraChoiceModal();
    window._gpsGalleryModeActive = false;
    currentGpsCameraFacing = facingMode || 'environment';

    // 1. Android APK native bridge
    if (window.Android) {
        if (typeof window.Android.setCameraFacing === 'function') {
            try { window.Android.setCameraFacing(currentGpsCameraFacing); } catch(e) {}
        }
        if (typeof window.Android.openNativeCamera === 'function') {
            try {
                window.Android.openNativeCamera(currentGpsCameraFacing);
                return;
            } catch (err) {
                console.warn('Native camera launch failed, falling back:', err);
            }
        }
        if (typeof window.Android.requestCameraAndLocationPermissions === 'function') {
            try { window.Android.requestCameraAndLocationPermissions(); } catch(err) {}
        }
    }

    // 2. Mobile web/PWA or mobile browser: Trigger native camera input SYNCHRONOUSLY!
    // Calling click() synchronously within the user's touch event keeps UserActivation active.
    // This forces Android Chrome and mobile browsers to open the CAMERA app directly, NEVER the gallery.
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    if (!useLiveViewfinder && isMobileDevice) {
        window.triggerNativeCameraInputSynchronous(currentGpsCameraFacing);
        return;
    }

    // 3. For desktop or when explicitly requesting live in-app viewfinder:
    window.startGpsLiveCameraStream(currentGpsCameraFacing).then(started => {
        if (!started) {
            // Fallback directly to native camera input
            window.triggerNativeCameraInputSynchronous(currentGpsCameraFacing);
        }
    });
};

window.startGpsLiveCameraStream = async function(facingMode = currentGpsCameraFacing) {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        return false;
    }

    window.stopGpsLiveCameraStream();

    try {
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: facingMode },
                    width: { ideal: 1920, min: 480 },
                    height: { ideal: 1080, min: 360 }
                },
                audio: false
            });
        } catch (constraintErr) {
            stream = await navigator.mediaDevices.getUserMedia({
                video: facingMode ? { facingMode: { ideal: facingMode } } : true,
                audio: false
            });
        }

        gpsCameraStream = stream;
        currentGpsCameraFacing = facingMode;

        const videoElem = document.getElementById('gpsLiveVideo');
        const modal = document.getElementById('gpsCameraViewfinderModal');
        const badge = document.getElementById('gpsCameraLensBadge');

        if (videoElem && modal) {
            videoElem.srcObject = stream;
            await videoElem.play().catch(() => {});
            if (badge) {
                badge.innerHTML = facingMode === 'user' 
                    ? '<i class="fa-solid fa-user"></i> Front Camera Active' 
                    : '<i class="fa-solid fa-camera-rotate"></i> Back Camera Active';
            }
            modal.style.display = 'flex';
            return true;
        }
        return false;
    } catch (err) {
        console.warn('getUserMedia failed or rejected, falling back to camera input:', err);
        return false;
    }
};

window.stopGpsLiveCameraStream = function() {
    if (gpsCameraStream) {
        try {
            gpsCameraStream.getTracks().forEach(track => track.stop());
        } catch(e) {}
        gpsCameraStream = null;
    }
    const videoElem = document.getElementById('gpsLiveVideo');
    if (videoElem) {
        videoElem.srcObject = null;
    }
};

window.closeGpsCameraViewfinder = function() {
    window.stopGpsLiveCameraStream();
    const modal = document.getElementById('gpsCameraViewfinderModal');
    if (modal) modal.style.display = 'none';
};

window.toggleGpsCameraFacing = function() {
    const newFacing = currentGpsCameraFacing === 'user' ? 'environment' : 'user';
    window.startGpsLiveCameraStream(newFacing);
};

window.triggerNativeCameraInputSynchronous = function(facingMode = currentGpsCameraFacing) {
    currentGpsCameraFacing = facingMode || 'environment';
    window._gpsGalleryModeActive = false;

    if (window.Android && typeof window.Android.setCameraFacing === 'function') {
        try { window.Android.setCameraFacing(currentGpsCameraFacing); } catch(e) {}
    }
    if (window.Android && typeof window.Android.openNativeCamera === 'function') {
        try {
            window.Android.openNativeCamera(currentGpsCameraFacing);
            return;
        } catch (err) {}
    }

    const inputId = currentGpsCameraFacing === 'user' ? 'frontCameraLoader' : 'backCameraLoader';
    let cameraInput = document.getElementById(inputId);
    if (!cameraInput) {
        cameraInput = document.getElementById('backCameraLoader') || document.getElementById('generalCameraLoader');
    }
    if (cameraInput) {
        cameraInput.value = '';
        cameraInput.click();
    }
};

window.openDeviceNativeCameraFallback = function(facing = currentGpsCameraFacing) {
    window.closeGpsCameraViewfinder();
    window.triggerNativeCameraInputSynchronous(facing);
};

window.handleGpsNativeCameraPhotoCaptured = function(dataUrl, facing) {
    if (!dataUrl) return;
    if (facing) currentGpsCameraFacing = facing;
    window._gpsGalleryModeActive = false;

    const badge = document.getElementById('gpsSelectedFileName');
    if (badge) {
        badge.innerHTML = `<i class="fa-solid fa-camera" style="color: #c084fc;"></i> Captured: <strong>${currentGpsCameraFacing === 'user' ? 'Front Camera' : 'Back Camera'} Photo</strong>`;
        badge.style.color = '#e2e8f0';
    }

    gpsUploadedImage = new Image();
    gpsUploadedImage.crossOrigin = 'anonymous';
    gpsUploadedImage.onload = () => {
        // Auto stamp and show in Preview
        window.generateGpsPhoto();
        if (typeof window.showDownloadToast === 'function') {
            window.showDownloadToast('Camera photo loaded! Preview generated below.', 'success');
        }
    };
    gpsUploadedImage.src = dataUrl;
};

window.snapGpsLivePhoto = function() {
    const videoElem = document.getElementById('gpsLiveVideo');
    if (!videoElem) return;

    const vWidth = videoElem.videoWidth || 1280;
    const vHeight = videoElem.videoHeight || 720;

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = vWidth;
    snapCanvas.height = vHeight;
    const snapCtx = snapCanvas.getContext('2d');

    if (currentGpsCameraFacing === 'user') {
        snapCtx.translate(vWidth, 0);
        snapCtx.scale(-1, 1);
    }
    snapCtx.drawImage(videoElem, 0, 0, vWidth, vHeight);

    const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.95);
    window.closeGpsCameraViewfinder();

    const badge = document.getElementById('gpsSelectedFileName');
    if (badge) {
        badge.innerHTML = `<i class="fa-solid fa-camera" style="color: #c084fc;"></i> Captured: <strong>${currentGpsCameraFacing === 'user' ? 'Front Camera' : 'Back Camera'} Photo</strong>`;
        badge.style.color = '#e2e8f0';
    }

    gpsUploadedImage = new Image();
    gpsUploadedImage.crossOrigin = 'anonymous';
    gpsUploadedImage.onload = () => {
        // Auto stamp and show in Preview
        window.generateGpsPhoto();
        if (typeof window.showDownloadToast === 'function') {
            window.showDownloadToast('Photo captured! Preview generated below.', 'success');
        }
    };
    gpsUploadedImage.src = dataUrl;
};

window.handleGpsCameraCaptured = function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const badge = document.getElementById('gpsSelectedFileName');
    if (badge) {
        badge.innerHTML = `<i class="fa-solid fa-camera" style="color: #c084fc;"></i> Captured: <strong>${currentGpsCameraFacing === 'user' ? 'Front Camera' : 'Back Camera'} Photo</strong> (${Math.round(file.size / 1024)} KB)`;
        badge.style.color = '#e2e8f0';
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        gpsUploadedImage = new Image();
        gpsUploadedImage.crossOrigin = 'anonymous';
        gpsUploadedImage.onload = () => {
            // Auto stamp and show in Preview
            window.generateGpsPhoto();
            if (typeof window.showDownloadToast === 'function') {
                window.showDownloadToast('Camera photo loaded! Preview generated below.', 'success');
            }
        };
        gpsUploadedImage.src = evt.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
};

window.handleChooseFromGallery = function() {
    window._gpsGalleryModeActive = true;
    currentGpsCameraFacing = "";
    if (window.Android && typeof window.Android.setCameraFacing === 'function') {
        try { window.Android.setCameraFacing(""); } catch(e) {}
    }
    const addressInput = document.getElementById('addressInput');
    if (addressInput) {
        addressInput.value = ''; // Address bar ta faka thakbe
    }
    const galleryLoader = document.getElementById('imageLoader');
    if (galleryLoader) {
        galleryLoader.value = '';
        galleryLoader.click();
    }
};

window.handleGpsImagePicked = function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const badge = document.getElementById('gpsSelectedFileName');
    if (badge) {
        badge.innerHTML = `<i class="fa-solid fa-check" style="color: #22c55e;"></i> Gallery: <strong>${file.name}</strong> (${Math.round(file.size / 1024)} KB)`;
        badge.style.color = '#e2e8f0';
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        gpsUploadedImage = new Image();
        gpsUploadedImage.crossOrigin = "anonymous";
        gpsUploadedImage.onload = () => {
            if (typeof window.showDownloadToast === 'function') {
                window.showDownloadToast('Gallery image loaded. Enter or speak your address with the mic!', 'success');
            }
        };
        gpsUploadedImage.src = evt.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
};

window.stopGpsSpeechRecognition = function() {
    if (gpsSpeechRecognition) {
        try { gpsSpeechRecognition.stop(); } catch(e) {}
    }
    isGpsListening = false;
    const micBtn = document.getElementById('gpsAddressMicBtn');
    const micIcon = document.getElementById('gpsAddressMicIcon');
    const micStatus = document.getElementById('gpsMicStatus');
    if (micBtn) {
        micBtn.style.background = 'rgba(192, 132, 252, 0.2)';
        micBtn.style.borderColor = '#c084fc';
        micBtn.style.color = '#c084fc';
        micBtn.style.boxShadow = 'none';
    }
    if (micIcon) {
        micIcon.className = 'fa-solid fa-microphone';
    }
    if (micStatus) {
        micStatus.style.display = 'none';
    }
};

window.startGpsAddressVoiceInput = function() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('gpsAddressMicBtn');
    const micIcon = document.getElementById('gpsAddressMicIcon');
    const micStatus = document.getElementById('gpsMicStatus');
    const addressInput = document.getElementById('addressInput');

    if (!SpeechRecognition) {
        if (typeof window.showDownloadToast === 'function') {
            window.showDownloadToast('Voice input is not supported in this browser. Please type address.', 'error');
        } else {
            alert('Voice input is not supported in this browser. Please type address.');
        }
        return;
    }

    if (isGpsListening) {
        window.stopGpsSpeechRecognition();
        return;
    }

    try {
        gpsSpeechRecognition = new SpeechRecognition();
        gpsSpeechRecognition.continuous = false;
        gpsSpeechRecognition.interimResults = true;
        gpsSpeechRecognition.lang = 'en-US'; // English words as requested

        gpsSpeechRecognition.onstart = function() {
            isGpsListening = true;
            if (micBtn) {
                micBtn.style.background = 'rgba(239, 68, 68, 0.3)';
                micBtn.style.borderColor = '#ef4444';
                micBtn.style.color = '#ef4444';
                micBtn.style.boxShadow = '0 0 16px rgba(239, 68, 68, 0.6)';
            }
            if (micIcon) {
                micIcon.className = 'fa-solid fa-microphone-lines fa-beat';
            }
            if (micStatus) {
                micStatus.style.display = 'inline-flex';
                micStatus.innerHTML = '<i class="fa-solid fa-microphone-lines fa-fade" style="color: #ef4444; margin-right: 4px;"></i> Listening... Speak address in English';
            }
            if (typeof window.showDownloadToast === 'function') {
                window.showDownloadToast('Listening... Speak your address in English now.', 'info');
            }
        };

        gpsSpeechRecognition.onresult = function(event) {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript;
            }
            if (transcript && addressInput) {
                addressInput.value = transcript.trim();
            }
        };

        gpsSpeechRecognition.onerror = function(event) {
            console.warn('Speech recognition error:', event.error);
            window.stopGpsSpeechRecognition();
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                if (typeof window.showDownloadToast === 'function') {
                    window.showDownloadToast('Voice error: ' + event.error, 'error');
                }
            }
        };

        gpsSpeechRecognition.onend = function() {
            window.stopGpsSpeechRecognition();
            if (addressInput && addressInput.value.trim()) {
                if (typeof window.showDownloadToast === 'function') {
                    window.showDownloadToast('Address set: ' + addressInput.value, 'success');
                }
            }
        };

        gpsSpeechRecognition.start();
    } catch(err) {
        console.error('Failed to start speech recognition:', err);
        window.stopGpsSpeechRecognition();
        alert('Could not start microphone. Please check permissions.');
    }
};

window.stopGpsCamera = function() {
    window.stopGpsLiveCameraStream();
    window.stopGpsSpeechRecognition();
};

window.requestGpsAndCameraPermissions = function(forcePrompt = true) {
    const statusText = document.getElementById('gpsPermissionStatusText');
    if (statusText && forcePrompt) {
        statusText.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color: #c084fc;"></i> Detecting GPS location...';
    }

    // 1. Android APK Native Permissions Request
    if (window.Android && typeof window.Android.requestCameraAndLocationPermissions === 'function') {
        try { window.Android.requestCameraAndLocationPermissions(); } catch(e) {}
    }

    // 2. Browser Geolocation API
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude.toFixed(5);
                const lon = pos.coords.longitude.toFixed(5);
                const latLonInput = document.getElementById('latLonInput');
                if (latLonInput) {
                    latLonInput.value = `Lat: ${lat}  Lon: ${lon}`;
                }
                if (statusText) {
                    statusText.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#22c55e;"></i> GPS Active: ${lat}, ${lon}`;
                }
                if (forcePrompt && typeof window.showDownloadToast === 'function') {
                    window.showDownloadToast(`GPS Location set: ${lat}, ${lon}`, 'success');
                }

                // Auto-fetch current weather for these coordinates
                fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
                    .then(res => res.json())
                    .then(wData => {
                        if (wData && wData.current_weather) {
                            const temp = wData.current_weather.temperature;
                            const wind = wData.current_weather.windspeed;
                            const weatherInput = document.getElementById('weatherInput');
                            if (weatherInput) {
                                weatherInput.value = `Weather: ${temp}°C, Wind ${wind}km/h`;
                            }
                        }
                    })
                    .catch(() => {});

                // Auto reverse geocode address if addressInput is empty and NOT in gallery mode
                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
                    .then(res => res.json())
                    .then(geo => {
                        const addrInput = document.getElementById('addressInput');
                        if (addrInput && !addrInput.value && !window._gpsGalleryModeActive && geo && geo.display_name) {
                            addrInput.value = geo.display_name;
                        }
                    })
                    .catch(() => {});
            },
            (err) => {
                console.warn('Geolocation warning/denied:', err);
                if (statusText) {
                    statusText.innerHTML = '<i class="fa-solid fa-location-dot" style="color:#f59e0b;"></i> Using Default GPS (Tap to Grant)';
                }
                if (forcePrompt) {
                    alert('Please allow Location & Camera permission in your device/browser settings.');
                }
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    }

    // 3. Probe Camera access if available
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                stream.getTracks().forEach(t => t.stop());
            })
            .catch(() => {});
    }
};

function drawRoundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = context.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            context.fillText(line, x, currentY);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    context.fillText(line, x, currentY);
    return currentY;
}

window.generateGpsPhoto = function() {
    if (!gpsUploadedImage.src) {
        alert('Doya kore age ekta chobi select korun!');
        return;
    }

    const addressInput = document.getElementById('addressInput');
    const currentAddress = addressInput ? addressInput.value : '';
    if (currentAddress) {
        saveGpsAddress(currentAddress);
    }

    const canvas = document.getElementById('imageCanvas');
    const outputImage = document.getElementById('outputImage');
    const previewContainer = document.getElementById('previewContainer');
    if (!canvas || !outputImage || !previewContainer) return;

    const ctx = canvas.getContext('2d');
    const imgWidth = gpsUploadedImage.naturalWidth || gpsUploadedImage.width || 800;
    const imgHeight = gpsUploadedImage.naturalHeight || gpsUploadedImage.height || 600;

    canvas.width = imgWidth;
    canvas.height = imgHeight;

    ctx.drawImage(gpsUploadedImage, 0, 0, imgWidth, imgHeight);

    const scaleFactor = Math.max(imgWidth / 480, 0.6);
    let overlayHeight = 110 * scaleFactor;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, canvas.height - overlayHeight, canvas.width, overlayHeight);

    const mapSize = 80 * scaleFactor;
    const mapX = 15 * scaleFactor;
    const mapY = canvas.height - overlayHeight + (overlayHeight - mapSize) / 2;

    ctx.save();
    drawRoundedRect(ctx, mapX, mapY, mapSize, mapSize, 15 * scaleFactor);
    ctx.clip();
    try {
        if (gpsStaticMap && gpsStaticMap.complete && gpsStaticMap.naturalWidth > 0) {
            ctx.drawImage(gpsStaticMap, mapX, mapY, mapSize, mapSize);
        } else {
            // High-contrast fallback map grid stamp if offline
            ctx.fillStyle = "#1e293b";
            ctx.fillRect(mapX, mapY, mapSize, mapSize);
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.arc(mapX + mapSize / 2, mapY + mapSize / 2 - 4, mapSize / 5, 0, Math.PI * 2);
            ctx.fill();
        }
    } catch (e) {
        console.error("Map load failed:", e);
    }
    ctx.restore();

    const fontSize = Math.round(14 * scaleFactor);
    ctx.font = `normal ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";

    const addressText = "📍 Address: " + (currentAddress || "Location");
    const latLonText = (document.getElementById('latLonInput') || {}).value || "Lat: 22.59746 Lon: 88.31042";
    const weatherText = (document.getElementById('weatherInput') || {}).value || "Weather: 35.2°C, Wind 17.3km/h";
    const dateTimeText = (document.getElementById('dateTimeInput') || {}).value || "";

    const textPaddingLeft = mapX + mapSize + (15 * scaleFactor);
    const maxWidth = canvas.width - textPaddingLeft - (15 * scaleFactor);
    const lineSpacing = 16 * scaleFactor;

    let startY = canvas.height - overlayHeight + (30 * scaleFactor);
    let nextY = drawWrappedText(ctx, addressText, textPaddingLeft, startY, maxWidth, lineSpacing);

    ctx.fillText(latLonText, textPaddingLeft, nextY + lineSpacing);
    ctx.fillText(weatherText, textPaddingLeft, nextY + (lineSpacing * 2));
    ctx.fillText(dateTimeText, textPaddingLeft, nextY + (lineSpacing * 3));

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    window._lastGpsImageDataUrl = dataUrl;
    outputImage.src = dataUrl;
    previewContainer.style.display = 'block';

    // Smooth scroll to preview
    outputImage.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.downloadGpsImage = function() {
    const dataUrl = window._lastGpsImageDataUrl;
    if (!dataUrl) {
        if (typeof window.showDownloadToast === 'function') {
            window.showDownloadToast('Doya kore age chobi generate korun!', 'error');
        } else {
            alert('Doya kore age chobi generate korun!');
        }
        return;
    }

    const fileName = 'gps-image_' + Date.now() + '.jpg';

    // 1. Google Chrome Download Manager Integration
    if (typeof window.downloadFileToDevice === 'function') {
        window.downloadFileToDevice(dataUrl, fileName, 'image/jpeg');
    } else {
        // Direct anchor fallback
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            try { document.body.removeChild(link); } catch (e) {}
        }, 500);
    }
};

// ==========================================
// GOOGLE CHROME-STYLE DOWNLOAD ENGINE & MANAGER
// ==========================================
(function() {
    function injectChromeDownloadStyles() {
        if (document.getElementById('chrome-download-manager-styles')) return;
        const style = document.createElement('style');
        style.id = 'chrome-download-manager-styles';
        style.textContent = `
            @keyframes chromeBarSlideUp {
                from { transform: translateY(110%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            @keyframes chromePulseRing {
                0% { transform: scale(0.95); opacity: 0.8; }
                50% { transform: scale(1.05); opacity: 1; }
                100% { transform: scale(0.95); opacity: 0.8; }
            }
            @keyframes chromeProgressShimmer {
                0% { background-position: -200px 0; }
                100% { background-position: calc(200px + 100%) 0; }
            }
            .chrome-dl-shimmer {
                background: linear-gradient(90deg, #1a73e8 0%, #4285f4 40%, #8ab4f8 50%, #4285f4 60%, #1a73e8 100%);
                background-size: 200px 100%;
                animation: chromeProgressShimmer 1.4s infinite linear;
            }
            .chrome-dl-bar-container {
                position: fixed;
                bottom: 12px;
                left: 12px;
                right: 12px;
                max-width: 520px;
                margin: 0 auto;
                z-index: 9999999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                animation: chromeBarSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1);
                pointer-events: auto;
            }
            @media (min-width: 640px) {
                .chrome-dl-bar-container {
                    left: auto;
                    right: 20px;
                    bottom: 20px;
                    width: 440px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    injectChromeDownloadStyles();

    function formatChromeBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getChromeFileIcon(fileName, mimeType) {
        const name = (fileName || '').toLowerCase();
        const mime = (mimeType || '').toLowerCase();
        if (name.includes('gps') || name.includes('camera')) {
            return { icon: 'fa-camera', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.18)' };
        }
        if (name.includes('qr') || name.includes('qrcode')) {
            return { icon: 'fa-qrcode', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.18)' };
        }
        if (name.endsWith('.gif') || mime.includes('gif')) {
            return { icon: 'fa-photo-film', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.18)' };
        }
        if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.aac') || mime.includes('audio')) {
            return { icon: 'fa-music', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.18)' };
        }
        if (name.endsWith('.pdf') || mime.includes('pdf')) {
            return { icon: 'fa-file-pdf', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.18)' };
        }
        if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp') || mime.includes('image')) {
            return { icon: 'fa-image', color: '#4ade80', bg: 'rgba(74, 222, 128, 0.18)' };
        }
        if (name.endsWith('.mp4') || name.endsWith('.mkv') || mime.includes('video')) {
            return { icon: 'fa-file-video', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.18)' };
        }
        return { icon: 'fa-file', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.18)' };
    }

    const ChromeDownloadManager = {
        activeDownloads: {},
        latestDownloadId: null,

        getHistory() {
            try {
                const raw = localStorage.getItem('vdosky_chrome_downloads_history');
                return raw ? JSON.parse(raw) : [];
            } catch (e) {
                return [];
            }
        },

        saveHistoryItem(item) {
            try {
                const list = this.getHistory();
                const filtered = list.filter(i => i.fileName !== item.fileName);
                filtered.unshift(item);
                if (filtered.length > 30) filtered.pop();
                localStorage.setItem('vdosky_chrome_downloads_history', JSON.stringify(filtered));
            } catch (e) {}
        },

        startDownload({ dataOrBlobOrUrl, fileName, mimeType, totalBytesExpected }) {
            injectChromeDownloadStyles();

            fileName = fileName || ('download_' + Date.now());
            mimeType = mimeType || 'application/octet-stream';

            // Ensure proper file extension
            if (!fileName.includes('.')) {
                if (mimeType.includes('gif')) fileName += '.gif';
                else if (mimeType.includes('png')) fileName += '.png';
                else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) fileName += '.jpg';
                else if (mimeType.includes('mp3') || mimeType.includes('audio')) fileName += '.mp3';
                else if (mimeType.includes('pdf')) fileName += '.pdf';
            }

            let initialTotalBytes = totalBytesExpected || 0;
            if (dataOrBlobOrUrl instanceof Blob) {
                initialTotalBytes = dataOrBlobOrUrl.size;
            } else if (typeof dataOrBlobOrUrl === 'string' && dataOrBlobOrUrl.startsWith('data:')) {
                const comma = dataOrBlobOrUrl.indexOf(',');
                const baseLen = comma !== -1 ? dataOrBlobOrUrl.length - (comma + 1) : dataOrBlobOrUrl.length;
                initialTotalBytes = Math.round(baseLen * 0.75);
            }

            const downloadId = 'cdl_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            this.latestDownloadId = downloadId;

            const dl = {
                id: downloadId,
                fileName: fileName,
                mimeType: mimeType,
                percent: 0,
                loadedBytes: 0,
                totalBytes: initialTotalBytes,
                status: 'downloading', // 'downloading' | 'completed' | 'error'
                startTime: Date.now(),
                speedText: 'Connecting...',
                rawSource: dataOrBlobOrUrl,
                blobObjectUrl: null,
                nativeUri: null,
                errorMsg: null
            };

            this.activeDownloads[downloadId] = dl;
            this.render();

            const isNativeAndroid = Boolean(window.Android && typeof window.Android.saveBase64File === 'function');

            // CASE 1: HTTP / HTTPS URL
            if (typeof dataOrBlobOrUrl === 'string' && (dataOrBlobOrUrl.startsWith('http://') || dataOrBlobOrUrl.startsWith('https://'))) {
                this.handleHttpUrlDownload(dl, dataOrBlobOrUrl, isNativeAndroid);
                return downloadId;
            }

            // CASE 2: Blob or Base64 Data URL on Native Android APK
            if (isNativeAndroid) {
                this.handleNativeAndroidSave(dl, dataOrBlobOrUrl);
                return downloadId;
            }

            // CASE 3: Standard Browser / Web Preview
            this.handleBrowserDownload(dl, dataOrBlobOrUrl);
            return downloadId;
        },

        handleNativeAndroidSave(dl, dataOrBlob) {
            dl.speedText = 'Writing to device...';
            this.render();

            if (dataOrBlob instanceof Blob) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const base64 = e.target.result;
                        window.Android.saveBase64File(base64, dl.fileName, dl.mimeType);
                    } catch (err) {
                        console.error('Native save call failed, fallback:', err);
                        this.handleBrowserDownload(dl, dataOrBlob);
                    }
                };
                reader.onerror = () => {
                    this.handleBrowserDownload(dl, dataOrBlob);
                };
                reader.readAsDataURL(dataOrBlob);
            } else if (typeof dataOrBlob === 'string') {
                try {
                    window.Android.saveBase64File(dataOrBlob, dl.fileName, dl.mimeType);
                } catch (err) {
                    console.error('Native save call failed, fallback:', err);
                    this.handleBrowserDownload(dl, dataOrBlob);
                }
            }
        },

        handleHttpUrlDownload(dl, url, isNativeAndroid) {
            dl.speedText = 'Fetching file...';
            this.render();

            if (isNativeAndroid && typeof window.Android.downloadUrl === 'function') {
                try {
                    window.Android.downloadUrl(url, dl.fileName);
                } catch (e) {}
            }

            // Stream fetch with real byte chunks to show Chrome progress in UI
            fetch(url, { mode: 'cors' })
                .then(response => {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    const contentLength = response.headers.get('content-length');
                    if (contentLength) {
                        dl.totalBytes = parseInt(contentLength, 10);
                    }

                    if (!response.body) {
                        return response.blob().then(blob => {
                            this.finishBlobDownload(dl, blob);
                        });
                    }

                    const reader = response.body.getReader();
                    const chunks = [];
                    let receivedBytes = 0;
                    const startTime = Date.now();

                    const readChunk = () => {
                        return reader.read().then(({ done, value }) => {
                            if (done) {
                                const allBlob = new Blob(chunks, { type: dl.mimeType });
                                this.finishBlobDownload(dl, allBlob);
                                return;
                            }
                            chunks.push(value);
                            receivedBytes += value.length;
                            dl.loadedBytes = receivedBytes;
                            if (dl.totalBytes > 0) {
                                dl.percent = Math.min(99, Math.round((receivedBytes * 100) / dl.totalBytes));
                            } else {
                                dl.percent = Math.min(95, Math.round(receivedBytes / (500 * 1024)));
                            }
                            const elapsedSec = (Date.now() - startTime) / 1000;
                            if (elapsedSec > 0.3) {
                                const speed = receivedBytes / elapsedSec;
                                dl.speedText = formatChromeBytes(speed) + '/s';
                            }
                            this.render();
                            return readChunk();
                        });
                    };
                    return readChunk();
                })
                .catch(err => {
                    console.warn('CORS or stream fetch failed, direct download link fallback:', err);
                    // Direct trigger
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = dl.fileName;
                    a.target = '_blank';
                    a.click();
                    this.completeDownload(dl.fileName, url, dl.mimeType, dl.totalBytes || 1024 * 1024);
                });
        },

        handleBrowserDownload(dl, dataOrBlob) {
            let blob = null;
            if (dataOrBlob instanceof Blob) {
                blob = dataOrBlob;
            } else if (typeof dataOrBlob === 'string' && dataOrBlob.startsWith('data:')) {
                try {
                    const byteString = atob(dataOrBlob.split(',')[1]);
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) {
                        ia[i] = byteString.charCodeAt(i);
                    }
                    blob = new Blob([ab], { type: dl.mimeType });
                } catch (e) {}
            }

            const total = dl.totalBytes || (blob ? blob.size : 100000);
            dl.totalBytes = total;

            // Smooth processing animation in browser (0% -> 35% -> 70% -> 100%)
            let currentPct = 10;
            const stepInterval = setInterval(() => {
                currentPct += Math.floor(Math.random() * 25) + 15;
                if (currentPct >= 100) {
                    currentPct = 100;
                    clearInterval(stepInterval);

                    if (blob) {
                        this.finishBlobDownload(dl, blob);
                    } else {
                        const a = document.createElement('a');
                        a.href = dataOrBlob;
                        a.download = dl.fileName;
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                            try { document.body.removeChild(a); } catch (e) {}
                        }, 1000);
                        this.completeDownload(dl.fileName, dataOrBlob, dl.mimeType, total);
                    }
                } else {
                    dl.percent = currentPct;
                    dl.loadedBytes = Math.round((currentPct / 100) * total);
                    dl.speedText = 'Processing...';
                    this.render();
                }
            }, 70);
        },

        finishBlobDownload(dl, blob) {
            try {
                const objectUrl = URL.createObjectURL(blob);
                dl.blobObjectUrl = objectUrl;

                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = dl.fileName;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    try { document.body.removeChild(a); } catch (e) {}
                }, 2000);

                this.completeDownload(dl.fileName, objectUrl, dl.mimeType, blob.size);
            } catch (err) {
                console.error('Blob save trigger failed:', err);
                this.errorDownload(dl.fileName, 'Failed to save file: ' + err.message);
            }
        },

        updateProgress(fileName, percent, loadedBytes, totalBytes) {
            let dl = null;
            for (const id in this.activeDownloads) {
                if (this.activeDownloads[id].fileName === fileName || !dl) {
                    dl = this.activeDownloads[id];
                }
            }
            if (!dl) return;

            dl.percent = Math.min(100, Math.max(0, percent));
            if (loadedBytes !== undefined) dl.loadedBytes = loadedBytes;
            if (totalBytes !== undefined && totalBytes > 0) dl.totalBytes = totalBytes;

            const elapsedSec = (Date.now() - dl.startTime) / 1000;
            if (elapsedSec > 0.2 && dl.loadedBytes > 0) {
                const speed = dl.loadedBytes / elapsedSec;
                dl.speedText = formatChromeBytes(speed) + '/s';
            } else {
                dl.speedText = 'Downloading...';
            }

            this.render();
        },

        completeDownload(fileName, openUriString, mimeType, totalBytes) {
            let dl = null;
            for (const id in this.activeDownloads) {
                if (this.activeDownloads[id].fileName === fileName || !dl) {
                    dl = this.activeDownloads[id];
                }
            }
            if (!dl) return;

            dl.status = 'completed';
            dl.percent = 100;
            if (totalBytes) dl.totalBytes = totalBytes;
            dl.loadedBytes = dl.totalBytes;
            dl.nativeUri = openUriString;
            dl.speedText = 'Completed';

            this.saveHistoryItem({
                id: dl.id,
                fileName: dl.fileName,
                mimeType: dl.mimeType,
                size: dl.totalBytes,
                nativeUri: openUriString,
                blobObjectUrl: dl.blobObjectUrl,
                timestamp: Date.now(),
                dateStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            this.render();

            // Auto dismiss notification after 12 seconds if not interacted with
            if (dl.dismissTimer) clearTimeout(dl.dismissTimer);
            dl.dismissTimer = setTimeout(() => {
                this.dismissDownload(dl.id);
            }, 14000);
        },

        errorDownload(fileName, errorMsg) {
            let dl = null;
            for (const id in this.activeDownloads) {
                if (this.activeDownloads[id].fileName === fileName || !dl) {
                    dl = this.activeDownloads[id];
                }
            }
            if (!dl) return;

            dl.status = 'error';
            dl.errorMsg = errorMsg || 'Download failed';
            this.render();
        },

        openFile(id) {
            const dl = this.activeDownloads[id] || this.getHistory().find(h => h.id === id);
            if (!dl) return;

            // 1. Android Native Open
            if (window.Android && typeof window.Android.openDownloadedFile === 'function' && dl.nativeUri) {
                try {
                    window.Android.openDownloadedFile(dl.nativeUri, dl.mimeType || '*/*');
                    return;
                } catch (e) {
                    console.warn('Native open failed:', e);
                }
            }

            // 2. Blob URL / Web Link
            const openUrl = dl.blobObjectUrl || dl.nativeUri || dl.rawSource;
            if (openUrl) {
                try {
                    window.open(openUrl, '_blank');
                    return;
                } catch (e) {}
            }

            alert('File downloaded to your device Downloads folder: ' + dl.fileName);
        },

        shareFile(id) {
            const dl = this.activeDownloads[id] || this.getHistory().find(h => h.id === id);
            if (!dl) return;

            // 1. Android Native Share
            if (window.Android && typeof window.Android.shareDownloadedFile === 'function' && dl.nativeUri) {
                try {
                    window.Android.shareDownloadedFile(dl.nativeUri, dl.mimeType || '*/*', dl.fileName);
                    return;
                } catch (e) {}
            }

            // 2. Web Share API (Attach actual file if supported)
            if (navigator.share) {
                try {
                    let fileObj = null;
                    if (dl.rawSource && typeof dl.rawSource === 'string' && dl.rawSource.startsWith('data:')) {
                        const parts = dl.rawSource.split(',');
                        const mime = (parts[0].match(/:(.*?);/) || [])[1] || dl.mimeType || 'image/png';
                        const bstr = atob(parts[1]);
                        const u8 = new Uint8Array(bstr.length);
                        for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
                        fileObj = new File([u8], dl.fileName, { type: mime });
                    }
                    if (fileObj && navigator.canShare && navigator.canShare({ files: [fileObj] })) {
                        navigator.share({
                            files: [fileObj],
                            title: dl.fileName,
                            text: 'QR Code: ' + dl.fileName
                        }).catch(() => {});
                        return;
                    }
                } catch (shareErr) {}

                const shareData = {
                    title: dl.fileName,
                    text: 'Downloaded file: ' + dl.fileName
                };
                if (dl.blobObjectUrl && dl.blobObjectUrl.startsWith('http')) {
                    shareData.url = dl.blobObjectUrl;
                }
                navigator.share(shareData).catch(() => {});
            }
        },

        dismissDownload(id) {
            delete this.activeDownloads[id];
            this.render();
        },

        render() {
            let container = document.getElementById('chromeDownloadManagerBar');
            const downloadIds = Object.keys(this.activeDownloads);

            if (downloadIds.length === 0) {
                if (container) container.remove();
                return;
            }

            if (!container) {
                container = document.createElement('div');
                container.id = 'chromeDownloadManagerBar';
                container.className = 'chrome-dl-bar-container';
                document.body.appendChild(container);
            }

            // Render all active download cards (most recent first)
            const cardsHtml = downloadIds.reverse().map(id => {
                const dl = this.activeDownloads[id];
                const fileInfo = getChromeFileIcon(dl.fileName, dl.mimeType);
                const isDone = dl.status === 'completed';
                const isError = dl.status === 'error';

                let progressSubtext = '';
                if (isDone) {
                    progressSubtext = `${formatChromeBytes(dl.totalBytes)} • Download complete`;
                } else if (isError) {
                    progressSubtext = dl.errorMsg || 'Download failed';
                } else {
                    const loadedStr = formatChromeBytes(dl.loadedBytes);
                    const totalStr = dl.totalBytes > 0 ? formatChromeBytes(dl.totalBytes) : 'calculating...';
                    progressSubtext = `${loadedStr} of ${totalStr} • ${dl.percent}% • ${dl.speedText}`;
                }

                return `
                    <div style="background: linear-gradient(145deg, #1f2329 0%, #16181d 100%); border: 1.5px solid ${isDone ? '#10b981' : (isError ? '#ef4444' : '#4285f4')}; border-radius: 16px; padding: 14px 16px; margin-bottom: 10px; box-shadow: 0 14px 38px rgba(0,0,0,0.8), 0 0 20px ${isDone ? 'rgba(16,185,129,0.25)' : 'rgba(66,133,244,0.25)'}; color: #ffffff; position: relative;">
                        
                        <!-- Top Header -->
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                ${isDone 
                                    ? `<div style="width: 22px; height: 22px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px;"><i class="fa-solid fa-check"></i></div>`
                                    : (isError 
                                        ? `<div style="width: 22px; height: 22px; border-radius: 50%; background: #ef4444; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px;"><i class="fa-solid fa-xmark"></i></div>`
                                        : `<div style="width: 22px; height: 22px; border-radius: 50%; background: #1a73e8; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; animation: chromePulseRing 1.2s infinite ease-in-out;"><i class="fa-solid fa-arrow-down"></i></div>`
                                    )
                                }
                                <span style="font-size: 13px; font-weight: 700; color: ${isDone ? '#34d399' : (isError ? '#f87171' : '#8ab4f8')}; letter-spacing: 0.2px;">
                                    ${isDone ? 'File Downloaded' : (isError ? 'Download Failed' : 'Downloading file...')}
                                </span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 10.5px; background: rgba(255,255,255,0.08); color: #cbd5e1; padding: 2px 7px; border-radius: 8px; font-weight: 600;">
                                    Chrome Engine
                                </span>
                                <button onclick="window.ChromeDownloadManager.dismissDownload('${id}');" style="background: none; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 2px 6px; line-height: 1;" title="Dismiss">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            </div>
                        </div>

                        <!-- File Details Row -->
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
                            <div style="width: 44px; height: 44px; border-radius: 12px; background: ${fileInfo.bg}; border: 1.5px solid ${fileInfo.color}; display: flex; align-items: center; justify-content: center; font-size: 22px; color: ${fileInfo.color}; shrink: 0;">
                                <i class="fa-solid ${fileInfo.icon}"></i>
                            </div>
                            <div style="min-width: 0; flex: 1;">
                                <div style="font-size: 14px; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${dl.fileName}">
                                    ${dl.fileName}
                                </div>
                                <div style="font-size: 12px; color: #94a3b8; margin-top: 2px; font-weight: 500;">
                                    ${progressSubtext}
                                </div>
                            </div>
                        </div>

                        <!-- Progress Bar (Always visible while downloading) -->
                        ${!isDone && !isError ? `
                            <div style="margin-bottom: 10px; background: rgba(255,255,255,0.1); border-radius: 6px; height: 7px; overflow: hidden; position: relative;">
                                <div class="chrome-dl-shimmer" style="width: ${dl.percent}%; height: 100%; border-radius: 6px; transition: width 0.15s ease-out;"></div>
                            </div>
                        ` : ''}

                        <!-- Action Buttons (Shown on completion or error) -->
                        ${isDone ? `
                            <div style="display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
                                <button onclick="window.ChromeDownloadManager.openFile('${id}');" style="flex: 1; min-width: 120px; padding: 10px 14px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border: none; border-radius: 10px; font-size: 13.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 7px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
                                    <i class="fa-solid fa-folder-open"></i> Open File
                                </button>
                                <button onclick="window.ChromeDownloadManager.shareFile('${id}');" style="padding: 10px 14px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.22); color: #fff; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                    <i class="fa-solid fa-share-nodes"></i> Share
                                </button>
                                <button onclick="window.ChromeDownloadManager.dismissDownload('${id}');" style="padding: 10px 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: #94a3b8; border-radius: 10px; font-size: 12px; cursor: pointer;">
                                    Done
                                </button>
                            </div>
                        ` : ''}

                        ${isError ? `
                            <div style="display: flex; gap: 8px; margin-top: 6px;">
                                <button onclick="window.ChromeDownloadManager.startDownload({ dataOrBlobOrUrl: window.ChromeDownloadManager.activeDownloads['${id}'].rawSource, fileName: '${dl.fileName}', mimeType: '${dl.mimeType}' }); window.ChromeDownloadManager.dismissDownload('${id}');" style="flex: 1; padding: 8px 12px; background: #ef4444; color: #fff; border: none; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer;">
                                    <i class="fa-solid fa-rotate-right"></i> Retry Download
                                </button>
                                <button onclick="window.ChromeDownloadManager.dismissDownload('${id}');" style="padding: 8px 12px; background: rgba(255,255,255,0.08); color: #cbd5e1; border: none; border-radius: 8px; font-size: 12.5px; cursor: pointer;">
                                    Dismiss
                                </button>
                            </div>
                        ` : ''}

                    </div>
                `;
            }).join('');

            container.innerHTML = cardsHtml;
        }
    };

    window.ChromeDownloadManager = ChromeDownloadManager;

    // Public Universal Download Method used by all Extra Tools
    window.downloadFileToDevice = function(dataOrBlob, fileName, mimeType) {
        if (!dataOrBlob) {
            window.showDownloadToast('No file available to download', 'error');
            return;
        }
        ChromeDownloadManager.startDownload({
            dataOrBlobOrUrl: dataOrBlob,
            fileName: fileName,
            mimeType: mimeType
        });
    };

    // Native Android Callbacks dispatched by MainActivity.java
    window.onDownloadProgressUpdate = function(fileName, percent, writtenBytes, totalBytes) {
        ChromeDownloadManager.updateProgress(fileName, percent, writtenBytes, totalBytes);
    };

    window.onDownloadProgressComplete = function(fileName, openUriString, mimeType, totalBytes) {
        ChromeDownloadManager.completeDownload(fileName, openUriString, mimeType, totalBytes);
    };

    window.onDownloadProgressError = function(fileName, errorMessage) {
        ChromeDownloadManager.errorDownload(fileName, errorMessage);
    };

    window.downloadBlobUrlFromNative = function(blobUrl, mimeType) {
        if (!blobUrl) return;
        fetch(blobUrl)
            .then(res => res.blob())
            .then(blob => {
                const guessedName = 'download_' + Date.now();
                window.downloadFileToDevice(blob, guessedName, mimeType || 'application/octet-stream');
            })
            .catch(err => {
                console.error('Failed to resolve native blob URL:', err);
            });
    };

    window.showDownloadToast = function(message, type = 'success') {
        let toast = document.getElementById('universalDownloadToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'universalDownloadToast';
            toast.style.cssText = `
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: #0f172a;
                color: #ffffff;
                padding: 13px 22px;
                border-radius: 25px;
                font-size: 13.5px;
                font-weight: 700;
                box-shadow: 0 10px 30px rgba(0,0,0,0.7);
                border: 2px solid #22c55e;
                z-index: 9999999;
                display: flex;
                align-items: center;
                gap: 9px;
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
                opacity: 0;
                pointer-events: none;
                max-width: 90%;
                text-align: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;
            document.body.appendChild(toast);
        }

        const icon = type === 'error'
            ? '<i class="fa-solid fa-circle-exclamation" style="color: #ef4444; font-size: 17px;"></i>'
            : '<i class="fa-solid fa-circle-check" style="color: #22c55e; font-size: 17px;"></i>';

        toast.style.borderColor = type === 'error' ? '#ef4444' : '#22c55e';
        toast.innerHTML = `${icon}<span>${message}</span>`;
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity = '1';

        if (window._downloadToastTimer) clearTimeout(window._downloadToastTimer);
        window._downloadToastTimer = setTimeout(() => {
            if (toast) {
                toast.style.transform = 'translateX(-50%) translateY(100px)';
                toast.style.opacity = '0';
            }
        }, 4000);
    };

    window.openChromeDownloadsModal = function() {
        if (typeof window.checkExtraToolSubscription === 'function') {
            if (!window.checkExtraToolSubscription(() => window.openChromeDownloadsModal())) {
                return false;
            }
        }
        const history = ChromeDownloadManager.getHistory();
        let modal = document.getElementById('chromeDownloadsHistoryModal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'chromeDownloadsHistoryModal';
        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(6px);
            z-index: 9999999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
        `;

        const itemsHtml = history.length === 0 
            ? `<div style="text-align: center; padding: 40px 16px; color: #94a3b8;">
                <i class="fa-solid fa-cloud-arrow-down" style="font-size: 38px; color: #475569; margin-bottom: 12px; display: block;"></i>
                No downloaded files yet. Files downloaded from Extra Tools will appear here.
               </div>`
            : history.map(item => {
                const fInfo = getChromeFileIcon(item.fileName, item.mimeType);
                return `
                    <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                            <div style="width: 38px; height: 38px; border-radius: 10px; background: ${fInfo.bg}; border: 1px solid ${fInfo.color}; display: flex; align-items: center; justify-content: center; font-size: 18px; color: ${fInfo.color}; shrink: 0;">
                                <i class="fa-solid ${fInfo.icon}"></i>
                            </div>
                            <div style="min-width: 0;">
                                <div style="font-size: 13.5px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.fileName}</div>
                                <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">${formatChromeBytes(item.size)} • ${item.dateStr || ''}</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button onclick="window.ChromeDownloadManager.openFile('${item.id}');" style="padding: 7px 11px; background: #10b981; color: #fff; border: none; border-radius: 7px; font-size: 12px; font-weight: 700; cursor: pointer;">Open</button>
                            <button onclick="window.ChromeDownloadManager.shareFile('${item.id}');" style="padding: 7px 10px; background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.2); border-radius: 7px; font-size: 12px; cursor: pointer;"><i class="fa-solid fa-share-nodes"></i></button>
                        </div>
                    </div>
                `;
            }).join('');

        modal.innerHTML = `
            <div style="background: #181d24; border: 1.5px solid rgba(66, 133, 244, 0.45); border-radius: 18px; max-width: 480px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
                <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(66, 133, 244, 0.2); color: #4285f4; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-download"></i>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #fff;">Downloads</h3>
                            <span style="font-size: 11px; color: #94a3b8;">Downloaded files on your device</span>
                        </div>
                    </div>
                    <button onclick="document.getElementById('chromeDownloadsHistoryModal') && document.getElementById('chromeDownloadsHistoryModal').remove();" style="background: rgba(255,255,255,0.06); border: none; color: #cbd5e1; width: 30px; height: 30px; border-radius: 50%; cursor: pointer;">✕</button>
                </div>
                <div style="padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; flex: 1;">
                    ${itemsHtml}
                </div>
            </div>
        `;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        document.body.appendChild(modal);
    };
})();

// ==========================================
// EXTRA TOOLS SUITE
// ==========================================
window.openExtraToolsSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    isInExtraToolsView = true;
    isInStore35View = false;
    isInGifMakerView = false;
    isInVoiceRecorderView = false;
    isInSketchView = false;
    isInCompressorView = false;
    isInMp3TrimmerView = false;
    isInQrCodeView = false;
    isInCoolTextView = false;
    isInTranslatorView = false;
    if (typeof window.stopTranslatorVoiceInput === 'function') {
        window.stopTranslatorVoiceInput();
    }
    if (typeof cleanupMp3Trimmer === 'function') {
        cleanupMp3Trimmer();
    }
    isInPdfView = false;
    if (typeof cleanupVoiceRecorder === 'function') {
        cleanupVoiceRecorder();
    }
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'tools') {
            url.searchParams.set('view', 'tools');
            window.history.replaceState({ view: 'tools' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Extra Tools...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderExtraToolsPage();
    return false;
};

function renderExtraToolsPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 960px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <!-- Hero Banner -->
            <div style="background: linear-gradient(135deg, #1f102e 0%, #31114d 50%, #581c87 100%); border: 1px solid rgba(236, 72, 153, 0.4); border-radius: 18px; padding: 22px 20px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(236, 72, 153, 0.18); position: relative; overflow: hidden;">
                <div style="position: absolute; right: -20px; top: -20px; font-size: 130px; color: rgba(236, 72, 153, 0.06); transform: rotate(15deg); pointer-events: none;">
                    <i class="fa-solid fa-toolbox"></i>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; position: relative; z-index: 2;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div style="width: 56px; height: 56px; border-radius: 16px; background: rgba(236, 72, 153, 0.18); border: 2px solid #ec4899; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #ec4899; box-shadow: 0 0 18px rgba(236, 72, 153, 0.35);">
                            <i class="fa-solid fa-toolbox"></i>
                        </div>
                        <div>
                            <h2 style="font-size: 24px; font-weight: 800; margin: 0; color: #ffffff; letter-spacing: 0.5px; display: flex; align-items: center; gap: 10px;">
                                Extra Tools
                                <span style="font-size: 11px; font-weight: 700; background: #ec4899; color: #fff; padding: 3px 9px; border-radius: 20px; text-transform: uppercase;">Utilities</span>
                            </h2>
                            <p style="font-size: 13px; color: #cbd5e1; margin: 4px 0 0 0;">High-performance built-in tools and utilities</p>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button onclick="window.openChromeDownloadsModal();" style="padding: 9px 15px; background: rgba(66, 133, 244, 0.18); border: 1px solid rgba(66, 133, 244, 0.45); color: #8ab4f8; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                            <i class="fa-solid fa-download"></i> Downloads
                        </button>
                        <button onclick="window.goHome();" style="padding: 9px 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-house"></i> Home
                        </button>
                    </div>
                </div>
            </div>

            <!-- Tools Grid -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 20px; margin-bottom: 24px;">

                <!-- GPS Map Camera Tool Card -->
                <div style="background: linear-gradient(180deg, #181126 0%, #0d0818 100%); border: 2px solid rgba(192, 132, 252, 0.65); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(192, 132, 252, 0.06); pointer-events: none;">
                        <i class="fa-solid fa-camera"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(192, 132, 252, 0.2); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.45); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-gift"></i> FREE ACCESS
                            </span>
                            <span style="font-size: 12px; color: #c084fc; font-weight: 700;"><i class="fa-solid fa-circle" style="font-size: 7px; margin-right: 4px;"></i> Free For All</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(192, 132, 252, 0.2); border: 2px solid #c084fc; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #c084fc; box-shadow: 0 0 18px rgba(192, 132, 252, 0.35);">
                                <i class="fa-solid fa-camera"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">📸 GPS Map Camera</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">GPS Photo Creator (Original Size)</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Capture or upload photos and embed real-time GPS location, custom address with suggestions, live weather, map stamp and date/time.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #c084fc;"></i> Take live photo or select high-res image from gallery</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #c084fc;"></i> Auto-detect GPS coordinates, address & live weather</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #c084fc;"></i> 1-Tap download with Google Chrome download manager</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openGpsCameraSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(168, 85, 247, 0.45);">
                            <i class="fa-solid fa-camera"></i> Open GPS Map Camera
                        </button>
                    </div>
                </div>

                <!-- MP3 Trimmer & Audio Cutter Tool Card -->
                <div style="background: linear-gradient(180deg, #0e1e17 0%, #07130e 100%); border: 2px solid rgba(42, 178, 123, 0.65); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(42, 178, 123, 0.06); pointer-events: none;">
                        <i class="fa-solid fa-scissors"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(42, 178, 123, 0.2); border: 2px solid #2ab27b; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #2ab27b; box-shadow: 0 0 18px rgba(42, 178, 123, 0.35);">
                                <i class="fa-solid fa-scissors"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">🎧 MP3 Trimmer</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">Waveform Visualizer &amp; Audio Cutter</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Interactive waveform audio cutter with drag selection. Play selected regions and export trimmed MP3 audio directly to your device.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #2ab27b;"></i> Real-time WaveSurfer waveform audio rendering</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #2ab27b;"></i> Drag to select region &amp; instant playback preview</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #2ab27b;"></i> In-browser LAME MP3 encode &amp; mobile download</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openMp3TrimmerSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #2ab27b 0%, #1e875b 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(42, 178, 123, 0.45);">
                            <i class="fa-solid fa-scissors"></i> Open MP3 Trimmer
                        </button>
                    </div>
                </div>

                <!-- QR Code Generator Tool Card -->
                <div style="background: linear-gradient(180deg, #10192e 0%, #090e1a 100%); border: 2px solid rgba(0, 123, 255, 0.65); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(0, 123, 255, 0.06); pointer-events: none;">
                        <i class="fa-solid fa-qrcode"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(0, 123, 255, 0.2); border: 2px solid #007bff; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #007bff; box-shadow: 0 0 18px rgba(0, 123, 255, 0.35);">
                                <i class="fa-solid fa-qrcode"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">📲 QR Code Generator</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">Instant QR Maker &amp; Download</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Generate high-contrast QR codes for any text, URL, WhatsApp or contact links. Download crisp PNG images directly to your mobile device.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #007bff;"></i> Enter custom text, link or URL</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #007bff;"></i> Instant render with error correction (Level H)</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #007bff;"></i> 1-Tap PNG Download with Chrome progress bar</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openQrCodeSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(0, 123, 255, 0.45);">
                            <i class="fa-solid fa-qrcode"></i> Open QR Generator
                        </button>
                    </div>
                </div>

                <!-- Only Tool: PDF Reader & Viewer -->
                <div style="background: linear-gradient(180deg, #1e1322 0%, #150d18 100%); border: 2px solid rgba(244, 63, 94, 0.55); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(244, 63, 94, 0.05); pointer-events: none;">
                        <i class="fa-solid fa-file-pdf"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(244, 63, 94, 0.2); border: 2px solid #f43f5e; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #f43f5e; box-shadow: 0 0 18px rgba(244, 63, 94, 0.35);">
                                <i class="fa-solid fa-file-pdf"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">PDF Reader & Viewer</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">Document Viewer, Input & Printer</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Open, view, input and print any PDF document. Automatically launches when clicking PDF files on your device or upload your own files.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #10b981;"></i> Automatic opening on device PDF file clicks</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #10b981;"></i> Local PDF file input and file picker support</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #10b981;"></i> Zoom, page navigation, rotate and instant print</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openPdfSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(244, 63, 94, 0.45);">
                            <i class="fa-solid fa-book-open"></i> Open PDF Reader
                        </button>
                        <button onclick="window.triggerPdfFilePicker(event);" style="padding: 13px 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.22); color: #fff; border-radius: 11px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px;" title="Browse and Input PDF File">
                            <i class="fa-solid fa-folder-open"></i> Input PDF
                        </button>
                        <input type="file" id="extraToolsPdfInput" accept="application/pdf" style="display:none;" onchange="window.handlePdfFileInputFromTools(event)">
                    </div>
                </div>

                <!-- 35MB Store Tool Card -->
                <div style="background: linear-gradient(180deg, #0d1e15 0%, #08150f 100%); border: 2px solid rgba(46, 164, 79, 0.55); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(46, 164, 79, 0.05); pointer-events: none;">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(46, 164, 79, 0.2); border: 2px solid #2ea44f; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #34d399; box-shadow: 0 0 18px rgba(46, 164, 79, 0.35);">
                                <i class="fa-solid fa-cloud-arrow-up"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">35MB Store</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">Image, Short Video & Any File Uploader</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Upload your image, short video, file or any document up to 35MB. Get a permanent direct download link to copy or share with anyone instantly.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #10b981;"></i> Image, short video, file or any format up to 35MB</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #10b981;"></i> Permanent cloud storage with fast CDN direct link</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #10b981;"></i> 1-click Direct Link copy & native mobile share support</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openStore35Section();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #2ea44f 0%, #1f7f3a 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(46, 164, 79, 0.45);">
                            <i class="fa-solid fa-arrow-up-from-bracket"></i> Open 35MB Store
                        </button>
                        <button onclick="window.triggerStore35FilePicker(event);" style="padding: 13px 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.22); color: #fff; border-radius: 11px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px;" title="Quick Select and Upload">
                            <i class="fa-solid fa-upload"></i> Upload File
                        </button>
                        <input type="file" id="extraToolsStoreFileInput" style="display:none;" onchange="window.handleStore35QuickUpload(event)">
                    </div>
                </div>

                <!-- GIF Maker Tool Card -->
                <div style="background: linear-gradient(180deg, #0e1e2e 0%, #09131e 100%); border: 2px solid rgba(52, 152, 219, 0.55); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(52, 152, 219, 0.05); pointer-events: none;">
                        <i class="fa-solid fa-photo-film"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(52, 152, 219, 0.2); border: 2px solid #3498db; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #38bdf8; box-shadow: 0 0 18px rgba(52, 152, 219, 0.35);">
                                <i class="fa-solid fa-photo-film"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">🔥 Advanced GIF Maker</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">Animated GIF Generator from Photos</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Create animated GIFs from multiple photos. Custom width, height, frame interval speed, live preview, and instant download.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #38bdf8;"></i> Select multiple photos with thumbnail strip</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #38bdf8;"></i> Custom dimensions auto center-cropped</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #38bdf8;"></i> Adjustable frame speed & 1-click Download</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openGifMakerSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(52, 152, 219, 0.45);">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Open GIF Maker
                        </button>
                    </div>
                </div>

                <!-- Voice Recorder Tool Card -->
                <div style="background: linear-gradient(180deg, #161e2e 0%, #0d1520 100%); border: 2px solid rgba(56, 189, 248, 0.55); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(56, 189, 248, 0.05); pointer-events: none;">
                        <i class="fa-solid fa-microphone-lines"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(56, 189, 248, 0.2); border: 2px solid #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #38bdf8; box-shadow: 0 0 18px rgba(56, 189, 248, 0.35);">
                                <i class="fa-solid fa-microphone-lines"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">🎙️ MP3 Voice Recorder</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">High-Quality In-Browser Audio Capture</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Record crisp voice notes, audio or speeches directly with live timer display. Encodes directly to MP3 and saves to your device with 1-click.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #38bdf8;"></i> Live timer display & instant microphone capture</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #38bdf8;"></i> Fast in-browser MP3 audio encoding</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #38bdf8;"></i> 1-click instant MP3 download to device</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openVoiceRecorderSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(14, 165, 233, 0.45);">
                            <i class="fa-solid fa-microphone"></i> Open Voice Recorder
                        </button>
                    </div>
                </div>

                <!-- Photo to Pencil Sketch & Cartoon Tool Card -->
                <div style="background: linear-gradient(180deg, #241712 0%, #150e0a 100%); border: 2px solid rgba(255, 152, 0, 0.55); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(255, 152, 0, 0.05); pointer-events: none;">
                        <i class="fa-solid fa-paintbrush"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(255, 152, 0, 0.2); border: 2px solid #ff9800; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #fb923c; box-shadow: 0 0 18px rgba(255, 152, 0, 0.35);">
                                <i class="fa-solid fa-pencil"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">✏️ Photo into Pencil Sketch</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">Pencil, Cartoon &amp; Painting Filters</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Transform any photo into a realistic hand-drawn pencil sketch, vibrant comic cartoon, or textured painting with instant download.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #fb923c;"></i> Realistic pencil sketch using color dodge blend</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #fb923c;"></i> Cartoon posterization &amp; Sobel edge outline</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #fb923c;"></i> Painting brush-stroke effect &amp; 1-click Download</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openSketchSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(249, 115, 22, 0.45);">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Open Sketch Studio
                        </button>
                    </div>
                </div>

                <!-- Image Compressor & Resizer Tool Card -->
                <div style="background: linear-gradient(180deg, #0d2818 0%, #05140b 100%); border: 2px solid rgba(34, 197, 94, 0.55); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(34, 197, 94, 0.05); pointer-events: none;">
                        <i class="fa-solid fa-compress"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(34, 197, 94, 0.2); border: 2px solid #22c55e; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #4ade80; box-shadow: 0 0 18px rgba(34, 197, 94, 0.35);">
                                <i class="fa-solid fa-compress"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">🗜️ Image Compressor &amp; Resizer</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">Custom Dimensions &amp; Quality Control</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Compress image file size up to 90%, resize custom width and height, adjust JPEG quality with live preview and instant download.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #4ade80;"></i> Custom Width &amp; Height resizing (px)</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #4ade80;"></i> Interactive Quality slider (0.10 to 1.00)</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #4ade80;"></i> Real-time preview with KB size comparison &amp; 1-click Download</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openCompressorSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(34, 197, 94, 0.45);">
                            <i class="fa-solid fa-compress"></i> Open Image Compressor
                        </button>
                    </div>
                </div>

                <!-- Cool Text Tool Card -->
                <div style="background: linear-gradient(180deg, #0f1c2e 0%, #08111e 100%); border: 2px solid rgba(3, 105, 161, 0.7); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(3, 105, 161, 0.08); pointer-events: none;">
                        <i class="fa-solid fa-font"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(3, 105, 161, 0.22); border: 2px solid #0284c7; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #38bdf8; box-shadow: 0 0 18px rgba(3, 105, 161, 0.35);">
                                <i class="fa-solid fa-font"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">✨ Cool Text</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">Create Stylish Logo &amp; Font Effects</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Create stylish logos, 3D gradient text, glowing outlines, Bengali &amp; English typography. Real-time canvas preview and 1-tap transparent PNG download.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #38bdf8;"></i> 12+ fonts: Orbitron, Lobster, Poppins, বাংলা Hind Siliguri</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #38bdf8;"></i> Dual-color gradients, 3D shadow layers &amp; outline stroke</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #38bdf8;"></i> Instant cropped PNG download with auto transparency</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openCoolTextSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(3, 105, 161, 0.45);">
                            <i class="fa-solid fa-font"></i> Open Cool Text
                        </button>
                    </div>
                </div>

                <!-- Translator Tool Card -->
                <div style="background: linear-gradient(180deg, #11261a 0%, #08160f 100%); border: 2px solid rgba(74, 222, 128, 0.65); border-radius: 18px; padding: 24px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 12px 30px rgba(0,0,0,0.5); position: relative; overflow: hidden;">
                    <div style="position: absolute; right: -15px; bottom: -15px; font-size: 110px; color: rgba(74, 222, 128, 0.08); pointer-events: none;">
                        <i class="fa-solid fa-language"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
                            <span style="background: rgba(234, 179, 8, 0.2); color: #fbbf24; border: 1px solid rgba(234, 179, 8, 0.5); padding: 4px 11px; border-radius: 16px; font-size: 10.5px; font-weight: 800; text-transform: uppercase;">
                                <i class="fa-solid fa-crown" style="color: #FFD700;"></i> VIP REQUIRED
                            </span>
                            <span style="font-size: 12px; color: #fbbf24; font-weight: 700;"><i class="fa-solid fa-lock" style="font-size: 10px; margin-right: 4px;"></i> Subscription</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
                            <div style="width: 52px; height: 52px; border-radius: 15px; background: rgba(34, 197, 94, 0.2); border: 2px solid #22c55e; display: flex; align-items: center; justify-content: center; font-size: 26px; color: #4ade80; box-shadow: 0 0 18px rgba(34, 197, 94, 0.35);">
                                <i class="fa-solid fa-language"></i>
                            </div>
                            <div>
                                <h3 style="font-size: 21px; font-weight: 800; margin: 0; color: #ffffff;">🌐 Translator</h3>
                                <span style="font-size: 12.5px; color: #94a3b8;">Multi-Language Real-Time Translation</span>
                            </div>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; line-height: 1.5; margin: 0 0 14px 0;">
                            Translate text instantly between 60+ world languages including English, Bengali, Hindi, Arabic, Spanish, French, Japanese, and more.
                        </p>
                        <ul style="list-style: none; padding: 0; margin: 0 0 18px 0; font-size: 12.5px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #4ade80;"></i> 60+ Languages with English ⇄ Bengali presets</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #4ade80;"></i> High-speed chunked translation powered by MyMemory API</li>
                            <li style="display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-check" style="color: #4ade80;"></i> 1-click swap languages and copy translated text</li>
                        </ul>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button onclick="window.openTranslatorSection();" style="flex: 1; min-width: 160px; padding: 13px 16px; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: #fff; border: none; border-radius: 11px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 16px rgba(22, 163, 74, 0.45);">
                            <i class="fa-solid fa-language"></i> Open Translator
                        </button>
                    </div>
                </div>

            </div>
        </div>
    `;
}

// Reusable GIF Maker Component HTML
function renderGifMakerComponentHTML() {
    return `
        <div style="margin:auto;text-align:center;padding:24px 20px;border:2px solid #3498db;border-radius:15px;background:#0f172a;box-shadow: 0 10px 30px rgba(52, 152, 219, 0.2);max-width:680px;">

            <h3 style="margin-top:0;font-size:22px;color:#fff;font-weight:800;letter-spacing:0.5px;">🔥 Advanced GIF Maker</h3>
            <p style="font-size:13px;color:#94a3b8;margin:-8px 0 16px 0;">Combine photos, customize size and speed, and generate animated GIFs</p>

            <input type="file" id="upload" accept="image/*" multiple style="background: rgba(255,255,255,0.06); border: 1px dashed #3498db; padding: 10px 14px; border-radius: 10px; color: #cbd5e1; width: calc(100% - 28px); max-width: 380px; box-sizing: border-box;"><br><br>

            <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
                <button onclick="addImage()" style="padding:8px 20px;background:#27ae60;color:#fff;border:none;border-radius:20px;cursor:pointer;font-weight:600;box-shadow: 0 4px 12px rgba(39, 174, 96, 0.35);">
                    Add Image
                </button>
                <button onclick="clearGifImages()" id="clearGifBtn" style="padding:8px 18px;background:rgba(239, 68, 68, 0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.4);border-radius:20px;cursor:pointer;font-weight:600;display:none;">
                    Clear All
                </button>
            </div>

            <div id="preview" style="margin-top:15px;min-height:20px;display:flex;flex-wrap:wrap;justify-content:center;gap:6px;"></div>

            <br>

            <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; margin: 0 auto; max-width: 440px; display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; font-size: 13.5px; color: #cbd5e1;">
                <div style="display:flex;align-items:center;gap:6px;">
                    Width:
                    <input type="number" id="gifWidth" value="700" style="width:70px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:6px;padding:4px 6px;text-align:center;">
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    Height:
                    <input type="number" id="gifHeight" value="400" style="width:70px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:6px;padding:4px 6px;text-align:center;">
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    Speed (seconds):
                    <input type="number" id="speed" value="0.3" step="0.1" style="width:65px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:6px;padding:4px 6px;text-align:center;">
                </div>
            </div>

            <br>

            <button onclick="makeGIF()" style="padding:10px 25px;background:#3498db;color:#fff;border:none;border-radius:20px;cursor:pointer;font-weight:bold;font-size:15px;box-shadow: 0 4px 14px rgba(52, 152, 219, 0.4);">
                Generate GIF
            </button>

            <p id="status" style="margin-top: 15px; font-weight: 600; font-size: 15px; min-height: 22px; color: #38bdf8;"></p>

            <img id="result" style="max-width:100%;margin-top:15px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.5);display:none;">
            <br>
            <a id="download"></a>

        </div>
    `;
}

// Dedicated GIF Maker Section
window.openGifMakerSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openGifMakerSection(e))) {
            return false;
        }
    }

    isInGifMakerView = true;
    isInExtraToolsView = false;
    isInStore35View = false;
    isInVoiceRecorderView = false;
    isInSketchView = false;
    isInCompressorView = false;
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'gifmaker') {
            url.searchParams.set('view', 'gifmaker');
            window.history.replaceState({ view: 'gifmaker' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Extra Tools...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderGifMakerPage();
    return false;
};

function renderGifMakerPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 860px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            
            <!-- Navigation Header -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-house"></i> Home
                </button>
            </div>

            <!-- GIF Maker Component -->
            ${renderGifMakerComponentHTML()}
        </div>
    `;
}

// GIF Maker Core Functions
function addImage() {
    let upload = document.getElementById("upload");
    if (!upload || !upload.files || upload.files.length === 0) {
        alert("Select image first");
        return;
    }

    let files = Array.from(upload.files);
    let preview = document.getElementById("preview");
    let clearBtn = document.getElementById("clearGifBtn");

    files.forEach(file => {
        let reader = new FileReader();
        reader.onload = function(e) {
            originalImages.push(e.target.result);

            if (preview) {
                let thumb = document.createElement("img");
                thumb.src = e.target.result;
                thumb.style = "width:60px;height:60px;object-fit:cover;margin:5px;border-radius:6px;border:1px solid rgba(255,255,255,0.25);";
                preview.appendChild(thumb);
            }
            if (clearBtn) clearBtn.style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    });

    upload.value = "";
}
window.addImage = addImage;

function resizeImage(src, width, height) {
    return new Promise(resolve => {
        let img = new Image();
        img.src = src;

        img.onload = function() {
            let canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;

            let ctx = canvas.getContext("2d");

            // center crop system
            let ratio = Math.max(width / img.width, height / img.height);
            let newWidth = img.width * ratio;
            let newHeight = img.height * ratio;

            let x = (width - newWidth) / 2;
            let y = (height - newHeight) / 2;

            ctx.drawImage(img, x, y, newWidth, newHeight);

            resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = function() {
            resolve(src);
        };
    });
}
window.resizeImage = resizeImage;

function loadGifshotLib() {
    return new Promise((resolve, reject) => {
        if (typeof window.gifshot !== 'undefined' || typeof gifshot !== 'undefined') {
            resolve(window.gifshot || gifshot);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/appcreator05/user@main/gifshot.min.js';
        script.onload = () => resolve(window.gifshot || gifshot);
        script.onerror = () => reject(new Error('Failed to load gifshot script'));
        document.head.appendChild(script);
    });
}
window.loadGifshotLib = loadGifshotLib;

async function makeGIF() {
    if (originalImages.length < 2) {
        alert("Minimum 2 images needed!");
        return;
    }

    let status = document.getElementById("status");
    if (status) status.innerText = "Creating GIF... ⏳";

    let width = parseInt(document.getElementById("gifWidth").value) || 700;
    let height = parseInt(document.getElementById("gifHeight").value) || 400;
    let speed = parseFloat(document.getElementById("speed").value) || 0.3;

    try {
        let gifshotEngine = window.gifshot || (typeof gifshot !== 'undefined' ? gifshot : null);
        if (!gifshotEngine) {
            gifshotEngine = await loadGifshotLib();
        }

        let resizedImages = [];
        for (let img of originalImages) {
            let resized = await resizeImage(img, width, height);
            resizedImages.push(resized);
        }

        gifshotEngine.createGIF({
            images: resizedImages,
            interval: speed,
            gifWidth: width,
            gifHeight: height
        }, function(obj) {
            let result = document.getElementById("result");
            let dl = document.getElementById("download");
            let st = document.getElementById("status");

            if (!obj.error) {
                if (result) {
                    result.src = obj.image;
                    result.style.display = "inline-block";
                }

                if (dl) {
                    dl.innerHTML = "⬇ Download GIF";
                    dl.style.display = "inline-block";
                    dl.style.marginTop = "15px";
                    dl.style.padding = "10px 24px";
                    dl.style.background = "#27ae60";
                    dl.style.color = "#ffffff";
                    dl.style.borderRadius = "20px";
                    dl.style.fontWeight = "bold";
                    dl.style.textDecoration = "none";
                    dl.style.cursor = "pointer";
                    dl.style.boxShadow = "0 4px 14px rgba(39, 174, 96, 0.4)";
                    dl.onclick = function(e) {
                        if (e && e.preventDefault) e.preventDefault();
                        window.downloadFileToDevice(obj.image, "smalltoolai.gif", "image/gif");
                    };
                }

                if (st) st.innerText = "Done! 🎉";
            } else {
                if (st) st.innerText = "Error creating GIF ❌";
            }
        });
    } catch (err) {
        console.error("GIF creation error:", err);
        if (status) status.innerText = "Error creating GIF ❌";
    }
}
window.makeGIF = makeGIF;

function clearGifImages() {
    originalImages = [];
    let preview = document.getElementById("preview");
    if (preview) preview.innerHTML = "";
    let upload = document.getElementById("upload");
    if (upload) upload.value = "";
    let result = document.getElementById("result");
    if (result) {
        result.src = "";
        result.style.display = "none";
    }
    let dl = document.getElementById("download");
    if (dl) {
        dl.href = "";
        dl.innerHTML = "";
        dl.style.display = "none";
    }
    let status = document.getElementById("status");
    if (status) status.innerText = "";
    let clearBtn = document.getElementById("clearGifBtn");
    if (clearBtn) clearBtn.style.display = "none";
}
window.clearGifImages = clearGifImages;

// ==========================================
// VOICE RECORDER (MP3) SUITE
// ==========================================
let voiceAudioContext = null;
let voiceRecorderSource = null;
let voiceRecorderProcessor = null;
let voiceMediaStream = null;
let voiceAudioData = [];
let voiceMp3Blob = null;
let voiceStartTime = 0;
let voiceTimerInterval = null;

function cleanupVoiceRecorder() {
    if (voiceTimerInterval) {
        clearInterval(voiceTimerInterval);
        voiceTimerInterval = null;
    }
    if (voiceRecorderProcessor) {
        try { voiceRecorderProcessor.disconnect(); } catch (e) {}
        voiceRecorderProcessor = null;
    }
    if (voiceRecorderSource) {
        try { voiceRecorderSource.disconnect(); } catch (e) {}
        voiceRecorderSource = null;
    }
    if (voiceMediaStream) {
        try {
            voiceMediaStream.getTracks().forEach(track => track.stop());
        } catch (e) {}
        voiceMediaStream = null;
    }
    if (voiceAudioContext && voiceAudioContext.state !== 'closed') {
        try { voiceAudioContext.close(); } catch (e) {}
        voiceAudioContext = null;
    }
}
window.cleanupVoiceRecorder = cleanupVoiceRecorder;

window.openVoiceRecorderSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openVoiceRecorderSection(e))) {
            return false;
        }
    }

    isInVoiceRecorderView = true;
    isInExtraToolsView = false;
    isInStore35View = false;
    isInGifMakerView = false;
    isInSketchView = false;
    isInCompressorView = false;
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'voice-recorder') {
            url.searchParams.set('view', 'voice-recorder');
            window.history.replaceState({ view: 'voice-recorder' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Extra Tools...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderVoiceRecorderPage();
    return false;
};

function renderVoiceRecorderPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 860px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            
            <!-- Navigation Header -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-house"></i> Home
                </button>
            </div>

            <!-- Voice Recorder Component -->
            ${renderVoiceRecorderComponentHTML()}
        </div>
    `;
}

function renderVoiceRecorderComponentHTML() {
    return `
        <style>
        /* Stylish Design */
        #recorder-container {
          font-family: 'Segoe UI', Arial, sans-serif;
          text-align: center;
          background: #1e293b;
          color: white;
          padding: 40px 20px;
          border-radius: 20px;
          margin: 20px auto;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          max-width: 600px;
          border: 1px solid rgba(56, 189, 248, 0.25);
        }
        #recorder-container .timer {
          font-size: 45px;
          font-weight: bold;
          margin: 20px 0;
          color: #38bdf8;
          font-family: monospace;
          letter-spacing: 2px;
        }
        #recorder-container button {
          padding: 15px 25px;
          margin: 10px;
          font-size: 16px;
          font-weight: bold;
          border: none;
          border-radius: 50px;
          cursor: pointer;
          transition: 0.3s;
        }
        #startBtn { background: #22c55e; color: white; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.35); }
        #startBtn:disabled { background: #14532d; opacity: 0.6; cursor: not-allowed; }
        #stopBtn { background: #ef4444; color: white; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35); }
        #stopBtn:disabled { background: #7f1d1d; opacity: 0.6; cursor: not-allowed; }
        #downloadBtn { 
          background: #3b82f6; 
          color: white; 
          display: none; 
          width: 100%;
          max-width: 320px;
          margin: 20px auto 0 auto;
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
        }
        #recorder-container .status { font-size: 14px; color: #94a3b8; min-height: 20px; }
        </style>

        <div id="recorder-container">
            <h2><font color="#fff">🎙️ MP3 Recorder</font></h2>
            <div id="voiceStatus" class="status">Ready to capture voice</div>
            <div id="timerDisplay" class="timer">00:00</div>

            <div style="display:flex; justify-content:center; flex-wrap:wrap;">
                <button id="startBtn" onclick="window.startVoiceRecording()">Start</button>
                <button id="stopBtn" onclick="window.stopVoiceRecording()" disabled>Stop</button>
            </div>
            <br>
            <button id="downloadBtn" onclick="window.downloadVoiceRecording()">📥 Download MP3</button>
        </div>
    `;
}

function loadLameJsLib() {
    return new Promise((resolve, reject) => {
        if (typeof window.lamejs !== 'undefined' || typeof lamejs !== 'undefined') {
            resolve(window.lamejs || lamejs);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.all.min.js';
        script.onload = () => resolve(window.lamejs || lamejs);
        script.onerror = () => {
            const fallback = document.createElement('script');
            fallback.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.all.min.js';
            fallback.onload = () => resolve(window.lamejs || lamejs);
            fallback.onerror = () => reject(new Error('Failed to load lamejs library'));
            document.head.appendChild(fallback);
        };
        document.head.appendChild(script);
    });
}
window.loadLameJsLib = loadLameJsLib;

async function startVoiceRecording() {
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const timerDisplay = document.getElementById("timerDisplay");
    const statusEl = document.getElementById("voiceStatus") || document.getElementById("status");

    try {
        if (typeof window.ensureMicrophonePermission === 'function') {
            const hasMic = await window.ensureMicrophonePermission();
            if (!hasMic) {
                if (statusEl) statusEl.innerText = "❌ Microphone permission denied.";
                return;
            }
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Microphone Error: Your browser does not support audio recording.");
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceMediaStream = stream;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        voiceAudioContext = new AudioCtx();
        
        voiceRecorderSource = voiceAudioContext.createMediaStreamSource(stream);
        voiceRecorderProcessor = voiceAudioContext.createScriptProcessor(4096, 1, 1);

        voiceAudioData = [];
        voiceRecorderProcessor.onaudioprocess = function(e) {
            const data = e.inputBuffer.getChannelData(0);
            voiceAudioData.push(new Float32Array(data));
        };

        voiceRecorderSource.connect(voiceRecorderProcessor);
        voiceRecorderProcessor.connect(voiceAudioContext.destination);

        // Start Timer
        voiceStartTime = Date.now();
        if (timerDisplay) timerDisplay.innerText = "00:00";
        if (voiceTimerInterval) clearInterval(voiceTimerInterval);
        voiceTimerInterval = setInterval(() => {
            let diff = Math.floor((Date.now() - voiceStartTime) / 1000);
            let m = Math.floor(diff / 60).toString().padStart(2, '0');
            let s = (diff % 60).toString().padStart(2, '0');
            if (timerDisplay) timerDisplay.innerText = `${m}:${s}`;
        }, 1000);

        if (statusEl) statusEl.innerText = "🔴 Recording in progress...";
        if (startBtn) startBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        if (downloadBtn) downloadBtn.style.display = "none";
    } catch (err) {
        console.error("Microphone access error:", err);
        alert("Microphone Error: Please allow access.");
    }
}
window.startVoiceRecording = startVoiceRecording;

function stopVoiceRecording() {
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const statusEl = document.getElementById("voiceStatus") || document.getElementById("status");

    if (voiceTimerInterval) {
        clearInterval(voiceTimerInterval);
        voiceTimerInterval = null;
    }

    const recordedSampleRate = (voiceAudioContext && voiceAudioContext.sampleRate) ? voiceAudioContext.sampleRate : 44100;

    if (voiceRecorderProcessor) {
        try { voiceRecorderProcessor.disconnect(); } catch (e) {}
    }
    if (voiceRecorderSource) {
        try { voiceRecorderSource.disconnect(); } catch (e) {}
    }
    if (voiceMediaStream) {
        try {
            voiceMediaStream.getTracks().forEach(track => track.stop());
        } catch (e) {}
    }
    if (voiceAudioContext && voiceAudioContext.state !== 'closed') {
        try { voiceAudioContext.close(); } catch (e) {}
    }

    if (statusEl) statusEl.innerText = "Processing MP3... Please wait";

    // Set a small timeout to let the UI update
    setTimeout(async () => {
        try {
            const merged = mergeVoiceBuffers(voiceAudioData);
            const mp3Chunks = await encodeVoiceMP3(merged, recordedSampleRate);
            if (mp3Chunks && mp3Chunks.length > 0) {
                voiceMp3Blob = new Blob(mp3Chunks, { type: 'audio/mp3' });
                if (statusEl) statusEl.innerText = "✅ Encoding Finished!";
                if (downloadBtn) downloadBtn.style.display = "inline-block";
            } else {
                if (statusEl) statusEl.innerText = "⚠️ Encoding failed or empty";
            }
        } catch (err) {
            console.error("Encoding error:", err);
            if (statusEl) statusEl.innerText = "❌ Error: " + (err.message || "Failed to encode MP3");
        }
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
    }, 100);
}
window.stopVoiceRecording = stopVoiceRecording;

function downloadVoiceRecording() {
    if (!voiceMp3Blob) {
        window.showDownloadToast("No recording available to download!", "error");
        return;
    }
    window.downloadFileToDevice(voiceMp3Blob, "my-voice-recording.mp3", "audio/mp3");
}
window.downloadVoiceRecording = downloadVoiceRecording;

function mergeVoiceBuffers(audioData) {
    let length = 0;
    audioData.forEach(chunk => length += chunk.length);
    const result = new Float32Array(length);
    let offset = 0;
    audioData.forEach(chunk => {
        result.set(chunk, offset);
        offset += chunk.length;
    });
    return result;
}

async function encodeVoiceMP3(samples, sampleRate) {
    let lame = window.lamejs || (typeof lamejs !== 'undefined' ? lamejs : null);
    if (!lame || !lame.Mp3Encoder) {
        try {
            lame = await loadLameJsLib();
        } catch (e) {}
    }

    if (!lame || !lame.Mp3Encoder) {
        alert("Error: LameJS library not found. Please ensure you are online for the first time or use a valid JS source.");
        return [];
    }

    const rate = sampleRate || 44100;
    const mp3encoder = new lame.Mp3Encoder(1, rate, 128);
    const sampleBlockSize = 1152;
    const mp3Data = [];

    for (let i = 0; i < samples.length; i += sampleBlockSize) {
        const sampleChunk = samples.subarray(i, i + sampleBlockSize);
        const int16Chunk = convertVoiceFloatToInt16(sampleChunk);
        const mp3buf = mp3encoder.encodeBuffer(int16Chunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }

    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) mp3Data.push(endBuf);
    return mp3Data;
}

function convertVoiceFloatToInt16(buffer) {
    const l = buffer.length;
    const buf = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        buf[i] = Math.max(-1, Math.min(1, buffer[i])) * 0x7FFF;
    }
    return buf;
}

// ==========================================
// PHOTO INTO PENCIL SKETCH & CARTOON SUITE
// ==========================================
let currentSketchImg = new Image();
let isSketchImageLoaded = false;

window.openSketchSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openSketchSection(e))) {
            return false;
        }
    }

    isInSketchView = true;
    isInExtraToolsView = false;
    isInStore35View = false;
    isInGifMakerView = false;
    isInVoiceRecorderView = false;
    isInCompressorView = false;
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'sketch') {
            url.searchParams.set('view', 'sketch');
            window.history.replaceState({ view: 'sketch' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Extra Tools...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderSketchPage();
    return false;
};

function renderSketchPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 860px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            
            <!-- Navigation Header -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-house"></i> Home
                </button>
            </div>

            <!-- Sketch Studio Component -->
            ${renderSketchComponentHTML()}
        </div>
    `;
}

function renderSketchComponentHTML() {
    return `
        <style>
        /* Stylish Design for Sketch Studio */
        #sketch-studio-container {
          font-family: 'Segoe UI', Arial, sans-serif;
          text-align: center;
          background: #1e293b;
          color: white;
          padding: 35px 20px 45px 20px;
          border-radius: 20px;
          margin: 15px auto;
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          max-width: 780px;
          border: 1px solid rgba(255, 152, 0, 0.35);
        }
        #sketch-studio-container h2 {
          margin-top: 0;
          margin-bottom: 12px;
          color: #fff;
          font-size: 22px;
          font-weight: 800;
        }
        #sketch-studio-container input[type="file"] {
          margin: 12px 0 16px 0;
          background: rgba(255,255,255,0.06);
          border: 1px dashed rgba(255, 152, 0, 0.6);
          padding: 10px 14px;
          border-radius: 12px;
          color: #cbd5e1;
          max-width: 360px;
          width: calc(100% - 28px);
          cursor: pointer;
        }
        #sketch-studio-container canvas {
          max-width: 100%;
          border: 2px dashed rgba(255,255,255,0.25);
          border-radius: 12px;
          margin-top: 20px;
          background: #0f172a;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          display: none;
        }
        #sketch-studio-container .sketch-action-btn {
          padding: 11px 20px;
          margin: 6px;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 14.5px;
          font-weight: 700;
          transition: transform 0.15s, opacity 0.15s, box-shadow 0.15s;
        }
        #sketch-studio-container .sketch-action-btn:hover {
          opacity: 0.92;
          transform: translateY(-1px);
        }
        #sketch-studio-container .sketch-action-btn:active {
          transform: translateY(1px);
        }
        #sketch-pencil-btn { background: #222222; color: #ffffff; border: 1px solid #555; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
        #sketch-cartoon-btn { background: #ff9800; color: #ffffff; box-shadow: 0 4px 12px rgba(255, 152, 0, 0.4); }
        #sketch-painting-btn { background: #9c27b0; color: #ffffff; box-shadow: 0 4px 12px rgba(156, 39, 176, 0.4); }
        #sketch-download-btn { background: #4caf50; color: #ffffff; display: none; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.4); }
        #sketch-studio-container .sketch-status {
          font-size: 13.5px;
          color: #94a3b8;
          margin-top: 8px;
          min-height: 20px;
        }
        </style>

        <div id="sketch-studio-container">
            <h2>✏️ Pencil &amp; 🎨 Painting-style Cartoon</h2>
            <p style="font-size: 13px; color: #94a3b8; margin: -4px 0 14px 0;">Select a photo and click any style to generate drawing or cartoon effects</p>

            <input type="file" id="sketch-upload" accept="image/*" onchange="window.handleSketchUpload(event)"><br>

            <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 4px; margin-top: 6px;">
                <button id="sketch-pencil-btn" class="sketch-action-btn" onclick="window.applyPencilDrawing()">✏️ Pencil</button>
                <button id="sketch-cartoon-btn" class="sketch-action-btn" onclick="window.applyCartoonEffect(false)">🎨 Cartoon</button>
                <button id="sketch-painting-btn" class="sketch-action-btn" onclick="window.applyCartoonEffect(true)">🖌️ Painting Cartoon</button>
                <button id="sketch-download-btn" class="sketch-action-btn" onclick="window.downloadSketchImage()">⬇️ Download</button>
            </div>

            <div id="sketch-status" class="sketch-status">Select an image to start</div>

            <div>
                <canvas id="sketch-canvas"></canvas>
            </div>
        </div>
    `;
}

window.handleSketchUpload = function(e) {
    const file = e && e.target && e.target.files ? e.target.files[0] : null;
    if (!file) return;

    const status = document.getElementById("sketch-status");
    if (status) status.innerText = "Loading image... ⏳";

    const reader = new FileReader();
    reader.onload = () => {
        currentSketchImg = new Image();
        currentSketchImg.onload = () => {
            isSketchImageLoaded = true;
            const canvas = document.getElementById("sketch-canvas");
            if (!canvas) return;
            const ctx = canvas.getContext("2d");

            // Scale if dimensions exceed 1600px for high performance on mobile devices
            const maxDimension = 1600;
            let w = currentSketchImg.width;
            let h = currentSketchImg.height;
            if (w > maxDimension || h > maxDimension) {
                if (w > h) {
                    h = Math.round((h * maxDimension) / w);
                    w = maxDimension;
                } else {
                    w = Math.round((w * maxDimension) / h);
                    h = maxDimension;
                }
            }

            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(currentSketchImg, 0, 0, w, h);
            canvas.style.display = "inline-block";

            const dl = document.getElementById("sketch-download-btn");
            if (dl) dl.style.display = "inline-block";

            if (status) status.innerText = "Image loaded! Select a filter above: ✏️ Pencil, 🎨 Cartoon, or 🖌️ Painting";
        };
        currentSketchImg.src = reader.result;
    };
    reader.readAsDataURL(file);
};

window.applyPencilDrawing = function() {
    if (!isSketchImageLoaded) {
        alert("Please select an image first!");
        return;
    }
    const canvas = document.getElementById("sketch-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const status = document.getElementById("sketch-status");
    if (status) status.innerText = "Creating pencil sketch... ⏳";

    setTimeout(() => {
        try {
            ctx.drawImage(currentSketchImg, 0, 0, canvas.width, canvas.height);

            let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let data = imgData.data;

            for (let i = 0; i < data.length; i += 4) {
                let g = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
                data[i] = data[i + 1] = data[i + 2] = g;
            }

            let inv = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i += 4) {
                inv[i] = 255 - data[i];
                inv[i + 1] = 255 - data[i + 1];
                inv[i + 2] = 255 - data[i + 2];
                inv[i + 3] = 255;
            }

            ctx.putImageData(new ImageData(inv, canvas.width, canvas.height), 0, 0);

            ctx.filter = "blur(6px)";
            ctx.drawImage(canvas, 0, 0);
            ctx.filter = "none";

            let blur = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = dodge(data[i], blur[i]);
                data[i + 1] = dodge(data[i + 1], blur[i + 1]);
                data[i + 2] = dodge(data[i + 2], blur[i + 2]);
            }

            ctx.putImageData(imgData, 0, 0);

            const dl = document.getElementById("sketch-download-btn");
            if (dl) dl.style.display = "inline-block";
            if (status) status.innerText = "✏️ Pencil Sketch generated successfully! Click Download to save.";
        } catch (err) {
            console.error("Pencil filter error:", err);
            if (status) status.innerText = "Error applying filter ❌";
        }
    }, 30);
};

function dodge(b, l) {
    return l === 255 ? 255 : Math.min(255, (b << 8) / (255 - l));
}

window.applyCartoonEffect = function(enablePainting) {
    if (!isSketchImageLoaded) {
        alert("Please select an image first!");
        return;
    }
    const canvas = document.getElementById("sketch-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const status = document.getElementById("sketch-status");
    if (status) status.innerText = enablePainting ? "Creating painting cartoon... ⏳" : "Creating cartoon effect... ⏳";

    setTimeout(() => {
        try {
            ctx.drawImage(currentSketchImg, 0, 0, canvas.width, canvas.height);
            let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let data = imgData.data;

            // Posterization (flat color)
            const step = 32;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = Math.floor(data[i] / step) * step;
                data[i + 1] = Math.floor(data[i + 1] / step) * step;
                data[i + 2] = Math.floor(data[i + 2] / step) * step;
            }

            // Grayscale for edges
            let gray = new Uint8ClampedArray(canvas.width * canvas.height);
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    let i = (y * canvas.width + x) * 4;
                    gray[y * canvas.width + x] = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
                }
            }

            // Sobel edge detection
            const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
            const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
            let edges = new Uint8ClampedArray(canvas.width * canvas.height);

            for (let y = 1; y < canvas.height - 1; y++) {
                for (let x = 1; x < canvas.width - 1; x++) {
                    let gx = 0, gy = 0, k = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            let val = gray[(y + ky) * canvas.width + (x + kx)];
                            gx += val * sobelX[k++];
                        }
                    }
                    k = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            let val = gray[(y + ky) * canvas.width + (x + kx)];
                            gy += val * sobelY[k++];
                        }
                    }
                    let g = Math.sqrt(gx * gx + gy * gy);
                    edges[y * canvas.width + x] = g > 100 ? 0 : 255;
                }
            }

            // Overlay edges and painting effect
            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x++) {
                    let i = (y * canvas.width + x) * 4;
                    if (edges[y * canvas.width + x] === 0) {
                        data[i] = data[i + 1] = data[i + 2] = 0; // black edge
                    } else if (enablePainting) {
                        // Simulate brush strokes with small random noise
                        let brush = 0.85 + Math.random() * 0.3; // 0.85-1.15
                        data[i] = Math.min(255, data[i] * brush);
                        data[i + 1] = Math.min(255, data[i + 1] * brush);
                        data[i + 2] = Math.min(255, data[i + 2] * brush);
                        // optional gradient shading for depth
                        let shade = 1 - (y / canvas.height) * 0.15;
                        data[i] = Math.min(255, data[i] * shade);
                        data[i + 1] = Math.min(255, data[i + 1] * shade);
                        data[i + 2] = Math.min(255, data[i + 2] * shade);
                    }
                }
            }

            ctx.putImageData(imgData, 0, 0);

            const dl = document.getElementById("sketch-download-btn");
            if (dl) dl.style.display = "inline-block";

            if (status) {
                status.innerText = enablePainting
                    ? "🖌️ Painting Cartoon generated successfully! Click Download to save."
                    : "🎨 Cartoon Effect generated successfully! Click Download to save.";
            }
        } catch (err) {
            console.error("Cartoon filter error:", err);
            if (status) status.innerText = "Error applying filter ❌";
        }
    }, 30);
};

window.downloadSketchImage = function() {
    const canvas = document.getElementById("sketch-canvas");
    if (!canvas) return;
    try {
        const dataUrl = canvas.toDataURL("image/png");
        window.downloadFileToDevice(dataUrl, "pencil-sketch-cartoon.png", "image/png");
    } catch (e) {
        console.error("Download error:", e);
        window.showDownloadToast("Download error: " + (e.message || "Failed"), "error");
    }
};

// ==========================================
// IMAGE COMPRESSOR & RESIZER SUITE
// ==========================================
window.openCompressorSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openCompressorSection(e))) {
            return false;
        }
    }

    isInExtraToolsView = false;
    isInCompressorView = true;
    isInSketchView = false;
    isInStore35View = false;
    isInGifMakerView = false;
    isInVoiceRecorderView = false;
    if (typeof cleanupVoiceRecorder === 'function') {
        cleanupVoiceRecorder();
    }
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'compressor') {
            url.searchParams.set('view', 'compressor');
            window.history.replaceState({ view: 'compressor' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Extra Tools...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderCompressorPage();
    return false;
};

function renderCompressorPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 860px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            
            <!-- Navigation Header -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-house"></i> Home
                </button>
            </div>

            <!-- Image Compressor Component -->
            ${renderCompressorComponentHTML()}
        </div>
    `;

    setTimeout(() => {
        initCompressorListeners();
        // Re-process if file already loaded
        if (currentCompressorFile) {
            resizeAndCompress(currentCompressorFile);
        }
    }, 20);
}

function renderCompressorComponentHTML() {
    return `
        <style>
        /* Stylish Design for Image Compressor & Resizer */
        #compressor-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          text-align: center;
          background: #1e293b;
          color: white;
          padding: 35px 20px 45px 20px;
          border-radius: 20px;
          margin: 15px auto;
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          max-width: 780px;
          border: 1px solid rgba(34, 197, 94, 0.4);
        }
        #compressor-container h2 {
          margin-top: 0;
          margin-bottom: 8px;
          color: #ffffff;
          font-size: 22px;
          font-weight: 800;
        }
        #compressor-container label {
          display: block;
          margin-top: 14px;
          font-size: 14px;
          color: #e2e8f0;
          font-weight: 600;
          text-align: left;
          max-width: 460px;
          margin-left: auto;
          margin-right: auto;
        }
        #compressor-container input[type="file"] {
          margin-top: 8px;
          background: rgba(255,255,255,0.06);
          border: 1px dashed rgba(34, 197, 94, 0.6);
          padding: 10px 14px;
          border-radius: 12px;
          color: #cbd5e1;
          width: 100%;
          box-sizing: border-box;
          cursor: pointer;
        }
        #compressor-container input[type="number"] {
          margin-left: 10px;
          vertical-align: middle;
          background: #0f172a;
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.25);
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 14px;
          width: 100px;
          outline: none;
        }
        #compressor-container input[type="number"]:focus {
          border-color: #22c55e;
        }
        /* Slider Styling from specification */
        #compressor-container input[type=range] {
          -webkit-appearance: none;
          width: 250px;
          max-width: calc(100% - 90px);
          height: 8px;
          background: #334155;
          border-radius: 5px;
          outline: none;
          margin-left: 10px;
          vertical-align: middle;
        }
        #compressor-container input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          background: #4CAF50;
          border-radius: 50%;
          border: 2px solid #333;
          cursor: pointer;
        }
        #compressor-container input[type=range]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          background: #4CAF50;
          border-radius: 50%;
          border: 2px solid #333;
          cursor: pointer;
        }
        #compressor-container span {
          font-weight: bold;
          color: #4ade80;
          margin-left: 8px;
        }
        /* Image preview container */
        #output {
          margin-top: 24px;
          padding: 18px 14px;
          background: #f9f9f9;
          border: 1px solid #ccc;
          overflow: auto;
          max-width: 100%;
          border-radius: 14px;
          color: #1e293b;
          box-shadow: 0 4px 16px rgba(0,0,0,0.25);
          box-sizing: border-box;
        }
        #output img {
          display: block;
          width: auto;
          height: auto;
          max-width: 100%;
          margin: 12px auto;
          border-radius: 8px;
        }
        </style>

        <div id="compressor-container">
            <h2>Upload Image to Compress &amp; Resize</h2>
            <p style="font-size: 13px; color: #94a3b8; margin: -2px 0 16px 0;">Reduce file size, change dimensions, and preview in real-time</p>

            <label>
              Choose Image:
              <input autocomplete="off" type="file" id="imageInput" accept="image/*">
            </label>

            <!-- Quick Dimension Presets -->
            <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; margin: 12px auto; max-width: 460px;">
                <button type="button" onclick="window.setCompressorPreset('original')" style="padding: 6px 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; border-radius: 8px; font-size: 11.5px; cursor: pointer; transition: all 0.15s;">Original Size</button>
                <button type="button" onclick="window.setCompressorPreset('700x400')" style="padding: 6px 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; border-radius: 8px; font-size: 11.5px; cursor: pointer; transition: all 0.15s;">700 × 400</button>
                <button type="button" onclick="window.setCompressorPreset('1280x720')" style="padding: 6px 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; border-radius: 8px; font-size: 11.5px; cursor: pointer; transition: all 0.15s;">HD 1280 × 720</button>
                <button type="button" onclick="window.setCompressorPreset('500x500')" style="padding: 6px 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; border-radius: 8px; font-size: 11.5px; cursor: pointer; transition: all 0.15s;">Square 500 × 500</button>
            </div>

            <label>
              Width (px):
              <input autocomplete="off" type="number" id="customWidth" value="700" min="1">
            </label>

            <label>
              Height (px):
              <input autocomplete="off" type="number" id="customHeight" value="400" min="1">
            </label>

            <label>
              Quality (0.1 to 1):
              <input autocomplete="off" type="range" id="quality" min="0.1" max="1" step="0.01" value="0.7">
              <span id="qualityVal">0.70</span>
            </label>

            <div id="output">
                <div style="padding: 30px 10px; text-align: center; color: #64748b;">
                    <i class="fa-solid fa-cloud-arrow-up" style="font-size: 34px; color: #22c55e; margin-bottom: 10px; display: block;"></i>
                    <div style="font-size: 15px; font-weight: 700; color: #334155;">No image selected yet</div>
                    <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Choose an image above to compress and preview in real-time.</div>
                </div>
            </div>
        </div>
    `;
}

function initCompressorListeners() {
    const imageInput = document.getElementById('imageInput');
    const widthInput = document.getElementById('customWidth');
    const heightInput = document.getElementById('customHeight');
    const qualityInput = document.getElementById('quality');
    const qualityVal = document.getElementById('qualityVal');

    if (imageInput) {
        imageInput.onchange = function(e) {
            const file = e.target.files && e.target.files[0];
            if (file) {
                currentCompressorFile = file;
                const preImg = new Image();
                preImg.onload = function() {
                    currentCompressorImg = preImg;
                    // Update default values to match original image dimensions
                    if (widthInput && (!widthInput.value || widthInput.value === '700')) {
                        widthInput.value = preImg.width;
                    }
                    if (heightInput && (!heightInput.value || heightInput.value === '400')) {
                        heightInput.value = preImg.height;
                    }
                    resizeAndCompress(file);
                };
                const r = new FileReader();
                r.onload = ev => { preImg.src = ev.target.result; };
                r.readAsDataURL(file);
            }
        };
    }

    if (qualityInput) {
        qualityInput.addEventListener('input', () => {
            if (qualityVal) {
                qualityVal.textContent = parseFloat(qualityInput.value).toFixed(2);
            }
            if (currentCompressorFile) {
                resizeAndCompress(currentCompressorFile);
            }
        });
    }

    if (widthInput) {
        widthInput.addEventListener('change', () => {
            if (currentCompressorFile) {
                resizeAndCompress(currentCompressorFile);
            }
        });
        widthInput.addEventListener('input', () => {
            if (currentCompressorFile) {
                resizeAndCompress(currentCompressorFile);
            }
        });
    }

    if (heightInput) {
        heightInput.addEventListener('change', () => {
            if (currentCompressorFile) {
                resizeAndCompress(currentCompressorFile);
            }
        });
        heightInput.addEventListener('input', () => {
            if (currentCompressorFile) {
                resizeAndCompress(currentCompressorFile);
            }
        });
    }
}

function resizeAndCompress(file) {
    if (!file) return;
    const output = document.getElementById('output');
    const widthInput = document.getElementById('customWidth');
    const heightInput = document.getElementById('customHeight');
    const qualityInput = document.getElementById('quality');
    const qualityVal = document.getElementById('qualityVal');

    if (qualityInput && qualityVal) {
        qualityVal.textContent = parseFloat(qualityInput.value).toFixed(2);
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            currentCompressorImg = img;
            currentCompressorFile = file;

            let targetWidth = parseInt(widthInput ? widthInput.value : 700) || 700;
            let targetHeight = parseInt(heightInput ? heightInput.value : 400) || 400;
            let q = parseFloat(qualityInput ? qualityInput.value : 0.7);
            if (isNaN(q) || q < 0.05) q = 0.7;
            if (q > 1.0) q = 1.0;

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');

            // Draw resized image
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            // Compress as JPEG
            const dataUrl = canvas.toDataURL('image/jpeg', q);

            // Compute sizes
            const head = 'data:image/jpeg;base64,';
            const base64Str = dataUrl.startsWith(head) ? dataUrl.substring(head.length) : dataUrl;
            const compressedBytes = Math.round((base64Str.length * 3) / 4);
            const originalBytes = file.size || 0;
            const savedBytes = Math.max(0, originalBytes - compressedBytes);
            const savedPct = originalBytes > 0 ? ((savedBytes / originalBytes) * 100).toFixed(1) : "0.0";

            function formatBytes(bytes) {
                if (bytes < 1024) return bytes + ' B';
                if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
            }

            const origSizeFormatted = formatBytes(originalBytes);
            const compSizeFormatted = formatBytes(compressedBytes);

            let fileNameWithoutExt = file.name ? file.name.replace(/\.[^/.]+$/, "") : "image";
            let downloadFileName = fileNameWithoutExt + "_compressed_" + targetWidth + "x" + targetHeight + ".jpg";

            window.currentCompressedDataUrl = dataUrl;
            window.currentCompressedFileName = downloadFileName;

            if (output) {
                output.innerHTML = `
                    <div style="text-align: center; color: #1e293b;">
                        <!-- Statistics Cards -->
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; text-align: center;">
                            <div style="background: #ffffff; border: 1px solid #e2e8f0; padding: 10px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                                <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Original Size</div>
                                <div style="font-size: 15px; font-weight: 800; color: #334155; margin-top: 3px;">${origSizeFormatted}</div>
                            </div>
                            <div style="background: #f0fdf4; border: 1px solid #86efac; padding: 10px; border-radius: 10px; box-shadow: 0 1px 3px rgba(34,197,94,0.1);">
                                <div style="font-size: 11px; color: #166534; font-weight: 600; text-transform: uppercase;">Compressed Size</div>
                                <div style="font-size: 15px; font-weight: 800; color: #15803d; margin-top: 3px;">${compSizeFormatted}</div>
                            </div>
                            <div style="background: #f0f9ff; border: 1px solid #7dd3fc; padding: 10px; border-radius: 10px; box-shadow: 0 1px 3px rgba(14,165,233,0.1);">
                                <div style="font-size: 11px; color: #0369a1; font-weight: 600; text-transform: uppercase;">Resolution</div>
                                <div style="font-size: 15px; font-weight: 800; color: #0284c7; margin-top: 3px;">${targetWidth} × ${targetHeight}</div>
                            </div>
                            <div style="background: #fefce8; border: 1px solid #fde047; padding: 10px; border-radius: 10px; box-shadow: 0 1px 3px rgba(234,179,8,0.1);">
                                <div style="font-size: 11px; color: #854d0e; font-weight: 600; text-transform: uppercase;">Reduction</div>
                                <div style="font-size: 15px; font-weight: 800; color: #ca8a04; margin-top: 3px;">${savedPct}% Saved</div>
                            </div>
                        </div>

                        <!-- Download Button -->
                        <div style="margin: 14px 0;">
                            <button type="button" id="downloadBtn" onclick="window.downloadCompressedImageNow()" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 28px; background: #22c55e; color: #ffffff; border: none; border-radius: 30px; font-weight: 800; font-size: 15px; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4); cursor: pointer; transition: transform 0.15s, background 0.15s;">
                                📥 Download Compressed Image (${compSizeFormatted})
                            </button>
                        </div>

                        <!-- Live Preview -->
                        <div style="margin-top: 15px; text-align: center;">
                            <span style="font-size: 12px; color: #64748b; font-weight: 600; display: block; margin-bottom: 6px;">Live Preview (${targetWidth}×${targetHeight} px @ ${(q * 100).toFixed(0)}% quality)</span>
                            <img src="${dataUrl}" alt="Compressed Preview" style="max-width: 100%; height: auto; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); border: 1px solid #cbd5e1; margin: 0 auto; display: block;">
                        </div>
                    </div>
                `;
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

window.resizeAndCompress = resizeAndCompress;

window.downloadCompressedImageNow = function() {
    if (!window.currentCompressedDataUrl) {
        window.showDownloadToast("No compressed image available to download", "error");
        return;
    }
    window.downloadFileToDevice(window.currentCompressedDataUrl, window.currentCompressedFileName || "compressed-image.jpg", "image/jpeg");
};

window.setCompressorPreset = function(type) {
    const widthInput = document.getElementById('customWidth');
    const heightInput = document.getElementById('customHeight');
    if (!widthInput || !heightInput) return;

    if (type === 'original' && currentCompressorImg) {
        widthInput.value = currentCompressorImg.width;
        heightInput.value = currentCompressorImg.height;
    } else if (type === '700x400') {
        widthInput.value = 700;
        heightInput.value = 400;
    } else if (type === '1280x720') {
        widthInput.value = 1280;
        heightInput.value = 720;
    } else if (type === '500x500') {
        widthInput.value = 500;
        heightInput.value = 500;
    }

    if (currentCompressorFile) {
        resizeAndCompress(currentCompressorFile);
    }
};

// ==========================================
// MP3 TRIMMER & ONLINE AUDIO CUTTER SUITE
// ==========================================
let mp3TrimmerWaveSurfer = null;
let mp3TrimmerAudioBuffer = null;
let mp3TrimmerActiveRegion = null;
let mp3TrimmerOriginalFileName = "trimmed.mp3";

window.cleanupMp3Trimmer = function() {
    try {
        if (mp3TrimmerWaveSurfer) {
            mp3TrimmerWaveSurfer.destroy();
            mp3TrimmerWaveSurfer = null;
        }
    } catch (e) {
        console.warn("Error cleaning up wavesurfer:", e);
    }
    mp3TrimmerAudioBuffer = null;
    mp3TrimmerActiveRegion = null;
};

window.openMp3TrimmerSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openMp3TrimmerSection(e))) {
            return false;
        }
    }

    isInMp3TrimmerView = true;
    isInExtraToolsView = false;
    isInStore35View = false;
    isInGifMakerView = false;
    isInVoiceRecorderView = false;
    if (typeof cleanupVoiceRecorder === 'function') {
        cleanupVoiceRecorder();
    }
    isInSketchView = false;
    isInCompressorView = false;
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'mp3-trimmer') {
            url.searchParams.set('view', 'mp3-trimmer');
            window.history.replaceState({ view: 'mp3-trimmer' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Extra Tools...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderMp3TrimmerPage();
    return false;
};

function ensureTrimmerLibrariesLoaded(callback) {
    const needWaveSurfer = typeof window.WaveSurfer === 'undefined';
    const needRegions = typeof window.WaveSurfer === 'undefined' || (!window.WaveSurfer.Regions && !window.RegionsPlugin);
    const needLame = typeof window.lamejs === 'undefined';

    if (!needWaveSurfer && !needRegions && !needLame) {
        callback();
        return;
    }

    let loadedCount = 0;
    const scripts = [];
    if (needWaveSurfer) {
        scripts.push('https://unpkg.com/wavesurfer.js@7');
    }
    if (needRegions) {
        scripts.push('https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.min.js');
    }
    if (needLame) {
        scripts.push('https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js');
    }

    if (scripts.length === 0) {
        callback();
        return;
    }

    function loadScriptSequentially(index) {
        if (index >= scripts.length) {
            callback();
            return;
        }
        const s = document.createElement('script');
        s.src = scripts[index];
        s.onload = () => loadScriptSequentially(index + 1);
        s.onerror = () => {
            console.warn('Failed to load script:', scripts[index]);
            loadScriptSequentially(index + 1);
        };
        document.head.appendChild(s);
    }
    loadScriptSequentially(0);
}

function renderMp3TrimmerPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    window.cleanupMp3Trimmer();

    container.innerHTML = `
        <div style="max-width: 860px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <!-- Top Controls -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.2s;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window.openChromeDownloadsModal();" style="padding: 9px 14px; background: rgba(66, 133, 244, 0.18); border: 1px solid rgba(66, 133, 244, 0.45); color: #8ab4f8; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-download"></i> Downloads
                    </button>
                    <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-house"></i> Home
                    </button>
                </div>
            </div>

            <!-- Main Audio Cutter Card -->
            <div id="mp3-trimmer-card" style="background: linear-gradient(145deg, #18221b 0%, #0d1611 100%); border: 1.5px solid rgba(42, 178, 123, 0.5); border-radius: 20px; padding: 26px 20px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); text-align: center;">

                <style>
                #waveform {
                  margin: 25px auto;
                  width: 95%;
                  max-width: 780px;
                  height: 160px;
                  background: #ffffff;
                  border-radius: 12px;
                  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
                  overflow: hidden;
                  position: relative;
                }
                .trimmer-btn {
                  margin: 8px;
                  padding: 12px 24px;
                  border: none;
                  border-radius: 8px;
                  font-weight: bold;
                  cursor: pointer;
                  font-size: 14px;
                  transition: transform 0.15s ease, opacity 0.15s ease;
                  display: inline-flex;
                  align-items: center;
                  gap: 8px;
                }
                .trimmer-btn:active {
                  transform: scale(0.97);
                }
                .trimmer-btn:disabled {
                  opacity: 0.45;
                  cursor: not-allowed;
                  transform: none !important;
                }
                #playPause { background: #2ab27b; color: #fff; box-shadow: 0 4px 14px rgba(42, 178, 123, 0.35); }
                #export { background: #007bff; color: #fff; box-shadow: 0 4px 14px rgba(0, 123, 255, 0.35); }
                #status {
                  margin-top: 14px;
                  font-weight: 600;
                  font-size: 14px;
                  font-family: "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif;
                  color: #e2e8f0;
                }
                .spinner {
                  display: inline-block;
                  width: 18px;
                  height: 18px;
                  border: 2px solid #007bff;
                  border-top: 2px solid transparent;
                  border-radius: 50%;
                  animation: spin 0.8s linear infinite;
                  vertical-align: middle;
                  margin-right: 6px;
                }
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                .audio-file-uploader {
                  margin: 18px auto 14px auto;
                  padding: 18px 16px;
                  border: 2px dashed rgba(42, 178, 123, 0.5);
                  border-radius: 14px;
                  background: rgba(42, 178, 123, 0.05);
                  max-width: 480px;
                  cursor: pointer;
                  transition: all 0.2s ease;
                }
                .audio-file-uploader:hover {
                  background: rgba(42, 178, 123, 0.1);
                  border-color: #2ab27b;
                }
                </style>

                <!-- Header Title -->
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 54px; border-radius: 16px; background: rgba(42, 178, 123, 0.2); border: 2px solid #2ab27b; font-size: 26px; color: #2ab27b; margin-bottom: 12px; box-shadow: 0 0 20px rgba(42, 178, 123, 0.35);">
                    <i class="fa-solid fa-scissors"></i>
                </div>
                <h2 style="font-size: 24px; font-weight: 800; margin: 0 0 6px 0; color: #ffffff; letter-spacing: 0.3px;">🎧 Online Audio Cutter</h2>
                <p style="font-size: 13.5px; color: #94a3b8; margin: 0 0 16px 0;">Select any audio file, drag to highlight trim region, and cut to high-quality MP3</p>

                <!-- Audio File Selector -->
                <div class="audio-file-uploader" onclick="document.getElementById('fileInput').click();">
                    <i class="fa-solid fa-cloud-arrow-up" style="font-size: 32px; color: #2ab27b; margin-bottom: 8px; display: block;"></i>
                    <span style="font-size: 14px; font-weight: 700; color: #e2e8f0; display: block;">Click to choose Audio file</span>
                    <span style="font-size: 11.5px; color: #94a3b8; display: block; margin-top: 4px;">Supports MP3, WAV, AAC, M4A, OGG, FLAC &amp; all audio</span>
                    <input type="file" id="fileInput" accept="audio/*" style="display: none;">
                </div>

                <div id="selectedAudioNameBadge" style="display: none; margin: 6px auto 14px auto; font-size: 13px; color: #2ab27b; font-weight: 600; background: rgba(42, 178, 123, 0.12); padding: 5px 14px; border-radius: 20px; border: 1px solid rgba(42, 178, 123, 0.3); width: fit-content; max-width: 90%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>

                <!-- Waveform Container -->
                <div id="waveform"></div>

                <!-- Region Time Info Indicator -->
                <div id="trimmerRegionInfo" style="display: none; justify-content: center; align-items: center; gap: 14px; margin: 12px auto; font-size: 12px; color: #cbd5e1; flex-wrap: wrap;">
                    <span style="background: rgba(255,255,255,0.06); padding: 5px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12);">
                        <strong style="color: #2ab27b;">Start:</strong> <span id="trimStartVal">0.00s</span>
                    </span>
                    <span style="background: rgba(255,255,255,0.06); padding: 5px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12);">
                        <strong style="color: #007bff;">End:</strong> <span id="trimEndVal">0.00s</span>
                    </span>
                    <span style="background: rgba(255,255,255,0.06); padding: 5px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12);">
                        <strong style="color: #fbbf24;">Duration:</strong> <span id="trimDurVal">0.00s</span>
                    </span>
                </div>

                <!-- Control Buttons -->
                <div style="margin-top: 10px;">
                    <button id="playPause" class="trimmer-btn" disabled>
                        <i class="fa-solid fa-play"></i> Play
                    </button>
                    <button id="export" class="trimmer-btn" disabled>
                        <i class="fa-solid fa-file-arrow-down"></i> Cut &amp; Download MP3
                    </button>
                </div>

                <p id="status"></p>

            </div>
        </div>
    `;

    initMp3TrimmerSuite();
}

function initMp3TrimmerSuite() {
    ensureTrimmerLibrariesLoaded(() => {
        let wavesurfer = null;
        let currentBuffer = null;
        let activeRegion = null;

        const fileInput = document.getElementById("fileInput");
        const playPauseBtn = document.getElementById("playPause");
        const exportBtn = document.getElementById("export");
        const statusEl = document.getElementById("status");
        const regionInfoEl = document.getElementById("trimmerRegionInfo");
        const nameBadgeEl = document.getElementById("selectedAudioNameBadge");

        function updateTimeBadges(r) {
            if (!r) return;
            const startVal = document.getElementById("trimStartVal");
            const endVal = document.getElementById("trimEndVal");
            const durVal = document.getElementById("trimDurVal");
            if (regionInfoEl) regionInfoEl.style.display = "flex";
            if (startVal) startVal.textContent = r.start.toFixed(2) + "s";
            if (endVal) endVal.textContent = r.end.toFixed(2) + "s";
            if (durVal) durVal.textContent = (r.end - r.start).toFixed(2) + "s";
        }

        if (fileInput) {
            fileInput.addEventListener("change", async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;

                mp3TrimmerOriginalFileName = file.name || "audio.mp3";
                if (nameBadgeEl) {
                    nameBadgeEl.style.display = "block";
                    nameBadgeEl.innerHTML = '<i class="fa-solid fa-music" style="margin-right: 6px;"></i> ' + file.name;
                }

                statusEl.innerHTML = '<span class="spinner"></span> Loading waveform...';
                const blobURL = URL.createObjectURL(file);

                if (wavesurfer) {
                    try { wavesurfer.destroy(); } catch (err) {}
                    wavesurfer = null;
                }
                activeRegion = null;

                try {
                    // Initialize Regions plugin (WaveSurfer v7 compatible)
                    let regions = null;
                    if (window.WaveSurfer && window.WaveSurfer.Regions && typeof window.WaveSurfer.Regions.create === 'function') {
                        regions = window.WaveSurfer.Regions.create();
                    } else if (window.WaveSurfer && window.WaveSurfer.Regions && window.WaveSurfer.Regions.default && typeof window.WaveSurfer.Regions.default.create === 'function') {
                        regions = window.WaveSurfer.Regions.default.create();
                    } else if (window.RegionsPlugin && typeof window.RegionsPlugin.create === 'function') {
                        regions = window.RegionsPlugin.create();
                    } else if (window.RegionsPlugin && window.RegionsPlugin.default && typeof window.RegionsPlugin.default.create === 'function') {
                        regions = window.RegionsPlugin.default.create();
                    }

                    const plugins = regions ? [regions] : [];

                    wavesurfer = WaveSurfer.create({
                        container: "#waveform",
                        waveColor: "#bbb",
                        progressColor: "#2ab27b",
                        cursorColor: "#000",
                        height: 150,
                        plugins: plugins,
                    });
                    mp3TrimmerWaveSurfer = wavesurfer;

                    wavesurfer.load(blobURL);

                    if (regions) {
                        regions.enableDragSelection({ color: "rgba(0,150,136,0.25)" });

                        regions.on("region-created", (r) => {
                            if (activeRegion && activeRegion !== r) {
                                try { activeRegion.remove(); } catch (e) {}
                            }
                            activeRegion = r;
                            mp3TrimmerActiveRegion = r;
                            updateTimeBadges(r);
                        });

                        regions.on("region-updated", (r) => {
                            activeRegion = r;
                            mp3TrimmerActiveRegion = r;
                            updateTimeBadges(r);
                        });
                    }

                    wavesurfer.on("play", () => {
                        if (playPauseBtn) playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
                    });
                    wavesurfer.on("pause", () => {
                        if (playPauseBtn) playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Play';
                    });
                    wavesurfer.on("finish", () => {
                        if (playPauseBtn) playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Play';
                    });

                    wavesurfer.once("ready", async () => {
                        currentBuffer = await file.arrayBuffer();
                        mp3TrimmerAudioBuffer = currentBuffer;

                        // Create an initial default region if none exists
                        if (regions && !activeRegion) {
                            const dur = wavesurfer.getDuration() || 10;
                            const regEnd = Math.min(dur, Math.max(5, dur * 0.4));
                            activeRegion = regions.addRegion({
                                start: 0,
                                end: regEnd,
                                color: "rgba(0,150,136,0.25)"
                            });
                            mp3TrimmerActiveRegion = activeRegion;
                            updateTimeBadges(activeRegion);
                        }

                        statusEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#2ab27b"></i> Loaded! Drag on waveform to select trim region.';
                        playPauseBtn.disabled = false;
                        exportBtn.disabled = false;
                    });

                } catch (loadErr) {
                    console.error("WaveSurfer load error:", loadErr);
                    statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#e63946"></i> Error loading audio file.';
                }
            });
        }

        if (playPauseBtn) {
            playPauseBtn.addEventListener("click", () => {
                if (!wavesurfer) return;
                if (wavesurfer.isPlaying()) {
                    wavesurfer.pause();
                    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> Play';
                } else {
                    if (activeRegion) {
                        wavesurfer.play(activeRegion.start, activeRegion.end);
                    } else {
                        wavesurfer.play();
                    }
                    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
                }
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener("click", async () => {
                if (!activeRegion || !currentBuffer) {
                    alert("Please select a region first!");
                    return;
                }

                statusEl.innerHTML = '<span class="spinner"></span> 🎧 Processing MP3...';

                try {
                    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
                    const ctx = new AudioCtxClass();
                    const decoded = await ctx.decodeAudioData(currentBuffer.slice(0));
                    const sr = decoded.sampleRate;
                    const start = Math.max(0, activeRegion.start);
                    const end = Math.min(decoded.duration, activeRegion.end);
                    const length = Math.floor((end - start) * sr);
                    const ch = decoded.numberOfChannels;

                    if (length <= 0) {
                        statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#e63946"></i> Selected region is too short.';
                        return;
                    }

                    // new buffer
                    const newBuf = ctx.createBuffer(ch, length, sr);
                    for (let i = 0; i < ch; i++) {
                        newBuf.getChannelData(i).set(
                            decoded.getChannelData(i).slice(start * sr, end * sr)
                        );
                    }

                    // ✅ Encode to MP3 safely using lamejs
                    const EncoderClass = (window.lamejs && window.lamejs.Mp3Encoder) ? window.lamejs.Mp3Encoder : (typeof lamejs !== 'undefined' ? lamejs.Mp3Encoder : null);
                    if (!EncoderClass) {
                        throw new Error("LAME MP3 encoder library not found");
                    }

                    const mp3enc = new EncoderClass(ch, sr, 128);
                    const block = 1152;
                    const left = newBuf.getChannelData(0);
                    const right = ch > 1 ? newBuf.getChannelData(1) : left;
                    const mp3Data = [];

                    for (let i = 0; i < left.length; i += block) {
                        const leftChunk = left.subarray(i, i + block);
                        const rightChunk = right.subarray(i, i + block);
                        const l16 = floatTo16Bit(leftChunk);
                        const r16 = floatTo16Bit(rightChunk);
                        const buf = mp3enc.encodeBuffer(l16, r16);
                        if (buf.length > 0) mp3Data.push(buf);
                    }

                    const flush = mp3enc.flush();
                    if (flush.length > 0) mp3Data.push(flush);

                    const blob = new Blob(mp3Data, { type: "audio/mp3" });
                    const cleanBaseName = mp3TrimmerOriginalFileName ? mp3TrimmerOriginalFileName.replace(/\.[^/.]+$/, "") : "audio";
                    const finalDownloadName = cleanBaseName + "_trimmed.mp3";

                    // Trigger Universal Chrome-style download engine & Android Native MediaStore
                    if (typeof window.downloadFileToDevice === 'function') {
                        window.downloadFileToDevice(blob, finalDownloadName, "audio/mp3");
                    } else {
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = finalDownloadName;
                        a.click();
                    }

                    statusEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#2ab27b"></i> MP3 Download Complete!';

                } catch (err) {
                    console.error("Error processing MP3:", err);
                    statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#e63946"></i> Error: Unable to process audio. ' + (err.message || "");
                }
            });
        }

        function floatTo16Bit(float32Array) {
            const int16 = new Int16Array(float32Array.length);
            for (let i = 0; i < float32Array.length; i++) {
                let s = Math.max(-1, Math.min(1, float32Array[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            return int16;
        }
    });
}

// ==========================================
// QR CODE GENERATOR SUITE
// ==========================================
let qrCodeInstance = null;

window.openQrCodeSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openQrCodeSection(e))) {
            return false;
        }
    }

    isInQrCodeView = true;
    isInMp3TrimmerView = false;
    if (typeof cleanupMp3Trimmer === 'function') {
        cleanupMp3Trimmer();
    }
    isInExtraToolsView = false;
    isInStore35View = false;
    isInGifMakerView = false;
    isInVoiceRecorderView = false;
    if (typeof cleanupVoiceRecorder === 'function') {
        cleanupVoiceRecorder();
    }
    isInSketchView = false;
    isInCompressorView = false;
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'qr-code') {
            url.searchParams.set('view', 'qr-code');
            window.history.replaceState({ view: 'qr-code' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Extra Tools...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderQrCodePage();
    return false;
};

function ensureQrCodeLibraryLoaded(callback) {
    if (typeof window.QRCode !== 'undefined') {
        callback();
        return;
    }

    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => callback();
    s.onerror = () => {
        console.warn('Failed to load QRCode.js from cdnjs, trying unpkg fallback');
        const s2 = document.createElement('script');
        s2.src = 'https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js';
        s2.onload = () => callback();
        s2.onerror = () => callback();
        document.head.appendChild(s2);
    };
    document.head.appendChild(s);
}

function renderQrCodePage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    qrCodeInstance = null;

    container.innerHTML = `
        <div style="max-width: 860px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <!-- Top Navigation Controls -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.2s;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window.openChromeDownloadsModal();" style="padding: 9px 14px; background: rgba(66, 133, 244, 0.18); border: 1px solid rgba(66, 133, 244, 0.45); color: #8ab4f8; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-download"></i> Downloads
                    </button>
                    <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-house"></i> Home
                    </button>
                </div>
            </div>

            <!-- Main QR Card -->
            <div id="qrcode-main-card" style="background: linear-gradient(145deg, #121927 0%, #0b101c 100%); border: 1.5px solid rgba(0, 123, 255, 0.5); border-radius: 20px; padding: 28px 20px; box-shadow: 0 16px 40px rgba(0,0,0,0.6); text-align: center;">

                <style>
                .qr-input-field {
                    padding: 14px 18px;
                    width: 100%;
                    max-width: 460px;
                    font-size: 15.5px;
                    margin: 12px auto;
                    display: block;
                    background: #182236;
                    border: 2px solid rgba(0, 123, 255, 0.45);
                    border-radius: 12px;
                    color: #ffffff;
                    outline: none;
                    transition: all 0.2s ease;
                    box-sizing: border-box;
                }
                .qr-input-field:focus {
                    border-color: #007bff;
                    box-shadow: 0 0 14px rgba(0, 123, 255, 0.4);
                }
                .qr-input-field::placeholder {
                    color: #718096;
                }
                .qr-btn {
                    padding: 12px 24px;
                    font-size: 14.5px;
                    cursor: pointer;
                    background-color: #007BFF;
                    color: white;
                    border: none;
                    border-radius: 10px;
                    margin: 6px;
                    font-weight: 700;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                    box-shadow: 0 4px 14px rgba(0, 123, 255, 0.35);
                }
                .qr-btn:hover {
                    background-color: #0056b3;
                    transform: translateY(-1px);
                }
                .qr-btn:active {
                    transform: scale(0.97);
                }
                .qr-btn-download {
                    background-color: #2ab27b;
                    box-shadow: 0 4px 14px rgba(42, 178, 123, 0.35);
                }
                .qr-btn-download:hover {
                    background-color: #219664;
                }
                #qrcode {
                    margin: 22px auto;
                    display: inline-block;
                    padding: 16px;
                    background: #ffffff;
                    border-radius: 16px;
                    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45);
                    min-height: 200px;
                    min-width: 200px;
                }
                #qrcode img, #qrcode canvas {
                    margin: 0 auto;
                    display: block;
                    border-radius: 4px;
                }
                .qr-preset-chip {
                    padding: 6px 13px;
                    background: rgba(255, 255, 255, 0.07);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    color: #cbd5e1;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .qr-preset-chip:hover {
                    background: rgba(0, 123, 255, 0.25);
                    border-color: #007bff;
                    color: #fff;
                }
                </style>

                <!-- Header Icon & Title -->
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 16px; background: rgba(0, 123, 255, 0.2); border: 2px solid #007bff; font-size: 26px; color: #007bff; margin-bottom: 12px; box-shadow: 0 0 20px rgba(0, 123, 255, 0.35);">
                    <i class="fa-solid fa-qrcode"></i>
                </div>
                <h1 style="font-size: 25px; font-weight: 800; margin: 0 0 6px 0; color: #ffffff; letter-spacing: 0.3px;">QR Code Generator</h1>
                <p style="font-size: 13.5px; color: #94a3b8; margin: 0 0 16px 0;">Enter your text, website URL, contact, or link to create and download a custom QR code.</p>

                <!-- Quick Presets -->
                <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 16px;">
                    <button type="button" class="qr-preset-chip" onclick="window.setQrPreset('https://google.com')"><i class="fa-solid fa-globe"></i> Website URL</button>
                    <button type="button" class="qr-preset-chip" onclick="window.setQrPreset('https://wa.me/919876543210?text=Hello')"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
                    <button type="button" class="qr-preset-chip" onclick="window.setQrPreset('WIFI:S:MyHomeWiFi;T:WPA;P:MyPassword;;')"><i class="fa-solid fa-wifi"></i> WiFi</button>
                    <button type="button" class="qr-preset-chip" onclick="window.setQrPreset('Hello! Welcome to our service.')"><i class="fa-solid fa-align-left"></i> Plain Text</button>
                </div>

                <!-- Input Field -->
                <div style="position: relative; max-width: 460px; margin: 0 auto;">
                    <input autocomplete="off" type="text" id="text" class="qr-input-field" placeholder="Enter text or URL" onkeydown="if(event.key === 'Enter') window.generateQRCode();">
                    <button type="button" onclick="const t = document.getElementById('text'); if(t){ t.value = ''; t.focus(); }" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94a3b8; cursor: pointer; padding: 6px; font-size: 14px;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Size Selection -->
                <div style="display: flex; justify-content: center; align-items: center; gap: 12px; margin: 12px auto; font-size: 13px; color: #cbd5e1; flex-wrap: wrap;">
                    <span style="font-weight: 600;"><i class="fa-solid fa-expand" style="color: #007bff; margin-right: 5px;"></i> Size:</span>
                    <label style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <input type="radio" name="qrSizeOption" value="180" style="accent-color: #007bff;"> 180px
                    </label>
                    <label style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <input type="radio" name="qrSizeOption" value="220" checked style="accent-color: #007bff;"> 220px
                    </label>
                    <label style="cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                        <input type="radio" name="qrSizeOption" value="300" style="accent-color: #007bff;"> 300px (HD)
                    </label>
                </div>

                <!-- Action Buttons -->
                <div style="margin-top: 10px;">
                    <button id="generateBtn" class="qr-btn" onclick="window.generateQRCode()">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate QR Code
                    </button>
                    <button id="downloadBtn" class="qr-btn qr-btn-download" style="display: none;" onclick="window.downloadQRCode()">
                        <i class="fa-solid fa-download"></i> Download QR Code
                    </button>
                </div>

                <!-- QR Code Output Container -->
                <div style="margin-top: 15px;">
                    <div id="qrcode">
                        <div id="qrcodePlaceholder" style="padding: 40px 20px; color: #64748b; font-size: 13px; font-weight: 500; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-qrcode" style="font-size: 48px; color: #cbd5e1; margin-bottom: 10px;"></i>
                            <span>Your QR Code will appear here</span>
                        </div>
                    </div>
                </div>

                <!-- Status Feedback -->
                <p id="qrStatus" style="margin-top: 12px; font-weight: 600; font-size: 14px; min-height: 24px; color: #e2e8f0; font-family: 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;"></p>

            </div>
        </div>
    `;

    // Ensure QRCode library is ready
    ensureQrCodeLibraryLoaded(() => {
        const textInput = document.getElementById("text");
        if (textInput) {
            textInput.value = "";
            textInput.focus();
        }
    });
}

window.setQrPreset = function(presetText) {
    const textInput = document.getElementById("text");
    if (textInput) {
        textInput.value = presetText;
        textInput.focus();
        window.generateQRCode();
    }
};

window.generateQRCode = function() {
    ensureQrCodeLibraryLoaded(() => {
        const textInput = document.getElementById("text");
        const qrContainer = document.getElementById("qrcode");
        const downloadBtn = document.getElementById("downloadBtn");
        const statusEl = document.getElementById("qrStatus");

        if (!textInput || !qrContainer) return;

        const qrText = textInput.value;

        // Clear previous QR Code & hide download button
        qrContainer.innerHTML = "";
        window._lastQrDataUrl = null;
        if (downloadBtn) downloadBtn.style.display = "none";
        if (statusEl) statusEl.innerHTML = "";

        if (!qrText || qrText.trim() === "") {
            alert("Please enter some text or URL!");
            if (qrContainer) {
                qrContainer.innerHTML = `
                    <div style="padding: 40px 20px; color: #64748b; font-size: 13px; font-weight: 500; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 40px; color: #f59e0b; margin-bottom: 10px;"></i>
                        <span>Please enter text or URL above</span>
                    </div>
                `;
            }
            return;
        }

        // Get size option
        let selectedSize = 220;
        const sizeRadios = document.getElementsByName("qrSizeOption");
        for (let i = 0; i < sizeRadios.length; i++) {
            if (sizeRadios[i].checked) {
                selectedSize = parseInt(sizeRadios[i].value, 10) || 220;
                break;
            }
        }

        if (statusEl) {
            statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#007bff"></i> Generating QR Code...';
        }

        try {
            const QRCodeClass = window.QRCode;
            if (!QRCodeClass) {
                throw new Error("QRCode library is not loaded yet");
            }

            qrCodeInstance = new QRCodeClass(qrContainer, {
                text: qrText,
                width: selectedSize,
                height: selectedSize,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: (QRCodeClass.CorrectLevel && QRCodeClass.CorrectLevel.H) ? QRCodeClass.CorrectLevel.H : 2
            });

            // Extract dataUrl and show download button
            setTimeout(() => {
                const dataUrl = window.extractQrDataUrl ? window.extractQrDataUrl() : '';
                if (dataUrl) {
                    window._lastQrDataUrl = dataUrl;
                }
                if (downloadBtn) {
                    downloadBtn.style.display = "inline-flex";
                }
                if (statusEl) {
                    statusEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#2ab27b"></i> QR Code generated successfully! Tap Download to save.';
                }
            }, 100);

        } catch (err) {
            console.error("Error generating QR Code:", err);
            if (statusEl) {
                statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#e63946"></i> Error generating QR code: ' + (err.message || "");
            }
        }
    });
};

window.extractQrDataUrl = function() {
    const qrContainer = document.getElementById("qrcode");
    if (!qrContainer) return "";

    // 1. Locate raw render element (canvas or img generated by QRCode.js)
    const rawCanvas = qrContainer.querySelector("canvas");
    const rawImg = qrContainer.querySelector("img");

    let sourceEl = null;
    if (rawCanvas && rawCanvas.width > 0 && rawCanvas.height > 0) {
        sourceEl = rawCanvas;
    } else if (rawImg && (rawImg.naturalWidth > 0 || rawImg.width > 0)) {
        sourceEl = rawImg;
    } else if (rawImg && rawImg.src && rawImg.src.startsWith("data:image/")) {
        sourceEl = rawImg;
    }

    if (!sourceEl) return "";

    try {
        // High-Definition Export with Official ISO/IEC 18004 Quiet Zone (White Border)
        // Standard QR code readers require a minimum 4-module quiet zone on all 4 sides.
        // Without this white border, camera & scanner algorithms fail when shared or viewed in dark backgrounds.
        const exportSize = 640;
        const quietZone = 48; // 48px pure white quiet zone margin
        const qrDrawSize = exportSize - (quietZone * 2); // 544px

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = exportSize;
        exportCanvas.height = exportSize;
        const ctx = exportCanvas.getContext("2d");

        if (ctx) {
            // Fill 100% solid, opaque pure white background
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, exportSize, exportSize);

            // Disable anti-aliasing / pixel-blur so black modules stay 100% crisp and readable
            ctx.imageSmoothingEnabled = false;
            if ('mozImageSmoothingEnabled' in ctx) ctx.mozImageSmoothingEnabled = false;
            if ('webkitImageSmoothingEnabled' in ctx) ctx.webkitImageSmoothingEnabled = false;
            if ('msImageSmoothingEnabled' in ctx) ctx.msImageSmoothingEnabled = false;

            // Draw QR code centered within the white quiet zone
            ctx.drawImage(sourceEl, quietZone, quietZone, qrDrawSize, qrDrawSize);

            const finalDataUrl = exportCanvas.toDataURL("image/png");
            if (finalDataUrl && finalDataUrl.startsWith("data:image/") && finalDataUrl.length > 100) {
                return finalDataUrl;
            }
        }
    } catch (err) {
        console.warn("Quiet-zone canvas export warning:", err);
    }

    // Direct fallback
    if (rawCanvas && rawCanvas.width > 0) {
        try { return rawCanvas.toDataURL("image/png"); } catch (e) {}
    }
    if (rawImg && rawImg.src && rawImg.src.startsWith("data:image/")) {
        return rawImg.src;
    }

    return "";
};

window.downloadQRCode = function() {
    const textInput = document.getElementById("text");

    let dataUrl = (window._lastQrDataUrl && window._lastQrDataUrl.startsWith("data:image/")) 
        ? window._lastQrDataUrl 
        : (window.extractQrDataUrl ? window.extractQrDataUrl() : "");

    // If QR Code not yet rendered, but text is entered in input field:
    if (!dataUrl) {
        const textVal = textInput ? textInput.value.trim() : "";
        if (textVal) {
            window.generateQRCode();
            setTimeout(() => {
                window.downloadQRCode();
            }, 250);
            return;
        } else {
            if (typeof window.showDownloadToast === 'function') {
                window.showDownloadToast("Please enter text or URL to generate QR Code", "error");
            } else {
                alert("Please enter text or URL to generate QR Code");
            }
            return;
        }
    }

    try {
        // Trigger Google Chrome Download Manager (Identical to Pencil Sketch, Image Compressor, GIF Maker & Audio tools)
        window.downloadFileToDevice(dataUrl, "qrcode.png", "image/png");
    } catch (err) {
        console.error("Error downloading QR Code:", err);
        if (typeof window.showDownloadToast === 'function') {
            window.showDownloadToast("Download error: " + (err.message || "Failed"), "error");
        }
    }
};

// ==========================================
// COOL TEXT GENERATOR SUITE
// ==========================================
window.openCoolTextSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openCoolTextSection(e))) {
            return false;
        }
    }

    isInCoolTextView = true;
    isInTranslatorView = false;
    isInQrCodeView = false;
    isInMp3TrimmerView = false;
    if (typeof cleanupMp3Trimmer === 'function') {
        cleanupMp3Trimmer();
    }
    isInExtraToolsView = false;
    isInStore35View = false;
    isInGifMakerView = false;
    isInVoiceRecorderView = false;
    if (typeof cleanupVoiceRecorder === 'function') {
        cleanupVoiceRecorder();
    }
    isInSketchView = false;
    isInCompressorView = false;
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'cool-text') {
            url.searchParams.set('view', 'cool-text');
            window.history.replaceState({ view: 'cool-text' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Extra Tools...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderCoolTextPage();
    return false;
};

function renderCoolTextPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 960px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <!-- Top Navigation Controls -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.2s;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window.openChromeDownloadsModal();" style="padding: 9px 15px; background: rgba(66, 133, 244, 0.18); border: 1px solid rgba(66, 133, 244, 0.45); color: #8ab4f8; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                        <i class="fa-solid fa-download"></i> Downloads
                    </button>
                    <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-house"></i> Home
                    </button>
                </div>
            </div>

            <style>
            #coolTextPro {
              max-width:920px;margin:18px auto;background:rgba(255,255,255,0.92);
              backdrop-filter:blur(6px);border-radius:14px;padding:16px;
              box-shadow:0 8px 28px rgba(16,24,40,0.08);color:#111;
              font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Bengali","Hind Siliguri",Arial,sans-serif
            }
            #coolTextPro .controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
            #coolTextPro .controls>*{margin:4px}
            #coolTextPro .control-group{display:flex;gap:8px;align-items:center}
            #coolTextPro label.small{font-size:13px;color:#374151}
            #coolTextPro input[type="text"],#coolTextPro select,#coolTextPro input[type="number"]{
              padding:8px 10px;border-radius:8px;border:1px solid #d1d5db;background:#fff;min-height:36px;color:#111;
            }
            #coolTextPro input[type="color"]{width:44px;height:36px;border-radius:8px;border:1px solid #e5e7eb;padding:0;cursor:pointer;}
            #coolTextPro button.primary{background:#0369a1;color:#fff;border:none;padding:9px 14px;border-radius:8px;cursor:pointer;font-weight:600;transition:0.2s;}
            #coolTextPro button.primary:hover{background:#0284c7;}
            #coolTextPro button.ghost{background:transparent;border:1px solid #c7cbd1;padding:8px 12px;border-radius:8px;cursor:pointer;color:#111;font-weight:600;transition:0.2s;}
            #coolTextPro button.ghost:hover{background:#f3f4f6;}
            #coolTextPro .canvas-wrap{display:flex;justify-content:center;margin-top:12px;overflow-x:auto;}
            #coolTextPro #logoCanvas{background:transparent;border-radius:10px;border:1px dashed rgba(0,0,0,0.06);max-width:100%;height:auto;}
            #coolTextPro .note{font-size:13px;color:#4b5563;margin-top:8px}
            #coolTextPro .bold-btn{
              width:54px;height:36px;
              border:1px solid #ccc;
              border-radius:8px;
              background:linear-gradient(to bottom,#f9fafb,#f3f4f6);
              font-weight:bold;font-size:17px;
              cursor:pointer;transition:0.2s;
              box-shadow:inset 0 0 2px rgba(0,0,0,0.1);
              color:#111;
            }
            #coolTextPro .bold-btn.active{
              background:#0369a1;
              color:#fff;
              border-color:#0369a1;
              box-shadow:inset 0 2px 4px rgba(255,255,255,0.3);
            }
            #coolTextPro .bold-btn:hover{transform:scale(1.05);}
            @media (max-width:720px){#coolTextPro .controls{flex-direction:column;align-items:stretch}}
            </style>

            <div id="coolTextPro">
              <h3 style="margin-top: 4px; margin-bottom: 14px; color: #0f172a; font-size: 19px; font-weight: 700;">Cool Text Generator Online | Create Stylish Logo & Font Effects Free</h3>

              <div class="controls">
                <input autocomplete="off" id="txt" type="text" value="Cool Text" placeholder="Enter text" style="width:300px">
                <select id="font" style="min-width:180px">
                  <option value="Arial">Arial</option>
                  <option value="Verdana">Verdana</option>
                  <option value="Georgia">Georgia</option>
                  <option value="'Courier New'">Courier</option>
                  <option value="Impact">Impact</option>
                  <option value="'Orbitron', sans-serif">Aero (Orbitron)</option>
                  <option value="'Montserrat', sans-serif">Montserrat</option>
                  <option value="'Lobster', cursive">Lobster</option>
                  <option value="'Poppins', sans-serif">Poppins</option>
                  <option value="'Pacifico', cursive">Pacifico</option>
                  <option value="'Noto Sans Bengali', sans-serif">বাংলা — Noto Sans Bengali</option>
                  <option value="'Hind Siliguri', sans-serif">বাংলা — Hind Siliguri</option>
                </select>
                <div class="control-group">
                  <label class="small">Size</label><input id="size" type="number" value="130" min="20" max="300" style="width:90px">
                </div>
                <button id="boldBtn" type="button" class="bold-btn active"><b>Bold</b></button>
                <button class="primary" onclick="window.renderLogo()">Generate</button>
                <button class="ghost" onclick="window.downloadLogo()">Download PNG</button>
              </div>

              <div class="controls">
                <div class="control-group"><label class="small">Gradient 1</label><input id="grad1" type="color" value="#00c6ff"></div>
                <div class="control-group"><label class="small">Gradient 2</label><input id="grad2" type="color" value="#0072ff"></div>
                <div class="control-group"><label class="small">Outline</label><input id="outline" type="color" value="#ffffff"></div>
                <div class="control-group"><label class="small">Outline Width</label><input id="outlineWidth" type="number" value="0" min="0" max="40" style="width:80px"></div>
                <div class="control-group"><label class="small">Shadow</label><input id="shadowColor" type="color" value="#000000"></div>
              </div>

              <div class="canvas-wrap">
                <canvas id="logoCanvas" width="900" height="350"></canvas>
              </div>
            </div>
        </div>
    `;

    initCoolTextGenerator();
}

function initCoolTextGenerator() {
    const txtEl = document.getElementById('txt');
    const fontEl = document.getElementById('font');
    const sizeEl = document.getElementById('size');
    const grad1El = document.getElementById('grad1');
    const grad2El = document.getElementById('grad2');
    const outlineEl = document.getElementById('outline');
    const outlineWidthEl = document.getElementById('outlineWidth');
    const shadowColorEl = document.getElementById('shadowColor');
    const canvas = document.getElementById('logoCanvas');
    if (!canvas || !txtEl) return;
    const ctx = canvas.getContext('2d');

    const boldBtn = document.getElementById('boldBtn');
    let isBold = true;
    if (boldBtn) {
        boldBtn.onclick = function() {
            isBold = !isBold;
            boldBtn.classList.toggle('active', isBold);
            renderLogo();
        };
    }

    function hexToRGBA(hex, a) {
        const h = (hex || '#000000').replace('#', '');
        return `rgba(${parseInt(h.substr(0, 2), 16) || 0},${parseInt(h.substr(2, 2), 16) || 0},${parseInt(h.substr(4, 2), 16) || 0},${a})`;
    }

    function renderLogo() {
        const text = txtEl ? (txtEl.value || '') : '';
        const font = fontEl ? fontEl.value : 'Arial';
        const size = (sizeEl && parseInt(sizeEl.value, 10)) || 120;
        const g1 = grad1El ? grad1El.value : '#00c6ff';
        const g2 = grad2El ? grad2El.value : '#0072ff';
        const outline = outlineEl ? outlineEl.value : '#ffffff';
        const outlineW = (outlineWidthEl && parseInt(outlineWidthEl.value, 10)) || 0;
        const shadowColor = shadowColorEl ? shadowColorEl.value : '#000000';

        const w = 900, h = 350;
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${isBold ? 'bold ' : ''}${size}px ${font}`;
        const cx = w / 2, cy = h / 2;

        for (let i = 18; i >= 1; i--) {
            ctx.fillStyle = hexToRGBA(shadowColor, 0.06 + (i / 18) * 0.22);
            ctx.fillText(text, cx + i, cy + i);
        }

        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, g1);
        grad.addColorStop(1, g2);
        ctx.fillStyle = grad;
        ctx.fillText(text, cx, cy);

        if (outlineW > 0) {
            ctx.lineWidth = outlineW;
            ctx.strokeStyle = outline;
            ctx.strokeText(text, cx, cy);
        }
    }

    function downloadLogo() {
        const text = txtEl ? (txtEl.value || '') : '';
        const font = fontEl ? fontEl.value : 'Arial';
        const size = (sizeEl && parseInt(sizeEl.value, 10)) || 120;
        const g1 = grad1El ? grad1El.value : '#00c6ff';
        const g2 = grad2El ? grad2El.value : '#0072ff';
        const outline = outlineEl ? outlineEl.value : '#ffffff';
        const outlineW = (outlineWidthEl && parseInt(outlineWidthEl.value, 10)) || 0;
        const shadowColor = shadowColorEl ? shadowColorEl.value : '#000000';

        const temp = document.createElement('canvas');
        const tctx = temp.getContext('2d');
        tctx.font = `${isBold ? 'bold ' : ''}${size}px ${font}`;
        const metrics = tctx.measureText(text);
        const w = Math.ceil(metrics.width + 80);
        const h = Math.ceil(size + 120);
        temp.width = w;
        temp.height = h;
        const cx = w / 2, cy = h / 2;

        tctx.textAlign = 'center';
        tctx.textBaseline = 'middle';
        tctx.font = `${isBold ? 'bold ' : ''}${size}px ${font}`;

        for (let i = 18; i >= 1; i--) {
            tctx.fillStyle = hexToRGBA(shadowColor, 0.08 + (i / 18) * 0.25);
            tctx.fillText(text, cx + i, cy + i);
        }

        const grad = tctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, g1);
        grad.addColorStop(1, g2);
        tctx.fillStyle = grad;
        tctx.fillText(text, cx, cy);

        if (outlineW > 0) {
            tctx.lineWidth = outlineW;
            tctx.strokeStyle = outline;
            tctx.strokeText(text, cx, cy);
        }

        const dataUrl = temp.toDataURL('image/png');
        if (typeof window.downloadFileToDevice === 'function') {
            window.downloadFileToDevice(dataUrl, 'cooltext_cropped.png', 'image/png');
        } else {
            const link = document.createElement('a');
            link.download = 'cooltext_cropped.png';
            link.href = dataUrl;
            link.click();
        }
    }

    window.renderLogo = renderLogo;
    window.downloadLogo = downloadLogo;

    renderLogo();

    if (document.fonts && typeof document.fonts.ready !== 'undefined') {
        document.fonts.ready.then(() => {
            renderLogo();
        }).catch(() => {});
    }

    [txtEl, fontEl, sizeEl, grad1El, grad2El, outlineEl, outlineWidthEl, shadowColorEl].forEach(el => {
        if (!el) return;
        el.addEventListener('input', () => {
            clearTimeout(window.deb);
            window.deb = setTimeout(renderLogo, 220);
        });
        el.addEventListener('change', () => {
            renderLogo();
        });
    });
}

// ==========================================
// TRANSLATOR SUITE (60+ LANGUAGES)
// ==========================================
window.openTranslatorSection = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openTranslatorSection(e))) {
            return false;
        }
    }

    isInTranslatorView = true;
    isInCoolTextView = false;
    isInQrCodeView = false;
    isInMp3TrimmerView = false;
    if (typeof cleanupMp3Trimmer === 'function') {
        cleanupMp3Trimmer();
    }
    isInExtraToolsView = false;
    isInStore35View = false;
    isInGifMakerView = false;
    isInVoiceRecorderView = false;
    if (typeof cleanupVoiceRecorder === 'function') {
        cleanupVoiceRecorder();
    }
    isInSketchView = false;
    isInCompressorView = false;
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'translator') {
            url.searchParams.set('view', 'translator');
            window.history.replaceState({ view: 'translator' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search Extra Tools...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderTranslatorPage();
    return false;
};

function renderTranslatorPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 920px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <!-- Top Navigation Controls -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.2s;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <div style="display: flex; gap: 8px;">
                    <button onclick="window.openChromeDownloadsModal();" style="padding: 9px 15px; background: rgba(66, 133, 244, 0.18); border: 1px solid rgba(66, 133, 244, 0.45); color: #8ab4f8; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                        <i class="fa-solid fa-download"></i> Downloads
                    </button>
                    <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-house"></i> Home
                    </button>
                </div>
            </div>

            <!-- Translator Container Styled Box -->
            <style>
            #translatorAppWrap {
                max-width: 900px;
                margin: 16px auto;
                background: rgba(255, 255, 255, 0.94);
                backdrop-filter: blur(8px);
                border-radius: 18px;
                padding: 24px 20px;
                box-shadow: 0 12px 35px rgba(0, 0, 0, 0.35);
                color: #1e293b;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif;
            }
            #translatorAppWrap textarea {
                width: 100%;
                height: 125px;
                padding: 12px 14px;
                border: 1.5px solid #cbd5e1;
                border-radius: 10px;
                font-size: 15px;
                margin-bottom: 14px;
                box-sizing: border-box;
                font-family: inherit;
                outline: none;
                resize: vertical;
                transition: border-color 0.2s;
                background: #ffffff;
                color: #0f172a;
            }
            #translatorAppWrap textarea:focus {
                border-color: #22c55e;
                box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
            }
            #translatorAppWrap .lang-select {
                display: flex;
                gap: 10px;
                align-items: center;
                flex-wrap: wrap;
                margin-bottom: 14px;
            }
            #translatorAppWrap select {
                flex: 1;
                min-width: 180px;
                padding: 11px 12px;
                border-radius: 10px;
                border: 1.5px solid #cbd5e1;
                font-size: 14.5px;
                font-weight: 500;
                background: #ffffff;
                color: #0f172a;
                outline: none;
                cursor: pointer;
            }
            #translatorAppWrap select:focus {
                border-color: #22c55e;
            }
            #translatorAppWrap .swap-lang-btn {
                width: 44px;
                height: 42px;
                border-radius: 10px;
                background: #f1f5f9;
                border: 1px solid #cbd5e1;
                color: #475569;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            }
            #translatorAppWrap .swap-lang-btn:hover {
                background: #e2e8f0;
                color: #16a34a;
                transform: rotate(180deg);
            }
            #translatorAppWrap button.translate-btn {
                width: 100%;
                padding: 13px 20px;
                background: #4CAF50;
                color: white;
                font-size: 16px;
                font-weight: 700;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                box-shadow: 0 4px 14px rgba(76, 175, 80, 0.35);
                transition: background 0.2s, transform 0.1s;
            }
            #translatorAppWrap button.translate-btn:hover {
                background: #45a049;
            }
            #translatorAppWrap button.translate-btn:active {
                transform: scale(0.99);
            }
            #translatorAppWrap #outputText {
                margin-top: 16px;
                min-height: 70px;
                padding: 14px 16px;
                border: 1.5px solid #e2e8f0;
                border-radius: 10px;
                background: #f8fafc;
                font-size: 15.5px;
                line-height: 1.6;
                color: #1e293b;
                word-break: break-word;
                position: relative;
            }
            #translatorAppWrap .translating {
                text-align: center;
                font-weight: bold;
                color: #ff9800;
                display: block;
            }
            #translatorAppWrap .output-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 8px;
            #translatorAppWrap .copy-btn {
                padding: 6px 12px;
                background: #f1f5f9;
                border: 1px solid #cbd5e1;
                border-radius: 7px;
                font-size: 12.5px;
                font-weight: 600;
                color: #334155;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: 0.2s;
            }
            #translatorAppWrap .copy-btn:hover {
                background: #e2e8f0;
                color: #16a34a;
            }
            #translatorAppWrap .translator-mic-btn {
                padding: 7px 14px;
                border-radius: 9px;
                border: 1.5px solid #10b981;
                background: #ecfdf5;
                color: #065f46;
                font-size: 13.5px;
                font-weight: 700;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 7px;
                transition: all 0.2s ease;
                box-shadow: 0 1px 3px rgba(16, 185, 129, 0.15);
            }
            #translatorAppWrap .translator-mic-btn:hover {
                background: #10b981;
                color: #ffffff;
                box-shadow: 0 3px 10px rgba(16, 185, 129, 0.3);
                transform: translateY(-1px);
            }
            #translatorAppWrap .translator-mic-btn.listening {
                background: #ef4444 !important;
                border-color: #dc2626 !important;
                color: #ffffff !important;
                animation: micPulseAnim 1.2s infinite ease-in-out;
            }
            @keyframes micPulseAnim {
                0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); transform: scale(1); }
                50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); transform: scale(1.02); }
                100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); transform: scale(1); }
            }
            #translatorAppWrap .translator-clear-btn {
                padding: 6px 12px;
                border-radius: 8px;
                border: 1px solid #cbd5e1;
                background: #f8fafc;
                color: #64748b;
                font-size: 12.5px;
                font-weight: 600;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                transition: all 0.2s ease;
            }
            #translatorAppWrap .translator-clear-btn:hover {
                background: #fee2e2;
                border-color: #fca5a5;
                color: #dc2626;
            }
            #translatorAppWrap .mic-status-bar {
                display: none;
                align-items: center;
                gap: 9px;
                margin-bottom: 10px;
                padding: 9px 14px;
                background: #fef2f2;
                border: 1.5px solid #fecaca;
                border-radius: 9px;
                font-size: 13.5px;
                color: #991b1b;
                animation: fadeIn 0.2s ease;
            }
            #translatorAppWrap .mic-pulse-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #ef4444;
                display: inline-block;
                animation: blinkDot 1s infinite alternate;
                flex-shrink: 0;
            }
            @keyframes blinkDot {
                from { opacity: 0.35; transform: scale(0.85); }
                to { opacity: 1; transform: scale(1.15); }
            }
            @media(max-width:550px){
                #translatorAppWrap .lang-select { flex-direction: column; align-items: stretch; }
                #translatorAppWrap .swap-lang-btn { align-self: center; transform: rotate(90deg); }
                #translatorAppWrap .swap-lang-btn:hover { transform: rotate(270deg); }
            }
            </style>

            <div id="translatorAppWrap">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(76, 175, 80, 0.15); display: flex; align-items: center; justify-content: center; color: #4CAF50; font-size: 20px;">
                            <i class="fa-solid fa-language"></i>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 19px; font-weight: 800; color: #0f172a;">Translator Online</h3>
                            <span style="font-size: 12px; color: #64748b;">Instant Translation & Voice Typing Across 60+ Languages</span>
                        </div>
                    </div>
                    <span style="font-size: 12px; color: #16a34a; font-weight: 700; background: rgba(34, 197, 94, 0.12); padding: 4px 10px; border-radius: 14px;">
                        <i class="fa-solid fa-microphone"></i> Voice Enabled
                    </span>
                </div>

                <div class="container" style="max-width: 100%;">
                    <!-- Input Header with Mic Button and Clear Button -->
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                        <span style="font-size: 13px; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-pen-to-square"></i> Input Text
                        </span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button id="translatorClearBtn" type="button" class="translator-clear-btn" onclick="window.clearTranslatorInput()" style="display: none;" title="Clear input text">
                                <i class="fa-solid fa-xmark"></i> Clear
                            </button>
                            <button id="translatorMicBtn" type="button" class="translator-mic-btn" onclick="window.toggleTranslatorVoiceInput()" title="Speak to enter text without typing">
                                <i class="fa-solid fa-microphone"></i>
                                <span id="translatorMicLabel">Voice Typing</span>
                            </button>
                        </div>
                    </div>

                    <!-- Live Voice Listening Status Bar -->
                    <div id="translatorMicStatus" class="mic-status-bar">
                        <span class="mic-pulse-dot"></span>
                        <span id="translatorMicStatusText">Listening... Speak into your mic</span>
                        <button type="button" onclick="window.stopTranslatorVoiceInput()" style="margin-left: auto; background: none; border: none; color: #b91c1c; font-weight: 700; cursor: pointer; font-size: 12px; padding: 2px 6px;">
                            Stop <i class="fa-solid fa-circle-stop"></i>
                        </button>
                    </div>

                    <textarea id="inputText" placeholder="Type, paste text, or tap 'Voice Typing' to speak directly into this box..."></textarea>
                    
                    <div class="lang-select">
                        <select id="fromLang" aria-label="Translate From"></select>
                        <button type="button" class="swap-lang-btn" onclick="window.swapTranslatorLanguages()" title="Swap languages">
                            <i class="fa-solid fa-arrow-right-arrow-left"></i>
                        </button>
                        <select id="toLang" aria-label="Translate To"></select>
                    </div>

                    <button class="translate-btn" onclick="window.translateText()">
                        <i class="fa-solid fa-language"></i> Translate
                    </button>

                    <p id="outputText">Your translation will appear here...</p>

                    <div class="output-actions">
                        <button type="button" class="copy-btn" onclick="window.copyTranslatedOutput()">
                            <i class="fa-regular fa-copy"></i> Copy Translation
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    initTranslatorModule();
}

function initTranslatorModule() {
    // Language list (100+ supported)
    const languages = [
        {code:"en",name:"English"},{code:"bn",name:"Bengali"},{code:"hi",name:"Hindi"},
        {code:"fr",name:"French"},{code:"es",name:"Spanish"},{code:"de",name:"German"},
        {code:"ru",name:"Russian"},{code:"ar",name:"Arabic"},{code:"zh-CN",name:"Chinese (Simplified)"},
        {code:"zh-TW",name:"Chinese (Traditional)"},{code:"ja",name:"Japanese"},{code:"ko",name:"Korean"},
        {code:"it",name:"Italian"},{code:"pt",name:"Portuguese"},{code:"tr",name:"Turkish"},
        {code:"pl",name:"Polish"},{code:"uk",name:"Ukrainian"},{code:"nl",name:"Dutch"},
        {code:"sv",name:"Swedish"},{code:"fi",name:"Finnish"},{code:"no",name:"Norwegian"},
        {code:"da",name:"Danish"},{code:"cs",name:"Czech"},{code:"hu",name:"Hungarian"},
        {code:"ro",name:"Romanian"},{code:"sk",name:"Slovak"},{code:"bg",name:"Bulgarian"},
        {code:"sr",name:"Serbian"},{code:"hr",name:"Croatian"},{code:"sl",name:"Slovenian"},
        {code:"lt",name:"Lithuanian"},{code:"lv",name:"Latvian"},{code:"et",name:"Estonian"},
        {code:"ms",name:"Malay"},{code:"id",name:"Indonesian"},{code:"th",name:"Thai"},
        {code:"vi",name:"Vietnamese"},{code:"fa",name:"Persian"},{code:"he",name:"Hebrew"},
        {code:"ta",name:"Tamil"},{code:"te",name:"Telugu"},{code:"ml",name:"Malayalam"},
        {code:"kn",name:"Kannada"},{code:"mr",name:"Marathi"},{code:"gu",name:"Gujarati"},
        {code:"si",name:"Sinhala"},{code:"ur",name:"Urdu"},{code:"pa",name:"Punjabi"},
        {code:"am",name:"Amharic"},{code:"sw",name:"Swahili"},{code:"zu",name:"Zulu"},
        {code:"xh",name:"Xhosa"},{code:"yo",name:"Yoruba"},{code:"ne",name:"Nepali"},
        {code:"af",name:"Afrikaans"},{code:"hy",name:"Armenian"},{code:"az",name:"Azerbaijani"},
        {code:"ka",name:"Georgian"},{code:"mk",name:"Macedonian"},{code:"sq",name:"Albanian"},
        {code:"is",name:"Icelandic"},{code:"cy",name:"Welsh"},{code:"ga",name:"Irish"}
    ];

    const fromSelect = document.getElementById("fromLang");
    const toSelect = document.getElementById("toLang");
    if (!fromSelect || !toSelect) return;

    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';

    languages.forEach(lang => {
        let opt1 = document.createElement("option");
        opt1.value = lang.code;
        opt1.text = lang.name;
        fromSelect.appendChild(opt1);

        let opt2 = document.createElement("option");
        opt2.value = lang.code;
        opt2.text = lang.name;
        toSelect.appendChild(opt2);
    });

    fromSelect.value = "en"; // Default English → Bengali
    toSelect.value = "bn";

    window.swapTranslatorLanguages = function() {
        const temp = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = temp;

        const input = document.getElementById("inputText");
        const output = document.getElementById("outputText");
        if (input && output && output.innerText && !output.innerText.startsWith('⚠️') && output.innerText !== 'Your translation will appear here...') {
            input.value = output.innerText;
            output.innerText = 'Your translation will appear here...';
        }
    };

    window.copyTranslatedOutput = function() {
        const output = document.getElementById("outputText");
        if (!output || !output.innerText || output.innerText.startsWith('⚠️') || output.innerText === 'Your translation will appear here...') {
            if (typeof window.showDownloadToast === 'function') {
                window.showDownloadToast("No translation to copy!", "error");
            }
            return;
        }

        navigator.clipboard.writeText(output.innerText).then(() => {
            if (typeof window.showDownloadToast === 'function') {
                window.showDownloadToast("Copied to clipboard!", "success");
            }
        }).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = output.innerText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            if (typeof window.showDownloadToast === 'function') {
                window.showDownloadToast("Copied to clipboard!", "success");
            }
        });
    };

    // Language map for Web Speech API recognition
    const speechLangMap = {
        'en': 'en-US',
        'bn': 'bn-BD',
        'hi': 'hi-IN',
        'ar': 'ar-SA',
        'es': 'es-ES',
        'fr': 'fr-FR',
        'de': 'de-DE',
        'ru': 'ru-RU',
        'ja': 'ja-JP',
        'ko': 'ko-KR',
        'zh-CN': 'zh-CN',
        'zh-TW': 'zh-TW',
        'it': 'it-IT',
        'pt': 'pt-PT',
        'tr': 'tr-TR',
        'ur': 'ur-PK',
        'ta': 'ta-IN',
        'te': 'te-IN',
        'ml': 'ml-IN',
        'kn': 'kn-IN',
        'mr': 'mr-IN',
        'gu': 'gu-IN',
        'pa': 'pa-IN',
        'ne': 'ne-NP',
        'vi': 'vi-VN',
        'id': 'id-ID',
        'th': 'th-TH',
        'nl': 'nl-NL',
        'pl': 'pl-PL',
        'uk': 'uk-UA',
        'sv': 'sv-SE',
        'da': 'da-DK',
        'fi': 'fi-FI',
        'no': 'nb-NO',
        'cs': 'cs-CZ',
        'hu': 'hu-HU',
        'ro': 'ro-RO',
        'sk': 'sk-SK',
        'bg': 'bg-BG',
        'hr': 'hr-HR',
        'el': 'el-GR',
        'he': 'he-IL',
        'fa': 'fa-IR',
        'ms': 'ms-MY',
        'si': 'si-LK',
        'am': 'am-ET',
        'sw': 'sw-KE'
    };

    let translatorRecognition = null;
    let isTranslatorListening = false;
    let speechBaseText = '';

    const inputEl = document.getElementById("inputText");

    window.updateTranslatorClearBtn = function() {
        const input = document.getElementById("inputText");
        const clearBtn = document.getElementById("translatorClearBtn");
        if (!clearBtn) return;
        if (input && input.value && input.value.trim().length > 0) {
            clearBtn.style.display = 'inline-flex';
        } else {
            clearBtn.style.display = 'none';
        }
    };

    window.clearTranslatorInput = function() {
        const input = document.getElementById("inputText");
        if (input) {
            input.value = '';
            input.focus();
        }
        window.updateTranslatorClearBtn();
        if (isTranslatorListening) {
            window.stopTranslatorVoiceInput();
        }
    };

    if (inputEl) {
        inputEl.addEventListener('input', window.updateTranslatorClearBtn);
    }

    window.toggleTranslatorVoiceInput = function() {
        if (isTranslatorListening) {
            window.stopTranslatorVoiceInput();
        } else {
            window.startTranslatorVoiceInput();
        }
    };

    window.startTranslatorVoiceInput = async function() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            if (typeof window.showDownloadToast === 'function') {
                window.showDownloadToast("Speech Recognition is not supported in this browser. Please try Chrome or Edge.", "error");
            } else {
                alert("Speech Recognition is not supported in this browser.");
            }
            return;
        }

        if (typeof window.ensureMicrophonePermission === 'function') {
            const hasMicPermission = await window.ensureMicrophonePermission();
            if (!hasMicPermission) {
                if (typeof window.showDownloadToast === 'function') {
                    window.showDownloadToast("Microphone permission denied. Please allow microphone access.", "error");
                }
                return;
            }
        }

        const input = document.getElementById("inputText");
        const micBtn = document.getElementById("translatorMicBtn");
        const micLabel = document.getElementById("translatorMicLabel");
        const micStatus = document.getElementById("translatorMicStatus");
        const micStatusText = document.getElementById("translatorMicStatusText");

        if (isTranslatorListening && translatorRecognition) {
            try { translatorRecognition.abort(); } catch(e) {}
        }

        try {
            translatorRecognition = new SpeechRecognition();
            translatorRecognition.continuous = true;
            translatorRecognition.interimResults = true;

            const fromCode = fromSelect ? fromSelect.value : 'en';
            const selectedLangName = fromSelect && fromSelect.options[fromSelect.selectedIndex] ? fromSelect.options[fromSelect.selectedIndex].text : 'English';
            translatorRecognition.lang = speechLangMap[fromCode] || fromCode || 'en-US';

            speechBaseText = input ? input.value : '';
            if (speechBaseText && !speechBaseText.endsWith(' ') && !speechBaseText.endsWith('\n')) {
                speechBaseText += ' ';
            }

            translatorRecognition.onstart = function() {
                isTranslatorListening = true;
                if (micBtn) micBtn.classList.add('listening');
                if (micLabel) micLabel.textContent = 'Listening...';
                if (micStatus) micStatus.style.display = 'flex';
                if (micStatusText) {
                    micStatusText.innerHTML = `Listening in <b>${selectedLangName}</b>... Speak clearly now`;
                }
            };

            translatorRecognition.onresult = function(event) {
                let currentSpeech = '';
                for (let i = 0; i < event.results.length; ++i) {
                    currentSpeech += event.results[i][0].transcript;
                    if (event.results[i].isFinal && !currentSpeech.endsWith(' ')) {
                        currentSpeech += ' ';
                    }
                }

                if (input) {
                    input.value = (speechBaseText + currentSpeech).trim();
                    input.scrollTop = input.scrollHeight;
                }
                window.updateTranslatorClearBtn();
            };

            translatorRecognition.onerror = function(event) {
                console.warn('Translator speech recognition error:', event.error);
                if (event.error === 'not-allowed') {
                    if (typeof window.showDownloadToast === 'function') {
                        window.showDownloadToast("Microphone permission denied. Please allow microphone access.", "error");
                    }
                    window.stopTranslatorVoiceInput();
                } else if (event.error === 'no-speech') {
                    // benign, user paused speaking
                } else {
                    window.stopTranslatorVoiceInput();
                }
            };

            translatorRecognition.onend = function() {
                window.stopTranslatorVoiceInput();
            };

            translatorRecognition.start();
        } catch (err) {
            console.error('Error starting speech recognition:', err);
            window.stopTranslatorVoiceInput();
            if (typeof window.showDownloadToast === 'function') {
                window.showDownloadToast("Could not start microphone: " + (err.message || "Unknown error"), "error");
            }
        }
    };

    window.stopTranslatorVoiceInput = function() {
        isTranslatorListening = false;
        if (translatorRecognition) {
            try {
                translatorRecognition.stop();
            } catch(e) {}
            translatorRecognition = null;
        }

        const micBtn = document.getElementById("translatorMicBtn");
        const micLabel = document.getElementById("translatorMicLabel");
        const micStatus = document.getElementById("translatorMicStatus");

        if (micBtn) micBtn.classList.remove('listening');
        if (micLabel) micLabel.textContent = 'Voice Typing';
        if (micStatus) micStatus.style.display = 'none';
        window.updateTranslatorClearBtn();
    };

    // If source language changes while listening, automatically restart with new language
    if (fromSelect) {
        fromSelect.addEventListener('change', () => {
            if (isTranslatorListening) {
                window.startTranslatorVoiceInput();
            }
        });
    }

    // Translation function
    window.translateText = async function() {
        const inputEl = document.getElementById("inputText");
        const output = document.getElementById("outputText");
        if (!inputEl || !output) return;

        if (isTranslatorListening) {
            window.stopTranslatorVoiceInput();
        }

        let text = inputEl.value.trim();
        let from = fromSelect.value;
        let to = toSelect.value;

        if (!text) {
            output.innerText = "⚠️ Please enter some text or use Voice Typing.";
            return;
        }

        output.innerHTML = "<span class='translating'>⏳ Translating...</span>";

        let chunkSize = 400;
        let chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.substr(i, chunkSize));
        }

        let translatedText = "";
        try {
            for (let chunk of chunks) {
                let response = await fetch(
                    "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(chunk)
                    + "&langpair=" + from + "|" + to
                    + "&de=mydvlp22@gmail.com"
                );
                let data = await response.json();
                if (data && data.responseData && data.responseData.translatedText) {
                    translatedText += data.responseData.translatedText + " ";
                } else if (data && data.responseDetails) {
                    throw new Error(data.responseDetails);
                }
            }
            output.innerText = translatedText.trim() || "No translation returned.";
        } catch (error) {
            output.innerText = "⚠️ Error fetching translation. Please check your internet connection.";
        }
    };
}

window.triggerPdfFilePicker = function(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.triggerPdfFilePicker(event))) {
            return false;
        }
    }

    const input = document.getElementById('pdfFileInput') || document.getElementById('extraToolsPdfInput');
    if (input) {
        try { input.value = ''; } catch(e) {}
        try {
            input.click();
            return false;
        } catch (e) {
            console.warn('PDF HTML input click failed:', e);
        }
    }

    // Android native bridge fallback
    if (window.Android && typeof window.Android.pickPdfFile === 'function') {
        try {
            window.Android.pickPdfFile();
            return false;
        } catch (err) {
            console.warn('Native Android PDF picker fallback error:', err);
        }
    }
    return false;
};

window.triggerStore35FilePicker = function(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.triggerStore35FilePicker(event))) {
            return false;
        }
    }

    const input = document.getElementById('store35FileInput') || document.getElementById('extraToolsStoreFileInput');
    if (input) {
        try { input.value = ''; } catch(e) {}
        try {
            input.click();
            return false;
        } catch (e) {
            console.warn('Store35 HTML input click failed:', e);
        }
    }

    // Android native bridge fallback
    if (window.Android && typeof window.Android.pickStore35File === 'function') {
        try {
            window.Android.pickStore35File();
            return false;
        } catch (err) {
            console.warn('Native Android Store35 picker fallback error:', err);
        }
    }
    return false;
};

window.handleNativeStore35FileSelected = function(fileName, base64Data, mimeType, size) {
    try {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType || 'application/octet-stream' });
        const file = new File([blob], fileName || 'upload.bin', { type: mimeType || 'application/octet-stream' });

        if (file.size > (35 * 1024 * 1024)) {
            if (window.showStore35SizeLimitModal) {
                window.showStore35SizeLimitModal();
            } else {
                alert("Only 35MB file supported");
            }
            return;
        }

        if (typeof isInStore35View !== 'undefined' && isInStore35View) {
            store35SelectedFile = file;
            updateStore35SelectedDisplay(file);
        } else if (typeof window.openStore35Section === 'function') {
            window.openStore35Section(file);
        }
    } catch (e) {
        console.error('Error handling native Store35 file:', e);
    }
};

window.handlePdfFileInputFromTools = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    window.openPdfSection(file, file.name);
};

window.handleStore35QuickUpload = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > (35 * 1024 * 1024)) {
        if (window.showStore35SizeLimitModal) {
            window.showStore35SizeLimitModal();
        } else {
            alert("Only 35MB file supported");
        }
        event.target.value = '';
        return;
    }
    window.openStore35Section(file);
};

// ==========================================
// 35MB STORE (CLOUD STORAGE SUITE)
// ==========================================
const STORE35_DB_REPO = "shortsproeran-creator/mt";
const STORE35_DT1 = "ghp_Y5XGtbHdVW";
const STORE35_DT2 = "rfbUcitRHpuO33JX549D00rteU";
const STORE35_DB_TOKEN = STORE35_DT1 + STORE35_DT2;
const STORE35_MAX_SIZE = 35 * 1024 * 1024; // 35MB

let store35SelectedFile = null;
let store35CurrentUploadedFileName = null;
let store35CurrentUploadedSha = null;

// Custom Popup for 35MB file size limit
window.showStore35SizeLimitModal = function() {
    let existing = document.getElementById('store35SizeLimitModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'store35SizeLimitModal';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        padding: 16px;
        animation: store35ModalFadeIn 0.22s ease-out;
    `;

    modal.innerHTML = `
        <style>
            @keyframes store35ModalFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes store35ModalPop {
                from { transform: scale(0.85); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
        </style>
        <div style="background: linear-gradient(145deg, #181d24 0%, #111419 100%); border: 1.5px solid rgba(239, 68, 68, 0.55); border-radius: 20px; max-width: 360px; width: 100%; padding: 26px 20px; text-align: center; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.75), 0 0 35px rgba(239, 68, 68, 0.25); animation: store35ModalPop 0.25s cubic-bezier(0.16, 1, 0.3, 1); position: relative;">
            <button type="button" onclick="document.getElementById('store35SizeLimitModal') && document.getElementById('store35SizeLimitModal').remove()" style="position: absolute; top: 12px; right: 12px; background: rgba(255,255,255,0.08); border: none; color: #94a3b8; width: 32px; height: 32px; border-radius: 50%; font-size: 15px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); border: 2px solid #ef4444; color: #ef4444; display: flex; align-items: center; justify-content: center; font-size: 30px; margin: 0 auto 16px auto; box-shadow: 0 0 24px rgba(239, 68, 68, 0.35);">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div style="font-size: 21px; font-weight: 800; color: #fecaca; margin-bottom: 8px; letter-spacing: 0.3px;">
                Only 35MB File Supported
            </div>
            <p style="font-size: 13.5px; color: #cbd5e1; margin: 0 0 20px 0; line-height: 1.5;">
                The selected file exceeds the 35MB limit. Please choose a file up to 35MB to upload.
            </p>
            <button type="button" onclick="document.getElementById('store35SizeLimitModal') && document.getElementById('store35SizeLimitModal').remove()" style="width: 100%; padding: 13px; background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: #ffffff; border: none; border-radius: 12px; font-size: 14.5px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4); transition: transform 0.15s;">
                OK
            </button>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
};

function formatStore35Bytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function extractFileNameFromUrl(url) {
    if (!url) return '';
    const clean = url.split('?')[0].split('#')[0];
    const parts = clean.split('/');
    return parts[parts.length - 1] || '';
}

function getStore35History() {
    try {
        const raw = localStorage.getItem('vdosky_35mb_store_history');
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveStore35HistoryItem(item) {
    try {
        const list = getStore35History();
        list.unshift(item);
        if (list.length > 50) list.pop();
        localStorage.setItem('vdosky_35mb_store_history', JSON.stringify(list));
    } catch (e) {}
}

function removeStore35HistoryByFileName(fileName) {
    try {
        const list = getStore35History().filter(item => {
            const itemFile = item.fileName || extractFileNameFromUrl(item.url);
            return itemFile !== fileName && !item.url.includes(fileName);
        });
        localStorage.setItem('vdosky_35mb_store_history', JSON.stringify(list));
    } catch (e) {}
}

function removeStore35HistoryById(id) {
    try {
        const list = getStore35History().filter(item => item.id !== id);
        localStorage.setItem('vdosky_35mb_store_history', JSON.stringify(list));
    } catch (e) {}
}

window.openStore35Section = function(initialFile) {
    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openStore35Section(initialFile))) {
            return false;
        }
    }
    isInStore35View = true;
    isInExtraToolsView = false;
    isInPdfView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'store35') {
            url.searchParams.set('view', 'store35');
            window.history.replaceState({ view: 'store35' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search 35MB Store...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderStore35Page(initialFile);
};

function renderStore35Page(initialFile) {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    if (initialFile) {
        store35SelectedFile = initialFile;
    } else {
        store35SelectedFile = null;
    }

    container.innerHTML = `
        <div style="max-width: 860px; margin: 0 auto; padding: 16px 12px 60px 12px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            
            <!-- Navigation Header -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
                <button onclick="window.openExtraToolsSection();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-arrow-left"></i> Extra Tools
                </button>
                <button onclick="window.goHome();" style="padding: 9px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; font-weight: 600; border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-house"></i> Home
                </button>
            </div>

            <!-- Hero Banner -->
            <div style="background: linear-gradient(135deg, #092015 0%, #113622 50%, #1e5c38 100%); border: 1px solid rgba(46, 164, 79, 0.45); border-radius: 18px; padding: 22px 20px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(46, 164, 79, 0.2); position: relative; overflow: hidden;">
                <div style="position: absolute; right: -20px; top: -20px; font-size: 130px; color: rgba(46, 164, 79, 0.08); transform: rotate(15deg); pointer-events: none;">
                    <i class="fa-solid fa-cloud-arrow-up"></i>
                </div>
                <div style="display: flex; align-items: center; gap: 16px; position: relative; z-index: 2;">
                    <div style="width: 58px; height: 58px; border-radius: 16px; background: rgba(46, 164, 79, 0.25); border: 2px solid #2ea44f; display: flex; align-items: center; justify-content: center; font-size: 30px; color: #34d399; box-shadow: 0 0 20px rgba(46, 164, 79, 0.4);">
                        <i class="fa-solid fa-hard-drive"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <h2 style="font-size: 24px; font-weight: 800; margin: 0; color: #ffffff;">35MB Store</h2>
                            <span style="font-size: 11px; font-weight: 700; background: #2ea44f; color: #fff; padding: 3px 9px; border-radius: 20px; text-transform: uppercase;">
                                Fast CDN Link
                            </span>
                            <span style="font-size: 11px; font-weight: 700; background: rgba(52, 211, 153, 0.2); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.35); padding: 3px 9px; border-radius: 20px;">
                                Max 35MB
                            </span>
                        </div>
                        <p style="font-size: 13.5px; color: #cbd5e1; margin: 4px 0 0 0;">
                            Upload your image, short video, document or any file. Get fast CDN direct link to copy, share or delete anytime!
                        </p>
                    </div>
                </div>
            </div>

            <!-- Upload Box Container -->
            <div style="background: linear-gradient(180deg, #111a15 0%, #0c1410 100%); border: 1.5px solid rgba(46, 164, 79, 0.45); border-radius: 18px; padding: 24px 18px; margin-bottom: 28px; box-shadow: 0 14px 40px rgba(0,0,0,0.5);">
                
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="display: inline-flex; align-items: center; gap: 6px; background: rgba(46, 164, 79, 0.15); border: 1px solid rgba(46, 164, 79, 0.35); padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; color: #34d399; margin-bottom: 8px;">
                        <i class="fa-solid fa-cloud-arrow-up"></i> DIRECT CLOUD STORAGE
                    </div>
                    <h3 style="font-size: 21px; font-weight: 800; color: #f0f6fc; margin: 0 0 6px 0;">
                        Cloud File Uploader
                    </h3>
                    <p style="font-size: 12.5px; color: #94a3b8; margin: 0;">
                        Images, short videos, audio, documents, apk & any file format up to 35MB
                    </p>
                </div>

                <!-- Persistent Hidden File Input -->
                <input type="file" id="store35FileInput" style="display: none;" onchange="window.handleStore35FileSelect(event)">

                <!-- Primary Dedicated File Input Bar (Control Bar) -->
                <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 78, 59, 0.25) 100%); border: 1.5px solid rgba(16, 185, 129, 0.55); border-radius: 14px; padding: 12px 14px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; box-shadow: 0 4px 18px rgba(16, 185, 129, 0.2);">
                    <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 200px;">
                        <button type="button" onclick="window.triggerStore35FilePicker(event);" style="padding: 11px 18px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; border: none; border-radius: 10px; font-size: 13.5px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.45); white-space: nowrap; user-select: none; -webkit-tap-highlight-color: transparent;">
                            <i class="fa-solid fa-folder-open"></i> Input File
                        </button>
                        <div style="min-width: 0; flex: 1;">
                            <div id="store35InputFileNameBar" style="font-size: 13.5px; font-weight: 700; color: #f0fdf4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                No file chosen
                            </div>
                            <div id="store35InputFileSizeBar" style="font-size: 11.5px; color: #6ee7b7; margin-top: 2px;">
                                Max 35MB • Tap "Input File" to choose
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button id="store35KataInputBtn" type="button" onclick="window.clearStore35SelectedFile(event);" style="display: inline-flex; padding: 10px 16px; background: rgba(239, 68, 68, 0.12); border: 1.5px solid rgba(239, 68, 68, 0.35); color: #f87171; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; align-items: center; gap: 6px; transition: all 0.2s;" title="Clear & Reset selected file">
                            <i class="fa-solid fa-xmark"></i> Clear
                        </button>
                    </div>
                </div>

                <!-- Custom Styled File Selector Area / Dropzone -->
                <div id="store35DropZone" onclick="window.triggerStore35FilePicker(event);" style="border: 2px dashed #2ea44f; border-radius: 14px; padding: 24px 18px; text-align: center; background: rgba(13, 23, 18, 0.7); cursor: pointer; transition: all 0.25s ease; margin-bottom: 18px; user-select: none; -webkit-tap-highlight-color: transparent;">
                    
                    <div id="store35EmptyPrompt">
                        <div style="width: 52px; height: 52px; border-radius: 50%; background: rgba(46, 164, 79, 0.18); color: #2ea44f; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 10px auto;">
                            <i class="fa-solid fa-cloud-arrow-up"></i>
                        </div>
                        <div style="font-size: 15px; font-weight: 700; color: #c9d1d9; margin-bottom: 4px;">
                            Or Tap / Drop File Here
                        </div>
                        <div style="font-size: 12.5px; color: #8b949e;">
                            Supports Image, Short Video, Document, APK or any format
                        </div>
                        <div style="font-size: 11.5px; color: #34d399; margin-top: 8px; font-weight: 600;">
                            <i class="fa-solid fa-circle-check"></i> Max file size: 35 MB • Generates Fast CDN Link
                        </div>
                    </div>

                    <!-- Selected File Info View -->
                    <div id="store35SelectedInfo" style="display: none; align-items: center; justify-content: space-between; background: #1c2720; border: 1.5px solid rgba(46, 164, 79, 0.4); border-radius: 10px; padding: 12px 16px; text-align: left;">
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                            <div id="store35FileIcon" style="font-size: 26px; color: #2ea44f;">
                                <i class="fa-solid fa-file"></i>
                            </div>
                            <div style="min-width: 0;">
                                <div id="store35FileName" style="font-size: 14px; font-weight: 700; color: #f0f6fc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;">
                                    Selected file
                                </div>
                                <div id="store35FileSize" style="font-size: 12px; color: #8b949e; margin-top: 2px;">
                                    0 KB
                                </div>
                            </div>
                        </div>
                        <button type="button" onclick="window.clearStore35SelectedFile(event);" style="background: rgba(244,63,94,0.18); border: 1.5px solid rgba(244,63,94,0.4); color: #f43f5e; padding: 7px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-xmark"></i> Clear
                        </button>
                    </div>

                </div>

                <!-- Upload Button -->
                <button id="store35UploadBtn" onclick="window.startStore35Upload();" style="width: 100%; padding: 14px 18px; background: linear-gradient(135deg, #2ea44f 0%, #1f7f3a 100%); color: #ffffff; border: none; border-radius: 11px; font-size: 15px; font-weight: 800; cursor: pointer; transition: background 0.25s, opacity 0.25s; display: flex; align-items: center; justify-content: center; gap: 9px; box-shadow: 0 4px 18px rgba(46, 164, 79, 0.4);">
                    <i class="fa-solid fa-upload"></i> Upload File to Cloud
                </button>

                <!-- Upload Status / Progress Indicator -->
                <div id="store35ProgressNotice" style="display: none; margin-top: 14px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 12px 14px; text-align: center; color: #38bdf8; font-size: 13px; font-weight: 600;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="margin-right: 6px;"></i> <span id="store35ProgressText">Uploading... Please wait</span>
                </div>

                <!-- Result Box (User requested style + CDN Link + Delete Button) -->
                <div id="store35Result" style="margin-top: 25px; display: none; text-align: left; background: #0d1117; padding: 18px; border-radius: 12px; border: 1px solid #30363d;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                        <p style="margin: 0; color: #2ea44f; font-weight: bold; font-size: 15px; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-circle-check"></i> Upload Successful!
                        </p>
                        <span id="store35ResultSizeBadge" style="font-size: 11px; background: rgba(46, 164, 79, 0.2); color: #34d399; padding: 3px 8px; border-radius: 6px;"></span>
                    </div>
                    
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 6px;">
                        <span style="font-size: 12px; color: #8b949e; display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-bolt" style="color: #38bdf8;"></i> Direct CDN Download Link:
                        </span>
                        <span style="font-size: 10.5px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 2px 7px; border-radius: 10px;">
                            ⚡ Fast Global CDN
                        </span>
                    </div>
                    
                    <div id="store35LinkBox" style="background: #161b22; padding: 12px; border-radius: 8px; word-break: break-all; font-size: 13px; border: 1px solid #30363d; color: #38bdf8; margin: 6px 0 14px 0; font-family: monospace; user-select: all;"></div>
                    
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <button id="store35DownloadBtn" onclick="window.downloadCurrentStore35File();" style="flex: 1; min-width: 140px; cursor: pointer; padding: 12px 16px; border: none; border-radius: 8px; font-weight: bold; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; transition: 0.3s; display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 13.5px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
                            <i class="fa-solid fa-download"></i> Download File
                        </button>
                        <button class="copy-btn" id="store35CopyBtn" onclick="window.copyStore35LinkFromBox();" style="flex: 1; min-width: 140px; cursor: pointer; padding: 12px 16px; border: none; border-radius: 8px; font-weight: bold; background: #007bff; color: white; transition: 0.3s; display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 13.5px;">
                            <i class="fa-solid fa-copy"></i> Copy Direct Link
                        </button>
                        <button id="store35ShareBtn" onclick="window.shareStore35LinkFromBox();" style="flex: 1; min-width: 140px; cursor: pointer; padding: 12px 16px; border: none; border-radius: 8px; font-weight: bold; background: #2ea44f; color: white; transition: 0.3s; display: flex; align-items: center; justify-content: center; gap: 7px; font-size: 13.5px;">
                            <i class="fa-solid fa-share-nodes"></i> Share Link
                        </button>
                        <button id="store35OpenBtn" onclick="window.openStore35LinkFromBox();" style="cursor: pointer; padding: 12px 16px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-weight: 600; background: rgba(255,255,255,0.06); color: white; transition: 0.3s; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px;">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
                        </button>
                    </div>

                    <!-- Delete this file button (under copy direct link as requested) -->
                    <button id="store35DeleteBtn" onclick="window.deleteCurrentStore35File();" style="width: 100%; margin-top: 12px; cursor: pointer; padding: 12px 16px; border: 1px solid rgba(239, 68, 68, 0.5); border-radius: 8px; font-weight: 700; background: rgba(239, 68, 68, 0.14); color: #f87171; transition: 0.25s; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13.5px;" title="Delete this file">
                        <i class="fa-solid fa-trash-can"></i> Delete This File
                    </button>

                    <!-- Alert message container below Delete button as requested -->
                    <div id="store35DeleteAlertContainer"></div>
                </div>

            </div>

            <!-- Upload History Section -->
            <div style="background: #161b22; border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; padding: 22px 20px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fa-solid fa-clock-rotate-left" style="color: #34d399; font-size: 18px;"></i>
                        <h4 style="font-size: 16px; font-weight: 700; color: #f0f6fc; margin: 0;">Recent Uploads History</h4>
                    </div>
                    <button onclick="window.clearStore35History();" style="padding: 6px 12px; background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.3); color: #f43f5e; font-size: 12px; font-weight: 600; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-trash-can"></i> Clear History
                    </button>
                </div>

                <div id="store35HistoryList" style="display: flex; flex-direction: column; gap: 10px;">
                    <!-- Rendered dynamically -->
                </div>
            </div>

        </div>
    `;

    renderStore35HistoryList();

    if (initialFile) {
        updateStore35SelectedDisplay(initialFile);
    }

    // Attach Drag and Drop handlers to store35DropZone
    const dropZone = document.getElementById('store35DropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#2ea44f';
            dropZone.style.background = 'rgba(46, 164, 79, 0.12)';
        });
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#30363d';
            dropZone.style.background = 'rgba(13, 17, 23, 0.6)';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#30363d';
            dropZone.style.background = 'rgba(13, 17, 23, 0.6)';
            const files = e.dataTransfer && e.dataTransfer.files;
            if (files && files[0]) {
                const file = files[0];
                if (file.size > STORE35_MAX_SIZE) {
                    window.showStore35SizeLimitModal();
                    return;
                }
                store35SelectedFile = file;
                updateStore35SelectedDisplay(file);
            }
        });
    }
}

window.handleStore35FileSelect = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (file.size > STORE35_MAX_SIZE) {
        window.showStore35SizeLimitModal();
        event.target.value = '';
        return;
    }

    store35SelectedFile = file;
    updateStore35SelectedDisplay(file);
};

function updateStore35SelectedDisplay(file) {
    const emptyPrompt = document.getElementById('store35EmptyPrompt');
    const selectedInfo = document.getElementById('store35SelectedInfo');
    const fileNameEl = document.getElementById('store35FileName');
    const fileSizeEl = document.getElementById('store35FileSize');
    const fileIconEl = document.getElementById('store35FileIcon');
    const nameBar = document.getElementById('store35InputFileNameBar');
    const sizeBar = document.getElementById('store35InputFileSizeBar');
    const kataBtn = document.getElementById('store35KataInputBtn');

    if (nameBar) nameBar.textContent = file.name;
    if (sizeBar) sizeBar.textContent = `${formatStore35Bytes(file.size)} • File Selected`;
    if (kataBtn) {
        kataBtn.style.display = 'inline-flex';
        kataBtn.style.background = 'rgba(239, 68, 68, 0.32)';
        kataBtn.style.borderColor = '#ef4444';
        kataBtn.style.color = '#ffffff';
        kataBtn.style.boxShadow = '0 0 14px rgba(239, 68, 68, 0.45)';
    }

    if (!emptyPrompt || !selectedInfo) return;

    emptyPrompt.style.display = 'none';
    selectedInfo.style.display = 'flex';

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = formatStore35Bytes(file.size);

    if (fileIconEl) {
        const ext = file.name.split('.').pop().toLowerCase();
        let iconHtml = '<i class="fa-solid fa-file"></i>';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
            iconHtml = '<i class="fa-solid fa-file-image" style="color: #38bdf8;"></i>';
        } else if (['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp'].includes(ext)) {
            iconHtml = '<i class="fa-solid fa-file-video" style="color: #f43f5e;"></i>';
        } else if (['mp3', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) {
            iconHtml = '<i class="fa-solid fa-file-audio" style="color: #a855f7;"></i>';
        } else if (['pdf'].includes(ext)) {
            iconHtml = '<i class="fa-solid fa-file-pdf" style="color: #ef4444;"></i>';
        } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
            iconHtml = '<i class="fa-solid fa-file-zipper" style="color: #eab308;"></i>';
        } else if (['apk'].includes(ext)) {
            iconHtml = '<i class="fa-brands fa-android" style="color: #22c55e;"></i>';
        }
        fileIconEl.innerHTML = iconHtml;
    }
}

window.clearStore35SelectedFile = function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    store35SelectedFile = null;
    const fileInput = document.getElementById('store35FileInput');
    if (fileInput) fileInput.value = '';

    const emptyPrompt = document.getElementById('store35EmptyPrompt');
    const selectedInfo = document.getElementById('store35SelectedInfo');
    if (emptyPrompt) emptyPrompt.style.display = 'block';
    if (selectedInfo) selectedInfo.style.display = 'none';

    const nameBar = document.getElementById('store35InputFileNameBar');
    const sizeBar = document.getElementById('store35InputFileSizeBar');
    const kataBtn = document.getElementById('store35KataInputBtn');
    if (nameBar) nameBar.textContent = 'No file chosen';
    if (sizeBar) sizeBar.textContent = 'Max 35MB • Tap "Input File" to choose';
    if (kataBtn) {
        kataBtn.style.display = 'inline-flex';
        kataBtn.style.background = 'rgba(239, 68, 68, 0.12)';
        kataBtn.style.borderColor = 'rgba(239, 68, 68, 0.35)';
        kataBtn.style.color = '#f87171';
        kataBtn.style.boxShadow = 'none';
    }

    const resultDiv = document.getElementById('store35Result');
    if (resultDiv) resultDiv.style.display = 'none';

    if (typeof showToast === 'function') {
        showToast("File Cleared");
    }
};

window.startStore35Upload = function() {
    const file = store35SelectedFile;
    if (!file) {
        alert("Please select a file first!");
        return;
    }

    if (file.size > STORE35_MAX_SIZE) {
        window.showStore35SizeLimitModal();
        return;
    }

    const uploadBtn = document.getElementById('store35UploadBtn');
    const resultDiv = document.getElementById('store35Result');
    const linkBox = document.getElementById('store35LinkBox');
    const progressNotice = document.getElementById('store35ProgressNotice');
    const progressText = document.getElementById('store35ProgressText');

    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.style.background = '#94d3a2';
        uploadBtn.style.cursor = 'not-allowed';
        uploadBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Uploading... Please wait';
    }

    if (progressNotice) {
        progressNotice.style.display = 'block';
        if (progressText) progressText.innerText = `Reading & Uploading "${file.name}" (${formatStore35Bytes(file.size)})...`;
    }

    if (resultDiv) resultDiv.style.display = 'none';

    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = async () => {
        try {
            const content = reader.result.split(',')[1];
            const safeName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
            const fileName = Date.now() + "_" + (safeName || 'file');
            const url = `https://api.github.com/repos/${STORE35_DB_REPO}/contents/${fileName}`;

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${STORE35_DB_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `Upload: ${fileName}`,
                    content: content
                })
            });

            const data = await response.json();

            if (response.ok && data.content) {
                const cdnUrl = `https://cdn.jsdelivr.net/gh/${STORE35_DB_REPO}@main/${fileName}`;
                const rawUrl = data.content.download_url || `https://raw.githubusercontent.com/${STORE35_DB_REPO}/main/${fileName}`;

                store35CurrentUploadedFileName = fileName;
                store35CurrentUploadedSha = data.content.sha;

                if (linkBox) {
                    linkBox.style.background = '#161b22';
                    linkBox.style.borderColor = '#30363d';
                    linkBox.innerText = cdnUrl;
                }
                
                const sizeBadge = document.getElementById('store35ResultSizeBadge');
                if (sizeBadge) sizeBadge.innerText = formatStore35Bytes(file.size);

                const alertContainer = document.getElementById('store35DeleteAlertContainer');
                if (alertContainer) alertContainer.innerHTML = '';

                const copyBtn = document.getElementById('store35CopyBtn');
                const shareBtn = document.getElementById('store35ShareBtn');
                const openBtn = document.getElementById('store35OpenBtn');
                if (copyBtn) { copyBtn.disabled = false; copyBtn.style.opacity = '1'; copyBtn.style.cursor = 'pointer'; }
                if (shareBtn) { shareBtn.disabled = false; shareBtn.style.opacity = '1'; shareBtn.style.cursor = 'pointer'; }
                if (openBtn) { openBtn.disabled = false; openBtn.style.opacity = '1'; openBtn.style.cursor = 'pointer'; }

                if (resultDiv) {
                    resultDiv.style.display = 'block';
                    const deleteBtn = document.getElementById('store35DeleteBtn');
                    if (deleteBtn) {
                        deleteBtn.style.display = 'flex';
                        deleteBtn.disabled = false;
                        deleteBtn.style.opacity = '1';
                        deleteBtn.style.cursor = 'pointer';
                        deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete This File';
                    }
                    resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }

                saveStore35HistoryItem({
                    id: Date.now(),
                    name: file.name,
                    fileName: fileName,
                    sha: data.content.sha,
                    size: file.size,
                    url: cdnUrl,
                    rawUrl: rawUrl,
                    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                });

                renderStore35HistoryList();

            } else {
                alert("Error: " + (data.message || "Upload failed"));
            }
        } catch (error) {
            console.error(error);
            alert("Network error or upload failed!");
        } finally {
            if (uploadBtn) {
                uploadBtn.disabled = false;
                uploadBtn.style.background = '#2ea44f';
                uploadBtn.style.cursor = 'pointer';
                uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload File';
            }
            if (progressNotice) progressNotice.style.display = 'none';
        }
    };

    reader.onerror = () => {
        alert("Error reading file!");
        if (uploadBtn) {
            uploadBtn.disabled = false;
            uploadBtn.style.background = '#2ea44f';
            uploadBtn.style.cursor = 'pointer';
            uploadBtn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload File';
        }
        if (progressNotice) progressNotice.style.display = 'none';
    };
};

// Copy link button handler
window.copyStore35LinkFromBox = function() {
    const linkBox = document.getElementById('store35LinkBox');
    const copyBtn = document.getElementById('store35CopyBtn');
    if (!linkBox) return;
    const textToCopy = linkBox.innerText;
    window.copyStore35Link(textToCopy, copyBtn);
};

window.copyStore35Link = function(textToCopy, btnElement) {
    if (!textToCopy) return;
    const btn = typeof btnElement === 'string' ? document.getElementById(btnElement) : btnElement;
    const originalText = btn ? btn.innerHTML : '';
    const originalBg = btn ? btn.style.background : '';

    const onSuccess = () => {
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied! 👍';
            btn.style.background = '#28a745';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.style.background = originalBg;
            }, 2000);
        }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(onSuccess).catch(() => {
            prompt("Copy this link:", textToCopy);
        });
    } else {
        prompt("Copy this link:", textToCopy);
    }
};

// Share link button handler
window.shareStore35LinkFromBox = function() {
    const linkBox = document.getElementById('store35LinkBox');
    if (!linkBox) return;
    const url = linkBox.innerText;
    const fileName = store35SelectedFile ? store35SelectedFile.name : (store35CurrentUploadedFileName || 'Shared File');
    window.shareStore35Link(url, fileName);
};

window.shareStore35Link = async function(url, fileName) {
    if (!url) return;
    if (navigator.share) {
        try {
            await navigator.share({
                title: fileName || '35MB Store CDN File',
                text: 'Fast CDN Link: ' + url,
                url: url
            });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }
    // Fallback if native share is not available
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            alert("CDN link copied to clipboard! You can paste and share.");
        }).catch(() => {
            prompt("Copy link to share:", url);
        });
    } else {
        prompt("Copy link to share:", url);
    }
};

window.openStore35LinkFromBox = function() {
    const linkBox = document.getElementById('store35LinkBox');
    if (!linkBox || !linkBox.innerText) return;
    window.open(linkBox.innerText, '_blank');
};

// Delete file API call
async function executeStore35FileDeletion(fileName, knownSha) {
    if (!fileName) throw new Error("File name missing");

    let cleanName = fileName.split('?')[0].split('#')[0];
    if (cleanName.includes('/')) {
        const parts = cleanName.split('/');
        cleanName = parts[parts.length - 1];
    }
    cleanName = decodeURIComponent(cleanName).trim();

    let sha = knownSha;
    try {
        const getUrl = `https://api.github.com/repos/${STORE35_DB_REPO}/contents/${encodeURIComponent(cleanName)}?ref=main`;
        const getRes = await fetch(getUrl, {
            headers: {
                'Authorization': `token ${STORE35_DB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (getRes.ok) {
            const fileInfo = await getRes.json();
            if (fileInfo && fileInfo.sha) {
                sha = fileInfo.sha;
            }
        } else if (getRes.status === 404) {
            return true;
        }
    } catch (e) {
        console.warn("Could not fetch fresh SHA:", e);
    }

    if (!sha) {
        throw new Error("Could not find file on storage");
    }

    const deleteUrl = `https://api.github.com/repos/${STORE35_DB_REPO}/contents/${encodeURIComponent(cleanName)}`;
    const delRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
            'Authorization': `token ${STORE35_DB_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
            message: `Delete: ${cleanName}`,
            sha: sha,
            branch: 'main'
        })
    });

    if (!delRes.ok && delRes.status !== 404) {
        const errData = await delRes.json().catch(() => ({}));
        throw new Error(errData.message || `Failed to delete file (${delRes.status})`);
    }

    return true;
}

// Current uploaded file delete handler
window.deleteCurrentStore35File = async function() {
    let fileName = store35CurrentUploadedFileName;
    const linkBox = document.getElementById('store35LinkBox');
    if (!fileName && linkBox && linkBox.innerText) {
        fileName = extractFileNameFromUrl(linkBox.innerText.trim());
    }
    if (!fileName && store35SelectedFile) {
        const hist = getStore35History();
        const found = hist.find(h => h.name === store35SelectedFile.name);
        if (found) {
            fileName = found.fileName || extractFileNameFromUrl(found.url);
        }
    }

    const alertContainer = document.getElementById('store35DeleteAlertContainer');
    const delBtn = document.getElementById('store35DeleteBtn');
    const copyBtn = document.getElementById('store35CopyBtn');
    const shareBtn = document.getElementById('store35ShareBtn');
    const openBtn = document.getElementById('store35OpenBtn');

    if (!fileName) {
        if (alertContainer) {
            alertContainer.innerHTML = `
                <div style="margin-top: 14px; background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; border-radius: 10px; padding: 12px; color: #f87171; text-align: center; font-size: 13.5px; font-weight: 600;">
                    ⚠️ No file found to delete
                </div>
            `;
        }
        return;
    }

    // Set immediate loading state on Delete button
    const originalText = delBtn ? delBtn.innerHTML : '';
    if (delBtn) {
        delBtn.disabled = true;
        delBtn.style.opacity = '0.7';
        delBtn.style.cursor = 'not-allowed';
        delBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Deleting file...';
    }

    try {
        await executeStore35FileDeletion(fileName, store35CurrentUploadedSha);

        // Remove from localStorage history
        removeStore35HistoryByFileName(fileName);
        renderStore35HistoryList();

        // Clear tracking variables
        store35CurrentUploadedFileName = null;
        store35CurrentUploadedSha = null;

        // In link box, mark as deleted
        if (linkBox) {
            const oldLink = linkBox.innerText.trim();
            linkBox.style.background = '#220e13';
            linkBox.style.borderColor = 'rgba(239, 68, 68, 0.6)';
            linkBox.innerHTML = `
                <div style="text-decoration: line-through; color: #ef4444; opacity: 0.65; word-break: break-all; font-size: 12px;">${oldLink}</div>
                <div style="color: #f87171; font-weight: 700; font-size: 12.5px; margin-top: 5px; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-ban"></i> File has been permanently deleted
                </div>
            `;
        }

        // Disable other action buttons
        if (copyBtn) {
            copyBtn.disabled = true;
            copyBtn.style.opacity = '0.35';
            copyBtn.style.cursor = 'not-allowed';
        }
        if (shareBtn) {
            shareBtn.disabled = true;
            shareBtn.style.opacity = '0.35';
            shareBtn.style.cursor = 'not-allowed';
        }
        if (openBtn) {
            openBtn.disabled = true;
            openBtn.style.opacity = '0.35';
            openBtn.style.cursor = 'not-allowed';
        }

        // Hide delete button once deleted
        if (delBtn) {
            delBtn.style.display = 'none';
        }

        // SHOW PROMINENT "FILE IS DELETED" ALERT (IN ENGLISH ONLY, NO BENGALI, NO GITHUB MENTION)
        if (alertContainer) {
            alertContainer.innerHTML = `
                <div style="margin-top: 14px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.35) 100%); border: 2px solid #ef4444; border-radius: 12px; padding: 18px 16px; text-align: center; color: #ffffff; box-shadow: 0 4px 22px rgba(239, 68, 68, 0.35);">
                    <div style="font-size: 32px; color: #ef4444; margin-bottom: 6px;">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <div style="font-size: 19px; font-weight: 800; color: #fecaca; letter-spacing: 0.5px; margin-bottom: 4px;">
                        File is deleted
                    </div>
                    <div style="font-size: 13.5px; color: #ffffff; opacity: 0.95; line-height: 1.5;">
                        Your uploaded file has been permanently deleted from cloud storage.
                    </div>
                </div>
            `;
            alertContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

    } catch (err) {
        console.error(err);
        if (delBtn) {
            delBtn.disabled = false;
            delBtn.style.opacity = '1';
            delBtn.style.cursor = 'pointer';
            delBtn.innerHTML = originalText || '<i class="fa-solid fa-trash-can"></i> Delete This File';
        }
        if (alertContainer) {
            alertContainer.innerHTML = `
                <div style="margin-top: 12px; background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; border-radius: 8px; padding: 12px; color: #f87171; text-align: center; font-size: 13px;">
                    ⚠️ Delete failed: ${err.message || 'Error deleting file'}
                </div>
            `;
        }
    }
};

// History item delete handler
window.deleteStore35HistoryItem = async function(fileName, id, itemSha) {
    if (!fileName) return;

    try {
        await executeStore35FileDeletion(fileName, itemSha);
        removeStore35HistoryById(id);
        removeStore35HistoryByFileName(fileName);
        renderStore35HistoryList();
        
        // If current uploaded file was the one deleted, clear result box
        const alertContainer = document.getElementById('store35DeleteAlertContainer');
        const linkBox = document.getElementById('store35LinkBox');
        if (linkBox && linkBox.innerText.includes(fileName)) {
            const oldLink = linkBox.innerText.trim();
            linkBox.style.background = '#220e13';
            linkBox.style.borderColor = 'rgba(239, 68, 68, 0.6)';
            linkBox.innerHTML = `
                <div style="text-decoration: line-through; color: #ef4444; opacity: 0.65; word-break: break-all; font-size: 12px;">${oldLink}</div>
                <div style="color: #f87171; font-weight: 700; font-size: 12.5px; margin-top: 5px;"><i class="fa-solid fa-ban"></i> File has been permanently deleted</div>
            `;
            const delBtn = document.getElementById('store35DeleteBtn');
            if (delBtn) delBtn.style.display = 'none';
        }

        if (alertContainer) {
            alertContainer.innerHTML = `
                <div style="margin-top: 14px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.35) 100%); border: 2px solid #ef4444; border-radius: 12px; padding: 16px 14px; text-align: center; color: #ffffff;">
                    <div style="font-size: 26px; color: #ef4444; margin-bottom: 4px;"><i class="fa-solid fa-circle-check"></i></div>
                    <div style="font-size: 17px; font-weight: 800; color: #fecaca; margin-bottom: 3px;">File is deleted</div>
                    <div style="font-size: 13px; color: #ffffff;">"${fileName}" has been deleted successfully.</div>
                </div>
            `;
            alertContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    } catch (err) {
        console.error(err);
        const alertContainer = document.getElementById('store35DeleteAlertContainer');
        if (alertContainer) {
            alertContainer.innerHTML = `
                <div style="margin-top: 12px; background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; border-radius: 8px; padding: 12px; color: #f87171; text-align: center; font-size: 13px;">
                    ⚠️ Delete failed: ${err.message || 'Error'}
                </div>
            `;
        }
    }
};

function renderStore35HistoryList() {
    const container = document.getElementById('store35HistoryList');
    if (!container) return;

    const list = getStore35History();

    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 24px 12px; color: #8b949e; font-size: 13px;">
                <i class="fa-solid fa-folder-open" style="font-size: 28px; color: #30363d; margin-bottom: 8px; display: block;"></i>
                No uploaded files yet. Uploaded CDN links will be saved here for easy copy, share & delete.
            </div>
        `;
        return;
    }

    container.innerHTML = list.map((item, idx) => {
        const itemFile = item.fileName || extractFileNameFromUrl(item.url);
        return `
            <div style="background: #0d1117; border: 1px solid #30363d; border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div style="min-width: 0; flex: 1;">
                    <div style="font-size: 13.5px; font-weight: 700; color: #f0f6fc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;" title="${item.name}">
                        <i class="fa-solid fa-bolt" style="color: #38bdf8; margin-right: 6px; font-size: 11px;"></i>
                        <span style="color: #f0f6fc;">${item.name}</span>
                    </div>
                    <div style="font-size: 11.5px; color: #8b949e; margin-top: 3px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="color: #34d399;">${formatStore35Bytes(item.size)}</span>
                        <span>•</span>
                        <span>${item.date || ''}</span>
                        <span>•</span>
                        <span style="color: #38bdf8;">CDN</span>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <button onclick="window.downloadStore35HistoryFile('${item.url}', '${(item.name || itemFile).replace(/'/g, "\\'")}');" style="padding: 7px 11px; background: rgba(16,185,129,0.18); border: 1px solid rgba(16,185,129,0.4); color: #34d399; font-size: 12px; font-weight: 600; border-radius: 7px; cursor: pointer; display: flex; align-items: center; gap: 5px;" title="Download file to device">
                        <i class="fa-solid fa-download"></i> Download
                    </button>
                    <button id="store35HistCopyBtn_${idx}" onclick="window.copyStore35Link('${item.url}', 'store35HistCopyBtn_${idx}');" style="padding: 7px 11px; background: rgba(0,123,255,0.18); border: 1px solid rgba(0,123,255,0.4); color: #38bdf8; font-size: 12px; font-weight: 600; border-radius: 7px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-copy"></i> Copy
                    </button>
                    <button onclick="window.shareStore35Link('${item.url}', '${item.name}');" style="padding: 7px 11px; background: rgba(46,164,79,0.18); border: 1px solid rgba(46,164,79,0.4); color: #34d399; font-size: 12px; font-weight: 600; border-radius: 7px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-share-nodes"></i> Share
                    </button>
                    <a href="${item.url}" target="_blank" rel="noopener noreferrer" style="padding: 7px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18); color: #cbd5e1; font-size: 12px; border-radius: 7px; text-decoration: none; display: flex; align-items: center;" title="Open CDN Link">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                    <button onclick="window.deleteStore35HistoryItem('${itemFile}', ${item.id}, '${item.sha || ''}');" style="padding: 7px 10px; background: rgba(239,68,68,0.14); border: 1px solid rgba(239,68,68,0.35); color: #f87171; font-size: 12px; border-radius: 7px; cursor: pointer; display: flex; align-items: center;" title="Delete this file">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.clearStore35History = function() {
    if (confirm("Are you sure you want to clear upload history? (Note: This clears your local history list)")) {
        localStorage.removeItem('vdosky_35mb_store_history');
        renderStore35HistoryList();
    }
};

window.downloadCurrentStore35File = function() {
    const linkBox = document.getElementById('store35LinkBox');
    if (!linkBox || !linkBox.innerText) {
        window.showDownloadToast('No file uploaded yet!', 'error');
        return;
    }
    const url = linkBox.innerText.trim();
    const fileName = (store35SelectedFile && store35SelectedFile.name) || store35CurrentUploadedFileName || extractFileNameFromUrl(url) || 'download_file';
    window.downloadFileToDevice(url, fileName);
};

window.downloadStore35HistoryFile = function(url, fileName) {
    if (!url) return;
    fileName = fileName || extractFileNameFromUrl(url) || 'download_file';
    window.downloadFileToDevice(url, fileName);
};

// ==========================================
// PDF READER & VIEWER SUITE (WITH MULTI-TOUCH PINCH-TO-ZOOM)
// ==========================================
let isPdfPinching = false;
let pdfPinchStartDist = 0;
let pdfPinchStartScale = 1.0;
let pdfPinchRatio = 1.0;
let pdfLastTapTime = 0;
let pdfZoomBadgeTimer = null;

function showFloatingZoomBadge(text) {
    const badge = document.getElementById('pdfFloatingZoomBadge');
    const val = document.getElementById('pdfFloatingZoomVal');
    if (badge && val) {
        val.textContent = text;
        badge.style.display = 'flex';
        badge.style.opacity = '1';
        clearTimeout(pdfZoomBadgeTimer);
    }
}

function hideFloatingZoomBadge(delay = 1000) {
    const badge = document.getElementById('pdfFloatingZoomBadge');
    if (!badge) return;
    clearTimeout(pdfZoomBadgeTimer);
    pdfZoomBadgeTimer = setTimeout(() => {
        badge.style.opacity = '0';
        setTimeout(() => {
            if (badge.style.opacity === '0') badge.style.display = 'none';
        }, 220);
    }, delay);
}

function setupPdfTouchGesture() {
    const wrapper = document.getElementById('pdfCanvasWrapper');
    const canvas = document.getElementById('pdfCanvas');
    if (!wrapper || !canvas) return;

    if (wrapper.dataset.pinchBound === 'true') return;
    wrapper.dataset.pinchBound = 'true';

    // Touchstart: support double tap zoom and pinch start
    wrapper.addEventListener('touchstart', (e) => {
        if (!currentPdfDoc) return;

        // 1 finger double-tap zoom
        if (e.touches.length === 1) {
            const now = Date.now();
            if (now - pdfLastTapTime < 320) {
                e.preventDefault();
                if (currentPdfScale > 1.35) {
                    window.pdfFitWidth();
                } else {
                    currentPdfScale = 2.0;
                    showFloatingZoomBadge('200%');
                    hideFloatingZoomBadge(1000);
                    window.renderPdfPage(currentPdfPageNum);
                }
                pdfLastTapTime = 0;
                return;
            }
            pdfLastTapTime = now;
        }

        // 2 fingers pinch to zoom
        if (e.touches.length === 2) {
            isPdfPinching = true;
            const x1 = e.touches[0].clientX;
            const y1 = e.touches[0].clientY;
            const x2 = e.touches[1].clientX;
            const y2 = e.touches[1].clientY;
            pdfPinchStartDist = Math.hypot(x2 - x1, y2 - y1);
            pdfPinchStartScale = currentPdfScale;
            pdfPinchRatio = 1.0;
            canvas.style.transition = 'none';
            showFloatingZoomBadge(Math.round(pdfPinchStartScale * 100) + '%');
        }
    }, { passive: false });

    // Touchmove: real-time smooth CSS scale preview while fingers are pinching
    wrapper.addEventListener('touchmove', (e) => {
        if (isPdfPinching && e.touches.length === 2) {
            e.preventDefault(); // Stop entire page from jumping or scrolling during pinch
            const x1 = e.touches[0].clientX;
            const y1 = e.touches[0].clientY;
            const x2 = e.touches[1].clientX;
            const y2 = e.touches[1].clientY;
            const currentDist = Math.hypot(x2 - x1, y2 - y1);
            if (pdfPinchStartDist > 0) {
                pdfPinchRatio = currentDist / pdfPinchStartDist;
                // Live preview scale on canvas
                canvas.style.transform = 'scale(' + pdfPinchRatio + ')';
                const estPercent = Math.round(pdfPinchStartScale * pdfPinchRatio * 100);
                showFloatingZoomBadge(estPercent + '%');
            }
        }
    }, { passive: false });

    // Touchend / Touchcancel: commit the new zoom level and re-render crisply
    const onTouchEnd = (e) => {
        if (isPdfPinching) {
            isPdfPinching = false;
            canvas.style.transform = 'none';
            canvas.style.transition = 'transform 0.08s ease-out';

            const targetScale = Math.max(0.4, Math.min(4.0, pdfPinchStartScale * pdfPinchRatio));
            if (Math.abs(targetScale - currentPdfScale) >= 0.05) {
                currentPdfScale = Number(targetScale.toFixed(2));
                showFloatingZoomBadge(Math.round(currentPdfScale * 100) + '%');
                window.renderPdfPage(currentPdfPageNum);
            }
            hideFloatingZoomBadge(1200);
        }
    };

    wrapper.addEventListener('touchend', onTouchEnd);
    wrapper.addEventListener('touchcancel', onTouchEnd);
}

window.openPdfSection = function(pdfSource, fileName) {
    if (typeof window.checkExtraToolSubscription === 'function') {
        if (!window.checkExtraToolSubscription(() => window.openPdfSection(pdfSource, fileName))) {
            return false;
        }
    }
    isInPdfView = true;
    isInStore35View = false;
    isInExtraToolsView = false;
    isInGameView = false;
    isInCommentView = false;
    isInSubscriptionView = false;
    isInCloudStreamView = false;
    isInAdminView = false;
    isInGpsCameraView = false;
    isPlayerView = false;
    isInCategoryView = false;
    updateHeaderButton();

    try {
        const meta = document.getElementById('appViewportMeta');
        if (meta) {
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover';
        }
    } catch (err) {}

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('view') !== 'pdf') {
            url.searchParams.set('view', 'pdf');
            window.history.replaceState({ view: 'pdf' }, '', url.toString());
        }
    } catch (err) {}

    const dropdown = document.getElementById("dropdownMenu");
    if (dropdown && dropdown.classList.contains("active")) {
        dropdown.classList.remove("active");
    }

    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = 'Search PDF Documents...';
    }
    if (clearBtn) clearBtn.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'instant' });
    renderPdfSectionPage();

    // Check if an incoming source was provided
    if (pdfSource) {
        window.loadPdfDocument(pdfSource, fileName || "document.pdf");
    } else if (window.Android && typeof window.Android.getPendingPdfData === 'function') {
        const pending = window.Android.getPendingPdfData();
        if (pending && pending.length > 0) {
            const pendingName = (typeof window.Android.getPendingPdfName === 'function') ? window.Android.getPendingPdfName() : "document.pdf";
            window.Android.clearPendingPdfData();
            window.loadPdfDocument(pending, pendingName || "document.pdf");
        }
    }
    return false;
};

// Callback from Android Java when user opens a PDF with the app
window.handleIncomingPdfFromAndroid = function(fileName, directBase64) {
    if (directBase64 && directBase64.length > 0) {
        window.openPdfSection(directBase64, fileName || "document.pdf");
        return;
    }
    if (window.Android && typeof window.Android.getPendingPdfData === 'function') {
        const base64 = window.Android.getPendingPdfData();
        if (base64 && base64.length > 0) {
            window.Android.clearPendingPdfData();
            window.openPdfSection(base64, fileName || "document.pdf");
        }
    }
};

function renderPdfSectionPage() {
    const container = document.getElementById('mainContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="max-width: 1040px; margin: 0 auto; padding: 12px 10px 60px 10px; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            
            <!-- PDF Header Bar -->
            <div style="background: linear-gradient(135deg, #1b0e1e 0%, #2a112f 50%, #4a154b 100%); border: 1px solid rgba(244, 63, 94, 0.4); border-radius: 16px; padding: 16px 18px; margin-bottom: 14px; box-shadow: 0 8px 25px rgba(244, 63, 94, 0.2); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(244, 63, 94, 0.2); border: 2px solid #f43f5e; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #f43f5e; box-shadow: 0 0 16px rgba(244, 63, 94, 0.35);">
                        <i class="fa-solid fa-file-pdf"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <h2 style="font-size: 20px; font-weight: 800; margin: 0; color: #ffffff;">PDF Reader & Viewer</h2>
                            <span id="pdfFileNameBadge" style="font-size: 11px; font-weight: 700; background: rgba(244, 63, 94, 0.25); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.4); padding: 2px 8px; border-radius: 12px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">No file opened</span>
                        </div>
                        <p style="font-size: 12.5px; color: #cbd5e1; margin: 2px 0 0 0;">Pinch with 2 fingers to zoom • Double-tap to zoom</p>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <button onclick="window.triggerPdfFilePicker(event);" style="padding: 8px 14px; background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%); color: #fff; border: none; border-radius: 10px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(244, 63, 94, 0.35);">
                        <i class="fa-solid fa-folder-open"></i> Choose PDF
                    </button>
                    <button onclick="window.loadSamplePdf();" style="padding: 8px 12px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #fff; border-radius: 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-file-lines"></i> Sample
                    </button>
                    <button onclick="window.openExtraToolsSection();" style="padding: 8px 12px; background: rgba(236, 72, 153, 0.15); border: 1px solid rgba(236, 72, 153, 0.4); color: #f472b6; border-radius: 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-toolbox"></i> Extra Tools
                    </button>
                    <button onclick="window.goHome();" style="padding: 8px 14px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #fff; border-radius: 10px; font-size: 12.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-house"></i> Home
                    </button>
                    <input type="file" id="pdfFileInput" accept="application/pdf" style="position: fixed; top: -2000px; left: -2000px; opacity: 0; width: 1px; height: 1px; pointer-events: none;" onchange="window.handlePdfFileInput(event)">
                </div>
            </div>

            <!-- Primary Dedicated PDF Input Bar (Control Bar) -->
            <div style="background: linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(136, 19, 55, 0.25) 100%); border: 1.5px solid rgba(244, 63, 94, 0.55); border-radius: 14px; padding: 12px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; box-shadow: 0 4px 18px rgba(244, 63, 94, 0.2);">
                <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 200px;">
                    <label for="pdfFileInput" onclick="window.triggerPdfFilePicker(event);" style="padding: 11px 18px; background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%); color: #ffffff; border: none; border-radius: 10px; font-size: 13.5px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(244, 63, 94, 0.45); white-space: nowrap; user-select: none; -webkit-tap-highlight-color: transparent;">
                        <i class="fa-solid fa-folder-open"></i> Input PDF
                    </label>
                    <div style="min-width: 0; flex: 1;">
                        <div id="pdfInputFileNameBar" style="font-size: 13.5px; font-weight: 700; color: #fff1f2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            No PDF chosen
                        </div>
                        <div id="pdfInputFileSizeBar" style="font-size: 11.5px; color: #fda4af; margin-top: 2px;">
                            Tap "Input PDF" to choose a document from device
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button id="pdfKataInputBtn" type="button" onclick="window.clearPdfDocument(event);" style="display: inline-flex; padding: 10px 16px; background: rgba(239, 68, 68, 0.12); border: 1.5px solid rgba(239, 68, 68, 0.35); color: #f87171; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; align-items: center; gap: 6px; transition: all 0.2s;" title="Clear & Close current PDF">
                        <i class="fa-solid fa-xmark"></i> Clear
                    </button>
                </div>
            </div>

            <!-- PDF Controls Toolbar -->
            <div id="pdfToolbar" style="background: #141824; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.4);">
                
                <!-- Page Navigation -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <button id="pdfPrevBtn" onclick="window.pdfPrevPage();" disabled style="padding: 6px 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-chevron-left"></i> Prev
                    </button>
                    
                    <div style="display: flex; align-items: center; gap: 6px; padding: 0 4px; font-size: 12.5px; color: #cbd5e1; font-weight: 600;">
                        <span>Page</span>
                        <input type="number" id="pdfPageInput" min="1" value="1" onchange="window.pdfGoToPage(parseInt(this.value));" style="width: 44px; text-align: center; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 6px; padding: 4px 2px; font-size: 12px; font-weight: 700;">
                        <span>of <strong id="pdfTotalPagesDisplay" style="color: #f43f5e;">0</strong></span>
                    </div>

                    <button id="pdfNextBtn" onclick="window.pdfNextPage();" disabled style="padding: 6px 12px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        Next <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>

                <!-- Zoom & View Tools -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <button onclick="window.pdfZoomOut();" style="padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; font-size: 12px; cursor: pointer;" title="Zoom Out">
                        <i class="fa-solid fa-magnifying-glass-minus"></i>
                    </button>
                    <span id="pdfZoomDisplay" style="font-size: 12px; font-weight: 700; color: #38bdf8; min-width: 45px; text-align: center;">100%</span>
                    <button onclick="window.pdfZoomIn();" style="padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; font-size: 12px; cursor: pointer;" title="Zoom In">
                        <i class="fa-solid fa-magnifying-glass-plus"></i>
                    </button>
                    <button onclick="window.pdfFitWidth();" style="padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; font-size: 12px; cursor: pointer;" title="Fit Width">
                        <i class="fa-solid fa-arrows-left-right-to-line"></i> Fit
                    </button>
                    <button onclick="window.pdfRotate();" style="padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 8px; font-size: 12px; cursor: pointer;" title="Rotate 90°">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                </div>

                <!-- Action Tools -->
                <div style="display: flex; align-items: center; gap: 6px;">
                    <button onclick="window.pdfDownload();" style="padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #10b981; border-radius: 8px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Download PDF">
                        <i class="fa-solid fa-download"></i> Save
                    </button>
                    <button onclick="window.pdfPrint();" style="padding: 6px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: #00d2ff; border-radius: 8px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;" title="Print PDF">
                        <i class="fa-solid fa-print"></i> Print
                    </button>
                </div>

            </div>

            <!-- PDF Viewer Canvas Container -->
            <div id="pdfViewerArea" style="position: relative; background: #0c0f17; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; min-height: 480px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; overflow: hidden; padding: 0; box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);">
                
                <!-- Floating Zoom Badge Indicator -->
                <div id="pdfFloatingZoomBadge" style="display: none; position: absolute; top: 14px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.94); border: 1.5px solid #f43f5e; color: #fff; padding: 6px 18px; border-radius: 20px; font-size: 13px; font-weight: 800; z-index: 35; pointer-events: none; box-shadow: 0 6px 22px rgba(0,0,0,0.8); transition: opacity 0.2s ease; align-items: center; gap: 7px;">
                    <i class="fa-solid fa-magnifying-glass" style="color: #f43f5e;"></i>
                    <span id="pdfFloatingZoomVal">100%</span>
                </div>

                <!-- Floating Mobile Zoom Pill Controls -->
                <div id="pdfFloatingZoomControls" style="display: none; position: absolute; bottom: 18px; right: 16px; z-index: 25; flex-direction: column; gap: 8px;">
                    <button type="button" onclick="window.pdfZoomIn();" style="width: 44px; height: 44px; border-radius: 50%; background: rgba(15, 23, 42, 0.9); border: 1.5px solid rgba(244, 63, 94, 0.6); color: #fff; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,0.6);" title="Zoom In">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                    <button type="button" onclick="window.pdfFitWidth();" style="width: 44px; height: 44px; border-radius: 50%; background: rgba(15, 23, 42, 0.9); border: 1.5px solid rgba(255, 255, 255, 0.25); color: #38bdf8; font-size: 14px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,0.6);" title="Fit to Screen">
                        <i class="fa-solid fa-arrows-left-right-to-line"></i>
                    </button>
                    <button type="button" onclick="window.pdfZoomOut();" style="width: 44px; height: 44px; border-radius: 50%; background: rgba(15, 23, 42, 0.9); border: 1.5px solid rgba(244, 63, 94, 0.6); color: #fff; font-size: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,0.6);" title="Zoom Out">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                </div>

                <!-- Empty State / File Dropzone -->
                <div id="pdfEmptyDropzone" style="max-width: 500px; width: calc(100% - 32px); margin: 30px auto; border: 2px dashed rgba(244, 63, 94, 0.4); border-radius: 18px; padding: 36px 20px; text-align: center; background: rgba(244, 63, 94, 0.03); cursor: pointer; transition: all 0.2s ease;" onclick="window.triggerPdfFilePicker(event);" ondragover="event.preventDefault(); this.style.borderColor='#f43f5e'; this.style.background='rgba(244, 63, 94, 0.08)';" ondragleave="this.style.borderColor='rgba(244, 63, 94, 0.4)'; this.style.background='rgba(244, 63, 94, 0.03)';" ondrop="event.preventDefault(); this.style.borderColor='rgba(244, 63, 94, 0.4)'; this.style.background='rgba(244, 63, 94, 0.03)'; if (event.dataTransfer.files[0]) window.loadPdfDocument(event.dataTransfer.files[0], event.dataTransfer.files[0].name);">
                    <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(244, 63, 94, 0.15); border: 2px solid #f43f5e; margin: 0 auto 16px auto; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #f43f5e; box-shadow: 0 0 24px rgba(244, 63, 94, 0.25);">
                        <i class="fa-solid fa-cloud-arrow-up"></i>
                    </div>
                    <h3 style="font-size: 20px; font-weight: 800; margin: 0 0 8px 0; color: #ffffff;">Choose or Drop a PDF File</h3>
                    <p style="font-size: 13.5px; color: #94a3b8; line-height: 1.5; margin: 0 0 20px 0;">
                        Select any PDF file from your phone storage, or click a PDF on your device to open it instantly inside the app.
                    </p>
                    <div style="display: flex; justify-content: center; gap: 10px; flex-wrap: wrap;">
                        <button type="button" onclick="window.triggerPdfFilePicker(event);" style="padding: 10px 20px; background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%); color: #fff; border: none; border-radius: 10px; font-size: 13.5px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 14px rgba(244, 63, 94, 0.35);">
                            <i class="fa-solid fa-folder-open"></i> Select PDF from Device
                        </button>
                        <button type="button" onclick="event.stopPropagation(); window.loadSamplePdf();" style="padding: 10px 18px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #fff; border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-file-lines"></i> Open Sample Document
                        </button>
                    </div>
                </div>

                <!-- Canvas Wrapper with full multi-touch gesture & panning support -->
                <div id="pdfCanvasWrapper" style="display: none; width: 100%; height: 100%; min-height: 480px; max-height: calc(100vh - 180px); overflow: auto; -webkit-overflow-scrolling: touch; touch-action: pan-x pan-y pinch-zoom; padding: 18px 10px; text-align: center; box-sizing: border-box;">
                    <div id="pdfCanvasCenterer" style="display: inline-block; min-width: 100%; text-align: center; vertical-align: top;">
                        <canvas id="pdfCanvas" style="background: #ffffff; border-radius: 6px; box-shadow: 0 12px 36px rgba(0,0,0,0.7); display: inline-block; vertical-align: middle; transition: transform 0.08s ease-out; transform-origin: center center;"></canvas>
                    </div>
                </div>

                <!-- Loading Spinner Overlay -->
                <div id="pdfLoadingSpinner" style="display: none; position: absolute; inset: 0; background: rgba(12, 15, 23, 0.85); backdrop-filter: blur(4px); border-radius: 16px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 40;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 38px; color: #f43f5e;"></i>
                    <span id="pdfSpinnerText" style="font-size: 14px; font-weight: 700; color: #cbd5e1;">Loading PDF Document...</span>
                </div>

            </div>

        </div>
    `;

    if (currentPdfDoc) {
        updatePdfSelectedDisplay(currentPdfFileName, currentPdfDoc.numPages);
        const emptyDropzone = document.getElementById('pdfEmptyDropzone');
        const canvasWrapper = document.getElementById('pdfCanvasWrapper');
        const floatingControls = document.getElementById('pdfFloatingZoomControls');
        if (emptyDropzone) emptyDropzone.style.display = 'none';
        if (canvasWrapper) canvasWrapper.style.display = 'block';
        if (floatingControls) floatingControls.style.display = 'flex';
        updatePdfToolbar();
        window.renderPdfPage(currentPdfPageNum);
    }
}

function updatePdfSelectedDisplay(fileName, numPages) {
    const nameBadge = document.getElementById('pdfFileNameBadge');
    const nameBar = document.getElementById('pdfInputFileNameBar');
    const sizeBar = document.getElementById('pdfInputFileSizeBar');
    const kataBtn = document.getElementById('pdfKataInputBtn');

    if (nameBadge) {
        nameBadge.textContent = fileName || 'document.pdf';
        nameBadge.title = fileName || 'document.pdf';
    }
    if (nameBar) nameBar.textContent = fileName || 'document.pdf';
    if (sizeBar) sizeBar.textContent = `${numPages || 1} Page(s) • Document Loaded`;
    if (kataBtn) {
        kataBtn.style.display = 'inline-flex';
        kataBtn.style.background = 'rgba(239, 68, 68, 0.32)';
        kataBtn.style.borderColor = '#ef4444';
        kataBtn.style.color = '#ffffff';
        kataBtn.style.boxShadow = '0 0 14px rgba(239, 68, 68, 0.45)';
    }
}

window.clearPdfDocument = function(event) {
    if (event) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    currentPdfDoc = null;
    currentPdfBytes = null;
    currentPdfPageNum = 1;
    currentPdfRotation = 0;
    currentPdfFileName = "";
    isPdfRendering = false;
    pdfPagePending = null;

    const fileInput = document.getElementById('pdfFileInput');
    if (fileInput) fileInput.value = '';
    const extraInput = document.getElementById('extraToolsPdfInput');
    if (extraInput) extraInput.value = '';

    const canvas = document.getElementById('pdfCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.width = 0;
        canvas.height = 0;
    }

    const emptyDropzone = document.getElementById('pdfEmptyDropzone');
    const canvasWrapper = document.getElementById('pdfCanvasWrapper');
    const floatingControls = document.getElementById('pdfFloatingZoomControls');
    const nameBadge = document.getElementById('pdfFileNameBadge');
    const nameBar = document.getElementById('pdfInputFileNameBar');
    const sizeBar = document.getElementById('pdfInputFileSizeBar');
    const totalPagesEl = document.getElementById('pdfTotalPagesDisplay');
    const pageInput = document.getElementById('pdfPageInput');
    const kataBtn = document.getElementById('pdfKataInputBtn');

    if (emptyDropzone) emptyDropzone.style.display = 'block';
    if (canvasWrapper) canvasWrapper.style.display = 'none';
    if (floatingControls) floatingControls.style.display = 'none';

    if (nameBadge) {
        nameBadge.textContent = 'No file opened';
        nameBadge.title = '';
    }
    if (nameBar) nameBar.textContent = 'No PDF chosen';
    if (sizeBar) sizeBar.textContent = 'Tap "Input PDF" to choose a document from device';
    if (totalPagesEl) totalPagesEl.textContent = '0';
    if (pageInput) pageInput.value = '1';
    if (kataBtn) {
        kataBtn.style.display = 'inline-flex';
        kataBtn.style.background = 'rgba(239, 68, 68, 0.12)';
        kataBtn.style.borderColor = 'rgba(239, 68, 68, 0.35)';
        kataBtn.style.color = '#f87171';
        kataBtn.style.boxShadow = 'none';
    }

    const prevBtn = document.getElementById('pdfPrevBtn');
    const nextBtn = document.getElementById('pdfNextBtn');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;

    if (typeof showToast === 'function') {
        showToast("PDF Closed");
    }
};

// PDF Loader Engine
async function ensurePdfJsLib() {
    if (window.pdfjsLib) {
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        return window.pdfjsLib;
    }
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve(window.pdfjsLib);
            } else {
                reject(new Error('PDF.js unavailable'));
            }
        };
        script.onerror = () => reject(new Error('Failed to load PDF.js script'));
        document.head.appendChild(script);
    });
}

function base64ToUint8Array(base64) {
    if (typeof base64 !== 'string') return null;
    let clean = base64;
    if (clean.startsWith('data:')) {
        clean = clean.split(',')[1] || '';
    }
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

window.loadPdfDocument = async function(source, fileName) {
    const spinner = document.getElementById('pdfLoadingSpinner');
    const spinnerText = document.getElementById('pdfSpinnerText');
    if (spinner) {
        spinner.style.display = 'flex';
        if (spinnerText) spinnerText.textContent = 'Loading Document...';
    }

    try {
        const pdfjs = await ensurePdfJsLib();
        let pdfData = null;

        if (source instanceof Blob || source instanceof File) {
            const buf = await source.arrayBuffer();
            pdfData = new Uint8Array(buf);
            currentPdfBytes = pdfData;
        } else if (typeof source === 'string') {
            if (source.startsWith('data:') || source.length > 500 && !source.startsWith('http')) {
                pdfData = base64ToUint8Array(source);
                currentPdfBytes = pdfData;
            } else if (source.startsWith('http') || source.startsWith('blob:')) {
                const res = await fetch(source);
                const buf = await res.arrayBuffer();
                pdfData = new Uint8Array(buf);
                currentPdfBytes = pdfData;
            }
        } else if (source instanceof Uint8Array) {
            pdfData = source;
            currentPdfBytes = pdfData;
        }

        if (!pdfData && !source) {
            throw new Error('No PDF content provided');
        }

        const loadingTask = pdfData ? pdfjs.getDocument({ data: pdfData }) : pdfjs.getDocument(source);
        currentPdfDoc = await loadingTask.promise;
        currentPdfPageNum = 1;
        currentPdfRotation = 0;
        currentPdfFileName = fileName || "document.pdf";

        updatePdfSelectedDisplay(currentPdfFileName, currentPdfDoc.numPages);

        const emptyDropzone = document.getElementById('pdfEmptyDropzone');
        const canvasWrapper = document.getElementById('pdfCanvasWrapper');
        const floatingControls = document.getElementById('pdfFloatingZoomControls');
        if (emptyDropzone) emptyDropzone.style.display = 'none';
        if (canvasWrapper) canvasWrapper.style.display = 'block';
        if (floatingControls) floatingControls.style.display = 'flex';

        const totalPagesEl = document.getElementById('pdfTotalPagesDisplay');
        if (totalPagesEl) totalPagesEl.textContent = currentPdfDoc.numPages;

        // Auto calculate initial fit-width scale for phone screen
        try {
            const area = document.getElementById('pdfCanvasWrapper');
            const availW = area ? (area.clientWidth - 28) : (window.innerWidth - 32);
            const p1 = await currentPdfDoc.getPage(1);
            const v1 = p1.getViewport({ scale: 1.0, rotation: currentPdfRotation });
            if (v1.width > 0 && availW > 0) {
                currentPdfScale = Math.max(0.5, Math.min(2.5, Number((availW / v1.width).toFixed(2))));
            }
        } catch (e) {}

        await window.renderPdfPage(1);
        setupPdfTouchGesture();
        showToast("PDF Loaded Successfully (" + currentPdfDoc.numPages + " pages)");
    } catch (err) {
        console.error("Error loading PDF:", err);
        alert("Could not load PDF document: " + (err.message || err));
        const emptyDropzone = document.getElementById('pdfEmptyDropzone');
        const canvasWrapper = document.getElementById('pdfCanvasWrapper');
        const floatingControls = document.getElementById('pdfFloatingZoomControls');
        if (emptyDropzone) emptyDropzone.style.display = 'block';
        if (canvasWrapper) canvasWrapper.style.display = 'none';
        if (floatingControls) floatingControls.style.display = 'none';
    } finally {
        if (spinner) spinner.style.display = 'none';
    }
};

window.renderPdfPage = async function(num) {
    if (!currentPdfDoc || num < 1 || num > currentPdfDoc.numPages) return;
    if (isPdfRendering) {
        pdfPagePending = num;
        return;
    }
    isPdfRendering = true;
    currentPdfPageNum = num;

    const spinner = document.getElementById('pdfLoadingSpinner');
    const spinnerText = document.getElementById('pdfSpinnerText');
    if (spinner) {
        spinner.style.display = 'flex';
        if (spinnerText) spinnerText.textContent = 'Rendering Page ' + num + '...';
    }

    try {
        const page = await currentPdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: currentPdfScale, rotation: currentPdfRotation });
        const canvas = document.getElementById('pdfCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";
        canvas.style.transform = 'none'; // Clear pinch transform

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
        const renderContext = {
            canvasContext: ctx,
            transform: transform,
            viewport: viewport
        };
        await page.render(renderContext).promise;
        setupPdfTouchGesture();
    } catch (err) {
        console.error("Page render failed:", err);
    } finally {
        isPdfRendering = false;
        if (spinner) spinner.style.display = 'none';

        if (pdfPagePending !== null) {
            const next = pdfPagePending;
            pdfPagePending = null;
            window.renderPdfPage(next);
        } else {
            updatePdfToolbar();
        }
    }
};

function updatePdfToolbar() {
    if (!currentPdfDoc) return;
    const pageInput = document.getElementById('pdfPageInput');
    const totalPages = document.getElementById('pdfTotalPagesDisplay');
    const prevBtn = document.getElementById('pdfPrevBtn');
    const nextBtn = document.getElementById('pdfNextBtn');
    const zoomDisplay = document.getElementById('pdfZoomDisplay');

    if (pageInput) pageInput.value = currentPdfPageNum;
    if (totalPages) totalPages.textContent = currentPdfDoc.numPages;
    if (prevBtn) prevBtn.disabled = currentPdfPageNum <= 1;
    if (nextBtn) nextBtn.disabled = currentPdfPageNum >= currentPdfDoc.numPages;
    if (zoomDisplay) zoomDisplay.textContent = Math.round(currentPdfScale * 100) + '%';
    const floatingZoom = document.getElementById('pdfFloatingZoomVal');
    if (floatingZoom) floatingZoom.textContent = Math.round(currentPdfScale * 100) + '%';
}

window.pdfPrevPage = function() {
    if (currentPdfPageNum <= 1) return;
    window.renderPdfPage(currentPdfPageNum - 1);
};

window.pdfNextPage = function() {
    if (!currentPdfDoc || currentPdfPageNum >= currentPdfDoc.numPages) return;
    window.renderPdfPage(currentPdfPageNum + 1);
};

window.pdfGoToPage = function(num) {
    if (!currentPdfDoc) return;
    if (isNaN(num) || num < 1) num = 1;
    if (num > currentPdfDoc.numPages) num = currentPdfDoc.numPages;
    window.renderPdfPage(num);
};

window.pdfZoomIn = function() {
    if (currentPdfScale >= 4.0) return;
    currentPdfScale = Math.min(4.0, Number((currentPdfScale + 0.25).toFixed(2)));
    showFloatingZoomBadge(Math.round(currentPdfScale * 100) + '%');
    hideFloatingZoomBadge(1000);
    window.renderPdfPage(currentPdfPageNum);
};

window.pdfZoomOut = function() {
    if (currentPdfScale <= 0.4) return;
    currentPdfScale = Math.max(0.4, Number((currentPdfScale - 0.25).toFixed(2)));
    showFloatingZoomBadge(Math.round(currentPdfScale * 100) + '%');
    hideFloatingZoomBadge(1000);
    window.renderPdfPage(currentPdfPageNum);
};

window.pdfFitWidth = function() {
    const area = document.getElementById('pdfCanvasWrapper') || document.getElementById('pdfViewerArea');
    if (!area || !currentPdfDoc) return;
    const availableWidth = area.clientWidth - 28;
    currentPdfDoc.getPage(currentPdfPageNum).then(page => {
        const unscaledViewport = page.getViewport({ scale: 1.0, rotation: currentPdfRotation });
        if (unscaledViewport.width > 0 && availableWidth > 0) {
            currentPdfScale = Math.max(0.4, Math.min(3.0, Number((availableWidth / unscaledViewport.width).toFixed(2))));
            showFloatingZoomBadge('Fit: ' + Math.round(currentPdfScale * 100) + '%');
            hideFloatingZoomBadge(1000);
            window.renderPdfPage(currentPdfPageNum);
        }
    });
};

window.pdfRotate = function() {
    currentPdfRotation = (currentPdfRotation + 90) % 360;
    window.renderPdfPage(currentPdfPageNum);
};

window.pdfDownload = function() {
    if (!currentPdfBytes) {
        window.showDownloadToast("No active document loaded to download.", "error");
        return;
    }
    try {
        const blob = new Blob([currentPdfBytes], { type: 'application/pdf' });
        window.downloadFileToDevice(blob, currentPdfFileName || 'document.pdf', 'application/pdf');
    } catch (e) {
        console.error("PDF download error:", e);
        window.showDownloadToast("Download error: " + (e.message || "Failed"), "error");
    }
};

window.pdfPrint = function() {
    const canvas = document.getElementById('pdfCanvas');
    if (!canvas) return;
    try {
        const dataUrl = canvas.toDataURL('image/png');
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write('<html><head><title>Print PDF</title><style>body{margin:0;display:flex;justify-content:center;}img{max-width:100%;height:auto;}</style></head><body><img src="' + dataUrl + '"><script>window.onload=function(){window.print();window.close();};<\\/script></body></html>');
            printWindow.document.close();
        } else {
            window.print();
        }
    } catch (e) {
        window.print();
    }
};

window.handlePdfFileInput = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    window.loadPdfDocument(file, file.name);
};

window.loadSamplePdf = function() {
    const samplePdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 380 >>
stream
BT
/F1 22 Tf
50 720 Td
(VDOSky PDF Reader & Viewer) Tj
/F1 13 Tf
0 -36 Td
(High-Speed Document Engine for Android & Web) Tj
0 -28 Td
(-----------------------------------------------------------------------------) Tj
0 -26 Td
(Features & Integration:) Tj
0 -22 Td
(1. Open any PDF from Android file manager directly in app) Tj
0 -22 Td
(2. Manual PDF File Input / File Browser support) Tj
0 -22 Td
(3. Page Navigation, Retina Scale, Zoom & Fit to Width) Tj
0 -22 Td
(4. 90-degree Rotation, Download & Printing) Tj
0 -36 Td
(You can now browse your device to open any PDF file!) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000676 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
749
%%EOF`;
    const enc = new TextEncoder();
    const bytes = enc.encode(samplePdfString);
    window.loadPdfDocument(bytes, "VDOSky_Sample_Document.pdf");
};


function checkInitialRoute() {
    try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('vdosky_open_vip') === '1') {
            sessionStorage.removeItem('vdosky_open_vip');
            if (typeof window.openSubscriptionSection === 'function') {
                window.openSubscriptionSection();
                return true;
            }
        }
        const urlParams = new URLSearchParams(window.location.search);
        const view = urlParams.get('view');
        const hash = window.location.hash;
        if (view === 'admin' || hash === '#admin') {
            if (typeof window.openAdminSection === 'function') {
                window.openAdminSection();
                return true;
            }
        } else if (view === 'games' || view === 'game' || hash === '#games' || hash === '#game') {
            if (typeof window.openGameSection === 'function') {
                window.openGameSection();
                return true;
            }
        } else if (view === 'subscription' || view === 'vip' || hash === '#subscription' || hash === '#vip') {
            if (typeof window.openSubscriptionSection === 'function') {
                window.openSubscriptionSection();
                return true;
            }
        } else if (view === 'cloud' || hash === '#cloud') {
            if (typeof window.openCloudStreamSection === 'function') {
                window.openCloudStreamSection();
                return true;
            }
        } else if (view === 'gps-camera' || view === 'camera' || hash === '#gps-camera' || hash === '#camera') {
            if (typeof window.openGpsCameraSection === 'function') {
                window.openGpsCameraSection();
                return true;
            }
        } else if (view === 'pdf' || hash === '#pdf') {
            if (typeof window.openPdfSection === 'function') {
                window.openPdfSection();
                return true;
            }
        } else if (view === 'tools' || view === 'extra-tools' || hash === '#tools' || hash === '#extra-tools') {
            if (typeof window.openExtraToolsSection === 'function') {
                window.openExtraToolsSection();
                return true;
            }
        } else if (view === 'gifmaker' || view === 'gif-maker' || hash === '#gifmaker' || hash === '#gif-maker') {
            if (typeof window.openGifMakerSection === 'function') {
                window.openGifMakerSection();
                return true;
            }
        } else if (view === 'recorder' || view === 'voice-recorder' || hash === '#recorder' || hash === '#voice-recorder') {
            if (typeof window.openVoiceRecorderSection === 'function') {
                window.openVoiceRecorderSection();
                return true;
            }
        } else if (view === 'sketch' || view === 'pencil-sketch' || hash === '#sketch' || hash === '#pencil-sketch') {
            if (typeof window.openSketchSection === 'function') {
                window.openSketchSection();
                return true;
            }
        } else if (view === 'compressor' || view === 'image-compressor' || hash === '#compressor' || hash === '#image-compressor') {
            if (typeof window.openCompressorSection === 'function') {
                window.openCompressorSection();
                return true;
            }
        } else if (view === 'mp3-trimmer' || view === 'trimmer' || view === 'audio-cutter' || hash === '#mp3-trimmer' || hash === '#audio-cutter') {
            if (typeof window.openMp3TrimmerSection === 'function') {
                window.openMp3TrimmerSection();
                return true;
            }
        } else if (view === 'qr-code' || view === 'qrcode' || hash === '#qr-code' || hash === '#qrcode') {
            if (typeof window.openQrCodeSection === 'function') {
                window.openQrCodeSection();
                return true;
            }
        } else if (view === 'cool-text' || view === 'cooltext' || hash === '#cool-text' || hash === '#cooltext') {
            if (typeof window.openCoolTextSection === 'function') {
                window.openCoolTextSection();
                return true;
            }
        } else if (view === 'translator' || hash === '#translator') {
            if (typeof window.openTranslatorSection === 'function') {
                window.openTranslatorSection();
                return true;
            }
        }

        // Check if Android Native forwarded a pending PDF file from file manager
        if (window.Android && typeof window.Android.getPendingPdfData === 'function') {
            const pendingPdf = window.Android.getPendingPdfData();
            if (pendingPdf && pendingPdf.length > 0) {
                const pendingName = (typeof window.Android.getPendingPdfName === 'function') ? window.Android.getPendingPdfName() : "document.pdf";
                window.Android.clearPendingPdfData();
                if (typeof window.openPdfSection === 'function') {
                    window.openPdfSection(pendingPdf, pendingName);
                    return true;
                }
            }
        }
    } catch (e) {
        console.warn('checkInitialRoute error:', e);
    }
    return false;
}
window.checkInitialRoute = checkInitialRoute;

// Immediately execute route check
checkInitialRoute();

window.addEventListener('popstate', () => {
    checkInitialRoute();
});
window.addEventListener('hashchange', () => {
    checkInitialRoute();
});
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        checkInitialRoute();
    });
}



