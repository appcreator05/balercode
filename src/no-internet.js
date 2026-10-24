/**
 * Global No-Internet Lifecycle Manager
 * Handles offline detection, displays a modern custom popup,
 * auto-dismisses when internet is back ON with NO page reload,
 * and shows a smooth back-online toast.
 */

(function initNoInternetModule() {
  // Styles for dynamic injection (if not already embedded in HTML)
  const CSS_STYLES = `
    .no-internet-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(4, 7, 15, 0.92);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483640;
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.35s ease;
      padding: 16px;
      box-sizing: border-box;
    }
    .no-internet-overlay.show {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }
    .no-internet-card {
      background: linear-gradient(160deg, #131722 0%, #0d1017 100%);
      border: 1.5px solid rgba(239, 68, 68, 0.45);
      border-radius: 22px;
      padding: 32px 24px 26px 24px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      color: #ffffff;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif;
      box-shadow: 0 25px 70px rgba(0, 0, 0, 0.8), 0 0 45px rgba(239, 68, 68, 0.2);
      transform: scale(0.85) translateY(24px);
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      overflow: hidden;
      box-sizing: border-box;
    }
    .no-internet-overlay.show .no-internet-card {
      transform: scale(1) translateY(0);
    }
    .no-internet-card.shake {
      animation: noInternetCardShake 0.5s ease-in-out;
    }
    @keyframes noInternetCardShake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }
    .no-internet-icon-wrap {
      position: relative;
      width: 84px;
      height: 84px;
      margin: 0 auto 18px auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .no-internet-icon-pulse {
      position: absolute;
      width: 84px;
      height: 84px;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.22);
      animation: noInternetPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes noInternetPulse {
      0% { transform: scale(0.9); opacity: 0.8; }
      50% { transform: scale(1.3); opacity: 0.15; }
      100% { transform: scale(0.9); opacity: 0.8; }
    }
    .no-internet-icon {
      position: relative;
      z-index: 2;
      width: 66px;
      height: 66px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(239, 68, 68, 0.45);
    }
    .no-internet-icon svg {
      width: 34px;
      height: 34px;
      stroke: #ffffff;
    }
    .no-internet-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fca5a5;
      font-size: 12px;
      font-weight: 600;
      padding: 5px 14px;
      border-radius: 20px;
      margin-bottom: 14px;
      letter-spacing: 0.3px;
    }
    .no-internet-badge .badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
      box-shadow: 0 0 8px #ef4444;
      animation: noInternetDotBlink 1.2s infinite ease-in-out;
    }
    @keyframes noInternetDotBlink {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .no-internet-title {
      margin: 0 0 4px 0;
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.2px;
    }
    .no-internet-subtitle {
      margin: 0 0 14px 0;
      font-size: 13px;
      font-weight: 500;
      color: #94a3b8;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .no-internet-desc {
      margin: 0 0 16px 0;
      font-size: 14.5px;
      line-height: 1.55;
      color: #cbd5e1;
    }
    .no-internet-auto-hint {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px dashed rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 10px 14px;
      margin-bottom: 22px;
      font-size: 12.5px;
      color: #38bdf8;
      line-height: 1.4;
    }
    .no-internet-auto-hint .auto-hint-icon {
      font-size: 16px;
      flex-shrink: 0;
    }
    .no-internet-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .no-internet-btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 13px 20px;
      background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
      color: #ffffff;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 6px 20px rgba(2, 132, 199, 0.35);
      transition: all 0.2s ease;
    }
    .no-internet-btn-primary:hover {
      background: linear-gradient(135deg, #0369a1 0%, #075985 100%);
      transform: translateY(-1px);
    }
    .no-internet-btn-primary:active {
      transform: translateY(1px);
    }
    .no-internet-btn-primary:disabled {
      opacity: 0.7;
      cursor: not-allowed;
      transform: none;
    }
    .no-internet-btn-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .no-internet-foot-note {
      margin-top: 14px;
      font-size: 11.5px;
      color: #64748b;
    }
    .back-online-toast {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(-70px);
      z-index: 2147483641;
      background: linear-gradient(135deg, #059669 0%, #10b981 100%);
      color: #ffffff;
      padding: 10px 20px;
      border-radius: 30px;
      box-shadow: 0 10px 35px rgba(16, 185, 129, 0.45);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif;
    }
    .back-online-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .back-online-toast-content {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .online-toast-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: rgba(255, 255, 255, 0.25);
      border-radius: 50%;
      font-size: 14px;
      font-weight: 800;
    }
    .online-toast-text {
      display: flex;
      flex-direction: column;
      text-align: left;
      line-height: 1.25;
    }
    .online-toast-text strong {
      font-size: 13.5px;
      font-weight: 700;
    }
    .online-toast-text small {
      font-size: 11px;
      opacity: 0.9;
    }
  `;

  function ensureElementsExist() {
    if (!document.getElementById('noInternetModal')) {
      // Inject CSS if needed
      if (!document.getElementById('no-internet-injected-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'no-internet-injected-styles';
        styleEl.textContent = CSS_STYLES;
        document.head.appendChild(styleEl);
      }

      // Inject Modal & Toast HTML
      const container = document.createElement('div');
      container.innerHTML = `
        <div id="noInternetModal" class="no-internet-overlay" aria-hidden="true" role="dialog" aria-modal="true">
          <div class="no-internet-card" onclick="event.stopPropagation()">
            <div class="no-internet-icon-wrap">
              <div class="no-internet-icon-pulse"></div>
              <div class="no-internet-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
                  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                  <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
                  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                  <line x1="12" y1="20" x2="12.01" y2="20"></line>
                </svg>
              </div>
            </div>
            <div class="no-internet-badge" id="noInternetStatusBadge">
              <span class="badge-dot"></span>
              <span id="noInternetStatusText">Offline • No Connection</span>
            </div>
            <h3 id="noInternetTitle" class="no-internet-title">No Internet Connection</h3>
            <p class="no-internet-subtitle">Connection Lost</p>
            <p class="no-internet-desc" id="noInternetDesc">
              Your device is currently offline. Please check your Wi-Fi or mobile data connection to continue.
            </p>
            <div class="no-internet-auto-hint">
              <span class="auto-hint-icon">⚡</span>
              <span>This popup will automatically close once you are back online without reloading the page.</span>
            </div>
            <div class="no-internet-actions">
              <button type="button" id="noInternetCheckBtn" class="no-internet-btn-primary" onclick="window.checkInternetStatusNow()">
                <span class="no-internet-btn-spinner" id="noInternetBtnSpinner" style="display: none;"></span>
                <span id="noInternetBtnIcon"><i class="fa-solid fa-rotate"></i></span>
                <span id="noInternetBtnText">Check Connection</span>
              </button>
            </div>
            <div class="no-internet-foot-note" id="noInternetFootNote">
              Will auto-dismiss as soon as your internet is restored
            </div>
          </div>
        </div>
        <div id="backOnlineToast" class="back-online-toast" aria-live="polite">
          <div class="back-online-toast-content">
            <span class="online-toast-icon">✓</span>
            <div class="online-toast-text">
              <strong>Internet Restored!</strong>
              <small>Back Online • Continuing without reload</small>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(container);
    }
  }

  let isModalVisible = false;
  let pollingInterval = null;
  let toastTimeout = null;

  function showPopup() {
    ensureElementsExist();
    const modal = document.getElementById('noInternetModal');
    if (!modal || isModalVisible) return;

    isModalVisible = true;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');

    const badgeText = document.getElementById('noInternetStatusText');
    if (badgeText) badgeText.textContent = 'Offline • No Connection';

    const footNote = document.getElementById('noInternetFootNote');
    if (footNote) footNote.textContent = 'Will auto-dismiss as soon as your internet is restored';

    startAutoRecoveryPolling();
  }

  function hidePopup(showToast) {
    const modal = document.getElementById('noInternetModal');
    if (!modal || !isModalVisible) return;

    isModalVisible = false;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');

    stopAutoRecoveryPolling();

    if (showToast) {
      const toast = document.getElementById('backOnlineToast');
      if (toast) {
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
          toast.classList.remove('show');
        }, 3400);
      }
    }
  }

  function startAutoRecoveryPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
      if (typeof navigator.onLine === 'boolean' && navigator.onLine) {
        hidePopup(true);
      }
    }, 1800);
  }

  function stopAutoRecoveryPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  // Network event listeners
  window.addEventListener('offline', () => {
    showPopup();
  });

  window.addEventListener('online', () => {
    // Automatically hide without reloading!
    hidePopup(true);
  });

  // Re-check action
  window.checkInternetStatusNow = async function() {
    const btn = document.getElementById('noInternetCheckBtn');
    const spinner = document.getElementById('noInternetBtnSpinner');
    const icon = document.getElementById('noInternetBtnIcon');
    const text = document.getElementById('noInternetBtnText');
    const card = document.querySelector('.no-internet-card');
    const footNote = document.getElementById('noInternetFootNote');

    if (btn) btn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (icon) icon.style.display = 'none';
    if (text) text.textContent = 'Checking...';

    let isActuallyOnline = typeof navigator.onLine === 'boolean' ? navigator.onLine : false;

    if (isActuallyOnline) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(window.location.origin + '/?_netcheck=' + Date.now(), {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (res.status >= 200 && res.status < 600) {
          isActuallyOnline = true;
        }
      } catch (e) {
        // Fall back to navigator.onLine
      }
    }

    setTimeout(() => {
      if (spinner) spinner.style.display = 'none';
      if (icon) icon.style.display = 'inline-block';
      if (btn) btn.disabled = false;

      if (isActuallyOnline && (typeof navigator.onLine !== 'boolean' || navigator.onLine)) {
        if (text) text.textContent = 'Connected!';
        hidePopup(true);
        setTimeout(() => {
          if (text) text.textContent = 'Check Connection';
        }, 1000);
      } else {
        if (text) text.textContent = 'Check Connection';
        if (footNote) {
          footNote.textContent = 'Still offline. Please enable Wi-Fi or mobile data.';
          footNote.style.color = '#f87171';
          setTimeout(() => {
            if (footNote) {
              footNote.textContent = 'Will auto-dismiss as soon as your internet is restored';
              footNote.style.color = '#64748b';
            }
          }, 3500);
        }
        if (card) {
          card.classList.add('shake');
          setTimeout(() => card.classList.remove('shake'), 550);
        }
      }
    }, 600);
  };

  // Expose global methods
  window.showNoInternetModal = showPopup;
  window.hideNoInternetModal = hidePopup;
  window.testNoInternetModal = function(forceOffline) {
    if (forceOffline) showPopup();
    else hidePopup(true);
  };

  function checkInitial() {
    ensureElementsExist();
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) {
      showPopup();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkInitial);
  } else {
    checkInitial();
  }
})();
