import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  get,
  update,
  remove,
  push,
  onValue,
  Unsubscribe
} from 'firebase/database';

/* ========================================================
   Firebase RTDB Configuration (User-Provided Config)
   ======================================================== */
export const subscriptionFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_SUBSCRIPTION_API_KEY || "AIzaSyCyDd6rCV7WaQe8sMF0Xmob3dpm6z6wEEQ",
  authDomain: "myapps-4a8eb.firebaseapp.com",
  databaseURL: "https://myapps-4a8eb-default-rtdb.firebaseio.com",
  projectId: "myapps-4a8eb",
};

// Named singleton app for subscription to avoid collision with any default Firebase instance
export const subscriptionApp = getApps().some((a) => a.name === 'subscriptionApp')
  ? getApp('subscriptionApp')
  : initializeApp(subscriptionFirebaseConfig, 'subscriptionApp');

export const subscriptionDb = getDatabase(subscriptionApp);

export const HOME_URL = "go:paid"; // Redirect link on success
export const RAZORPAY_KEY_ID = "rzp_live_T2PygvcB7moN7R";

/* ========================================================
   Subscription & Payment User Agent (Forces Real Android Chrome for UPI App Availability)
   ======================================================== */
export const SUBSCRIPTION_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

export function applySubscriptionUserAgent(): void {
  try {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      try {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => SUBSCRIPTION_USER_AGENT,
          configurable: true
        });
      } catch (e) {
        try {
          (navigator as any).__defineGetter__('userAgent', () => SUBSCRIPTION_USER_AGENT);
        } catch (err) {}
      }
      try {
        Object.defineProperty(navigator, 'appVersion', {
          get: () => "5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
          configurable: true
        });
      } catch (e) {}
      try {
        Object.defineProperty(navigator, 'platform', {
          get: () => "Linux armv8l",
          configurable: true
        });
      } catch (e) {}
    }
  } catch (err) {
    console.warn("Could not apply subscription user agent:", err);
  }

  // Also notify native Android bridge if available
  try {
    if (typeof window !== 'undefined' && (window as any).Android) {
      if (typeof (window as any).Android.applySubscriptionUserAgent === 'function') {
        (window as any).Android.applySubscriptionUserAgent();
      }
    }
  } catch (e) {}
}

// Auto-apply immediately when module loads
if (typeof window !== 'undefined') {
  applySubscriptionUserAgent();
}

/* ========================================================
   Device ID Generator (Single-Device Enforcement)
   ======================================================== */
export function getDeviceId(): string {
  let id = typeof localStorage !== 'undefined' ? localStorage.getItem("device_id") : null;
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2, 12);
    try {
      localStorage.setItem("device_id", id);
    } catch {}
  }
  return id;
}

/* ========================================================
   Pricing Plans (User-Provided Plans)
   ======================================================== */
export interface SubscriptionPlan {
  name: string;
  price: number;
  days: number;
  durationText: string;
  deviceLimitText: string;
  daysDuration?: number;
  text?: string;
  link?: string;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    name: "Basic Plan",
    price: 20.00,
    days: 5,
    durationText: "5 Day(s)",
    deviceLimitText: "Device Limit - 1",
    daysDuration: 5,
    text: "Basic Plan — ₹20.00 (5 Days)"
  },
  {
    name: "Premium Plan",
    price: 70.99,
    days: 30,
    durationText: "1 Month(s)",
    deviceLimitText: "Device Limit - 1",
    daysDuration: 30,
    text: "Premium Plan — ₹70.99 (1 Month)"
  },
  {
    name: "Platinum Plan",
    price: 500.00,
    days: 180,
    durationText: "6 Month(s)",
    deviceLimitText: "Device Limit - 1",
    daysDuration: 180,
    text: "Platinum Plan — ₹500.00 (6 Months)"
  },
  {
    name: "Diamond Plan",
    price: 800.00,
    days: 365,
    durationText: "1 Year(s)",
    deviceLimitText: "Device Limit - 1",
    daysDuration: 365,
    text: "Diamond Plan — ₹800.00 (1 Year)"
  }
];

export interface ActiveSubscriptionResult {
  isSubscribed: boolean;
  expiryDate: Date | null;
  daysRemaining: number;
  planName?: string;
  subscription?: any;
}

/* ========================================================
   Check Active Subscription in Firebase
   - Scans /subscriptions
   - Removes expired items
   - Matches device_id
   ======================================================== */
export async function checkActiveSubscription(): Promise<ActiveSubscriptionResult> {
  const deviceId = getDeviceId();
  try {
    const snap = await get(ref(subscriptionDb, "subscriptions"));
    const data = snap.val();
    const now = Date.now();

    if (!data) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem("vdosky_is_vip");
      if (typeof window !== 'undefined') {
        (window as any).__isVipSubscribed = false;
        (window as any).__hasActiveSubscription = false;
      }
      return { isSubscribed: false, expiryDate: null, daysRemaining: 0 };
    }

    let activeSub: any = null;

    for (const id in data) {
      const s = data[id];
      if (!s) continue;
      if (now > s.expireAt) {
        // Expired subscription - remove from Firebase
        await remove(ref(subscriptionDb, "subscriptions/" + id)).catch(() => {});
        continue;
      }
      if (s.device_id === deviceId) {
        activeSub = s;
        break;
      }
    }

    if (activeSub) {
      const daysRemaining = Math.max(1, Math.ceil((activeSub.expireAt - now) / 86400000));
      const expiryDate = new Date(activeSub.expireAt);
      if (typeof localStorage !== 'undefined') localStorage.setItem("vdosky_is_vip", "true");
      if (typeof window !== 'undefined') {
        (window as any).__isVipSubscribed = true;
        (window as any).__hasActiveSubscription = true;
      }
      return {
        isSubscribed: true,
        expiryDate,
        daysRemaining,
        planName: activeSub.validityDays ? `${activeSub.validityDays} Days Plan` : "VIP Plan",
        subscription: activeSub
      };
    } else {
      if (typeof localStorage !== 'undefined') localStorage.removeItem("vdosky_is_vip");
      if (typeof window !== 'undefined') {
        (window as any).__isVipSubscribed = false;
        (window as any).__hasActiveSubscription = false;
      }
      return { isSubscribed: false, expiryDate: null, daysRemaining: 0 };
    }
  } catch (error) {
    console.error("Subscription check error:", error);
    const cached = typeof localStorage !== 'undefined' && localStorage.getItem("vdosky_is_vip") === "true";
    return { isSubscribed: cached, expiryDate: null, daysRemaining: 0 };
  }
}

/* ========================================================
   Save Subscription to Firebase RTDB
   ======================================================== */
export async function saveSubscriptionToFirebase(days: number): Promise<void> {
  const now = Date.now();
  const deviceId = getDeviceId();
  const newRef = push(ref(subscriptionDb, "subscriptions"));

  await update(newRef, {
    password: Math.random().toString(36).slice(2, 14),
    used: true,
    createdAt: now,
    expireAt: now + days * 86400000,
    validityDays: days,
    device_id: deviceId
  });

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem("vdosky_is_vip", "true");
  }
  if (typeof window !== 'undefined') {
    (window as any).__isVipSubscribed = true;
    (window as any).__hasActiveSubscription = true;
  }
}

/* ========================================================
   Custom Alert Popup Triggers
   ======================================================== */
export function showCustomAlert(): void {
  const alertBox = document.getElementById("customAlert");
  if (alertBox) {
    alertBox.classList.add("show");
  }
}

export function hideCustomAlert(): void {
  const alertBox = document.getElementById("customAlert");
  if (alertBox) {
    alertBox.classList.remove("show");
  }
}

/* ========================================================
   Razorpay Payment & Activation
   ======================================================== */
export function payAndActivate(
  amount: number,
  days: number,
  planName: string,
  buttonEl?: HTMLElement | null,
  onSuccess?: () => void
): void {
  // Ensure Android Chrome User Agent is active for UPI app visibility
  applySubscriptionUserAgent();

  if (buttonEl) {
    buttonEl.setAttribute("disabled", "true");
    buttonEl.textContent = "Processing...";
  }

  function launchRazorpay() {
    const RazorpayConstructor = (window as any).Razorpay;
    if (!RazorpayConstructor) {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast('Payment system is loading, please try again in a moment.');
      } else {
        console.warn('Razorpay SDK is loading, please try again in a moment.');
      }
      if (buttonEl) {
        buttonEl.removeAttribute("disabled");
        buttonEl.textContent = "SELECT PLAN";
      }
      return;
    }

    const options = {
      key: RAZORPAY_KEY_ID,
      amount: Math.round(amount * 100),
      currency: "INR",
      name: planName,
      description: `Premium Access for ${days} Days`,
      handler: async function (response: any) {
        if (response && response.razorpay_payment_id) {
          try {
            await saveSubscriptionToFirebase(days);
            showCustomAlert();

            if (onSuccess) {
              onSuccess();
            }

            // 2 seconds popup display then return/redirect
            setTimeout(() => {
              hideCustomAlert();
              try {
                // If native scheme or browser redirect
                if (typeof window !== 'undefined' && window.location.href.startsWith("http")) {
                  // In SPA app, close subscription view or navigate
                  if (typeof (window as any).handleMenuOrBack === 'function') {
                    (window as any).handleMenuOrBack();
                  } else {
                    window.location.href = HOME_URL;
                  }
                } else {
                  window.location.href = HOME_URL;
                }
              } catch (e) {
                if (typeof (window as any).handleMenuOrBack === 'function') {
                  (window as any).handleMenuOrBack();
                }
              }
            }, 2000);
          } catch (e) {
            console.error("Database Error:", e);
            if (typeof (window as any).showToast === 'function') {
              (window as any).showToast("Database Error! Contact Support.");
            }
            if (buttonEl) {
              buttonEl.removeAttribute("disabled");
              buttonEl.textContent = "SELECT PLAN";
            }
          }
        }
      },
      modal: {
        ondismiss: function () {
          if (buttonEl) {
            buttonEl.removeAttribute("disabled");
            buttonEl.textContent = "SELECT PLAN";
          }
        }
      },
      theme: {
        color: "#e50914"
      }
    };

    const rzp = new RazorpayConstructor(options);
    rzp.open();
  }

  // Load Razorpay if not yet present
  if (typeof (window as any).Razorpay === 'undefined') {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => launchRazorpay();
    script.onerror = () => {
      if (typeof (window as any).showToast === 'function') {
        (window as any).showToast("Failed to load Razorpay payment gateway. Please check your network connection.");
      } else {
        console.warn("Failed to load Razorpay payment gateway. Please check your network connection.");
      }
      if (buttonEl) {
        buttonEl.removeAttribute("disabled");
        buttonEl.textContent = "SELECT PLAN";
      }
    };
    document.head.appendChild(script);
  } else {
    launchRazorpay();
  }
}

// Attach globally for inline HTML onclick handlers
if (typeof window !== 'undefined') {
  (window as any).payAndActivate = payAndActivate;
  (window as any).checkActiveSubscription = checkActiveSubscription;
  (window as any).saveSubscriptionToFirebase = saveSubscriptionToFirebase;
  (window as any).showCustomAlert = showCustomAlert;
  (window as any).hideCustomAlert = hideCustomAlert;
  (window as any).applySubscriptionUserAgent = applySubscriptionUserAgent;
  (window as any).SUBSCRIPTION_USER_AGENT = SUBSCRIPTION_USER_AGENT;
}

/* ========================================================
   Backward Compatibility Helpers
   ======================================================== */
export function getCachedIsSubscribed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem("vdosky_is_vip") === "true";
}

export function getStoredSafeId(): string {
  return getDeviceId();
}

export function getStoredUserIdentifier(): string | null {
  return getDeviceId();
}

export function sanitizeSubscriptionId(rawId: string): string {
  return rawId ? rawId.trim().replace(/[^a-zA-Z0-9_-]/g, '_') : getDeviceId();
}

export async function checkAndHandleSubscriptionExpiry(_safeId?: string) {
  const res = await checkActiveSubscription();
  return {
    isSubscribed: res.isSubscribed,
    userData: null,
    expiredJustNow: false,
    daysRemaining: res.daysRemaining,
    expiryDate: res.expiryDate,
    deviceMismatched: false,
    sessionMismatched: false
  };
}

export function listenToUserBalance(_safeId: string, callback: (balance: number) => void): Unsubscribe {
  callback(0);
  return () => {};
}

export async function authenticateSubscriptionUser(
  _type: 'email' | 'mobile',
  _rawId: string,
  _pin: string
) {
  return { success: true, user: { identifier: getDeviceId(), balance: 0 } };
}

export async function loginOrRegisterSubscriptionUser(
  _rawId: string,
  _pin: string
) {
  return { success: true, user: { identifier: getDeviceId(), balance: 0 } };
}

export async function paySubscriptionFromWallet(
  _safeId: string,
  plan: SubscriptionPlan
) {
  await saveSubscriptionToFirebase(plan.days);
  return { success: true, plan };
}

export async function logoutSubscriptionUser() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem("vdosky_is_vip");
  }
  if (typeof window !== 'undefined') {
    (window as any).__isVipSubscribed = false;
    (window as any).__hasActiveSubscription = false;
  }
}

export function logoutSubscriptionUserLocalOnly() {
  logoutSubscriptionUser();
}

export function listenToActiveSession(_safeId: string, _onKicked: (reason: string) => void): Unsubscribe {
  return () => {};
}
