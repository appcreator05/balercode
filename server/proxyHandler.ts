import type { IncomingMessage, ServerResponse } from 'http';

export const TARGET_URL = 'https://hdskay.blogspot.com';
export const FORCED_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K; AppSecret123) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

/**
 * Rewrites all links, forms, and assets in HTML so that every single navigation
 * stays within the proxy and preserves the forced User-Agent.
 */
function processHtmlContent(html: string, currentUrl: URL): string {
  const pageOrigin = currentUrl.origin;

  // 1. Completely neutralize and eliminate all "App Required" anti-WebView lock scripts
  html = html.replace(
    /document\.body\.innerHTML\s*=\s*['"]<style>[^'"]*App Required[^'"]*['"]\s*;?/gi,
    '/* App Required Lock Bypassed */ void 0;'
  );
  html = html.replace(
    /!function\s*\(\)\s*\{var u=navigator\.userAgent[\s\S]*?App Required[\s\S]*?\}\(\);?/gi,
    '/* App Required Function Bypassed */'
  );
  html = html.replace(
    /if\s*\(\s*\/compatible\|Macintosh\/im\.test\(navigator\.userAgent\)\s*\)\s*\{[^}]*\}/gi,
    '/* IMDb Redirect Check Bypassed */'
  );

  // 2. Rewrite all blogspot absolute links (both ' and ")
  // Examples: href='https://hdskay.blogspot.com/2026/08/awarapan-2-2026.html'
  html = html.replace(
    /href=(["'])(https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:blogspot\.[a-z.]+|vdosky\.in)(\/[^"']*)?)\1/gi,
    (_match, quote, fullTarget) => {
      return `href=${quote}/api/proxy?url=${encodeURIComponent(fullTarget)}${quote}`;
    }
  );

  // 3. Rewrite root-relative links like href='/2026/08/...' or href="/search/label/..."
  html = html.replace(
    /href=(["'])(\/(?:20\d\d|search|p|feeds|\?)[^"']*)\1/gi,
    (_match, quote, relativePath) => {
      const fullTarget = `${pageOrigin}${relativePath}`;
      return `href=${quote}/api/proxy?url=${encodeURIComponent(fullTarget)}${quote}`;
    }
  );

  // 4. Rewrite home links href="/" or href='/'
  html = html.replace(
    /href=(["'])\/(#|\?|$)([^"']*)\1/gi,
    (_match, quote, hashOrQuery, rest) => {
      const fullTarget = `${pageOrigin}/${hashOrQuery}${rest}`;
      return `href=${quote}/api/proxy?url=${encodeURIComponent(fullTarget)}${quote}`;
    }
  );

  // 5. Rewrite form actions
  html = html.replace(
    /action=(["'])(https?:\/\/(?:[a-zA-Z0-9-]+\.)*blogspot\.[a-z.]+(\/[^"']*)?|\/(?:search|p)[^"']*)\1/gi,
    (_match, quote, actionTarget) => {
      let fullTarget = actionTarget;
      if (actionTarget.startsWith('/')) {
        fullTarget = `${pageOrigin}${actionTarget}`;
      }
      return `action=${quote}/api/proxy?url=${encodeURIComponent(fullTarget)}${quote}`;
    }
  );

  // 6. Rewrite relative asset sources (images, stylesheets, favicons) to absolute URLs
  html = html.replace(
    /(<img[^>]*?src=)(["'])(\/[^/'"][^'"]*)\2/gi,
    (_match, pre, quote, path) => `${pre}${quote}${pageOrigin}${path}${quote}`
  );
  html = html.replace(
    /(<link[^>]*?href=)(["'])(\/[^/'"][^'"]*)\2/gi,
    (_match, pre, quote, path) => `${pre}${quote}${pageOrigin}${path}${quote}`
  );
  html = html.replace(
    /(<script[^>]*?src=)(["'])(\/[^/'"][^'"]*)\2/gi,
    (_match, pre, quote, path) => `${pre}${quote}${pageOrigin}${path}${quote}`
  );

  // 7. Force all links to stay inside the same WebView (never open new window/tab)
  html = html.replace(/target\s*=\s*["'](_blank|_top|_parent)["']/gi, 'target="_self"');

  // 8. Injection script: runs BEFORE any site script, locking User-Agent, hiding bulky desktop scrollbars and intercepting clicks
  const injectionScript = `
<!-- PERMANENT USER-AGENT WEBVIEW ENGINE -->
<style id="hdskay-clean-mobile-scrollbar">
  /* Eliminate bulky 17px desktop scrollbar taking up screen space */
  html, body {
    scrollbar-width: none !important; /* Firefox */
    -ms-overflow-style: none !important; /* IE 10+ / Edge */
    overflow-x: hidden !important;
    width: 100% !important;
    max-width: 100vw !important;
    margin-right: 0 !important;
    padding-right: 0 !important;
    box-sizing: border-box !important;
  }
  * {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }
  *::-webkit-scrollbar,
  ::-webkit-scrollbar {
    width: 0px !important;
    height: 0px !important;
    display: none !important;
    background: transparent !important;
  }
  ::-webkit-scrollbar-thumb {
    background: transparent !important;
  }
  ::-webkit-scrollbar-track {
    background: transparent !important;
  }
</style>
<script>
(function() {
  const FORCED_UA = ${JSON.stringify(FORCED_USER_AGENT)};
  const PAGE_URL = ${JSON.stringify(currentUrl.toString())};
  const PAGE_ORIGIN = ${JSON.stringify(pageOrigin)};

  function lockUserAgent() {
    try {
      // 1. Lock navigator.userAgent
      Object.defineProperty(navigator, 'userAgent', {
        get: function() { return FORCED_UA; },
        set: function() {},
        configurable: true,
        enumerable: true
      });

      // 2. Lock Navigator.prototype
      if (window.Navigator && Navigator.prototype) {
        Object.defineProperty(Navigator.prototype, 'userAgent', {
          get: function() { return FORCED_UA; },
          set: function() {},
          configurable: true,
          enumerable: true
        });
        Object.defineProperty(Navigator.prototype, 'appVersion', {
          get: function() { return FORCED_UA.replace(/^Mozilla\\//, ''); },
          set: function() {},
          configurable: true,
          enumerable: true
        });
        Object.defineProperty(Navigator.prototype, 'platform', {
          get: function() { return 'Linux armv8l'; },
          set: function() {},
          configurable: true,
          enumerable: true
        });
      }

      // 3. Lock navigator.appVersion
      Object.defineProperty(navigator, 'appVersion', {
        get: function() { return FORCED_UA.replace(/^Mozilla\//, ''); },
        set: function() {},
        configurable: true,
        enumerable: true
      });

      // 4. Lock navigator.platform
      Object.defineProperty(navigator, 'platform', {
        get: function() { return 'Linux armv8l'; },
        set: function() {},
        configurable: true,
        enumerable: true
      });

      // 5. Lock navigator.userAgentData
      if (navigator.userAgentData) {
        Object.defineProperty(navigator.userAgentData, 'mobile', {
          get: function() { return true; },
          configurable: true
        });
        Object.defineProperty(navigator.userAgentData, 'platform', {
          get: function() { return 'Android'; },
          configurable: true
        });
        Object.defineProperty(navigator, 'userAgentData', {
          get: function() {
            return {
              brands: [
                { brand: 'Chromium', version: '152' },
                { brand: 'Google Chrome', version: '152' },
                { brand: 'Android WebView', version: '152' }
              ],
              mobile: true,
              platform: 'Android',
              getHighEntropyValues: function() {
                return Promise.resolve({
                  brands: [
                    { brand: 'Chromium', version: '152' },
                    { brand: 'Google Chrome', version: '152' },
                    { brand: 'Android WebView', version: '152' }
                  ],
                  mobile: true,
                  platform: 'Android',
                  platformVersion: '10.0',
                  architecture: 'arm64',
                  bitness: '64',
                  model: 'K'
                });
              }
            };
          },
          configurable: true
        });
      }
    } catch (e) {
      // Ignore
    }
  }

  // Lock User-Agent immediately
  lockUserAgent();
  window.addEventListener('DOMContentLoaded', lockUserAgent);
  window.addEventListener('load', lockUserAgent);

  // Helper to convert any URL into a proxied URL
  function toProxiedUrl(target) {
    if (!target) return target;
    if (target.startsWith('/api/proxy') || target.includes('/api/proxy?url=')) {
      return target;
    }
    try {
      var absolute;
      if (target.startsWith('http://') || target.startsWith('https://')) {
        absolute = target;
      } else if (target.startsWith('/')) {
        absolute = PAGE_ORIGIN + target;
      } else {
        absolute = new URL(target, PAGE_URL).href;
      }
      return '/api/proxy?url=' + encodeURIComponent(absolute);
    } catch(e) {
      return target;
    }
  }

  // Check if a URL belongs to the internal blog domain
  function isInternalBlogUrl(target) {
    if (!target) return true;
    try {
      var absolute;
      if (target.startsWith('http://') || target.startsWith('https://')) {
        absolute = target;
      } else if (target.startsWith('/')) {
        absolute = PAGE_ORIGIN + target;
      } else {
        absolute = new URL(target, PAGE_URL).href;
      }
      var u = new URL(absolute);
      var h = u.hostname.toLowerCase();
      return h === 'hdskay.blogspot.com' ||
             h.endsWith('.blogspot.com') ||
             h === 'vdosky.in' ||
             h === window.location.hostname;
    } catch(e) {
      return true;
    }
  }

  function getAbsoluteUrl(target) {
    try {
      if (target.startsWith('http://') || target.startsWith('https://')) {
        return target;
      } else if (target.startsWith('/')) {
        return PAGE_ORIGIN + target;
      } else {
        return new URL(target, PAGE_URL).href;
      }
    } catch(e) {
      return target;
    }
  }

  // Open external / extra links in Chrome Custom Tab
  function openCustomTab(url) {
    var absUrl = getAbsoluteUrl(url);
    // 1. If in native Android app with StartApp bridge
    if (window.AndroidStartApp && typeof window.AndroidStartApp.openCustomTab === 'function') {
      window.AndroidStartApp.openCustomTab(absUrl);
      return;
    }
    // 2. If in Web preview, message parent to open sleek Custom Tab modal
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'HDSKAY_OPEN_CUSTOM_TAB',
        targetUrl: absUrl
      }, '*');
      return;
    }
    // 3. Fallback
    window.open(absUrl, '_blank');
  }

  // Helper to trigger page navigation with ad bridge support
  function navigateTo(target) {
    // If it's an external / extra link (not the blog), open in Custom Tab!
    if (!isInternalBlogUrl(target)) {
      openCustomTab(target);
      return;
    }

    var proxied = toProxiedUrl(target);
    if (!proxied) return;

    var absUrl = getAbsoluteUrl(target);

    // 1. If running inside Android native app, trigger Rewarded Video Ad via JavaScript bridge!
    if (window.AndroidStartApp && typeof window.AndroidStartApp.showRewardedVideoForUrl === 'function') {
      window.AndroidStartApp.showRewardedVideoForUrl(absUrl);
      return;
    }

    // 2. If running in Web preview, message parent to show Rewarded Video Ad!
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'HDSKAY_PAGE_NAV',
        targetUrl: proxied
      }, '*');
      return;
    }

    window.location.href = proxied;
  }

  // Intercept all clicks (capture phase: runs before any site script or event handler)
  function handleLinkClick(e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a) return;

    if (a.target && a.target !== '_self') {
      a.target = '_self';
    }

    var href = a.getAttribute('href');
    if (!href || href.startsWith('javascript:') || href === '#' || href.startsWith('data:')) {
      return;
    }

    // Trigger navigation with Rewarded Video Ad event
    e.preventDefault();
    e.stopPropagation();
    navigateTo(href);
  }

  window.addEventListener('click', handleLinkClick, true);
  document.addEventListener('click', handleLinkClick, true);

  // Intercept form submissions
  function handleFormSubmit(e) {
    var form = e.target;
    if (!form) return;
    var action = form.getAttribute('action') || window.location.href;

    var method = (form.method || 'GET').toUpperCase();
    if (method === 'GET') {
      e.preventDefault();
      var formData = new FormData(form);
      var params = new URLSearchParams(formData);
      var fullUrl = action + (action.includes('?') ? '&' : '?') + params.toString();
      navigateTo(fullUrl);
    } else {
      form.action = toProxiedUrl(action);
    }
  }
  window.addEventListener('submit', handleFormSubmit, true);

  // Intercept window.open
  window.open = function(url) {
    if (url && typeof url === 'string') {
      navigateTo(url);
      return window;
    }
    return null;
  };

  // Intercept location.assign & location.replace
  var origAssign = window.location.assign;
  window.location.assign = function(url) {
    navigateTo(url);
  };
  var origReplace = window.location.replace;
  window.location.replace = function(url) {
    navigateTo(url);
  };

  // Watchdog MutationObserver: if any "App Required" text or element is ever injected, remove it
  var observer = new MutationObserver(function(mutations) {
    var appReq = document.querySelector('.b h2, a[href*="com.imdb.mobile"]');
    if (appReq && appReq.closest('.b')) {
      appReq.closest('.b').remove();
    }
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Detect Video Fullscreen & Document Fullscreen to hide banner ad & switch orientation
  function notifyFullscreenChange(isFs) {
    if (window.AndroidStartApp) {
      if (typeof window.AndroidStartApp.setBannerVisibility === 'function') {
        window.AndroidStartApp.setBannerVisibility(!isFs);
      }
      if (typeof window.AndroidStartApp.setVideoFullscreen === 'function') {
        window.AndroidStartApp.setVideoFullscreen(isFs);
      }
    }

    // Try web screen orientation lock
    try {
      if (isFs && screen.orientation && typeof screen.orientation.lock === 'function') {
        screen.orientation.lock('landscape').catch(function() {});
      } else if (!isFs && screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      }
    } catch (e) {}

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'HDSKAY_FULLSCREEN_CHANGE',
        isFullscreen: isFs
      }, '*');
    }
  }

  function checkFullscreenState() {
    var isFs = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    notifyFullscreenChange(isFs);
  }

  document.addEventListener('fullscreenchange', checkFullscreenState);
  document.addEventListener('webkitfullscreenchange', checkFullscreenState);
  document.addEventListener('mozfullscreenchange', checkFullscreenState);
  document.addEventListener('webkitbeginfullscreen', function() { notifyFullscreenChange(true); }, true);
  document.addEventListener('webkitendfullscreen', function() { notifyFullscreenChange(false); }, true);

  document.addEventListener('play', function(e) {
    var v = e.target;
    if (v && v.tagName === 'VIDEO') {
      v.addEventListener('webkitbeginfullscreen', function() { notifyFullscreenChange(true); });
      v.addEventListener('webkitendfullscreen', function() { notifyFullscreenChange(false); });
    }
  }, true);

  // Keep Screen Awake (Screen Wake Lock API)
  if ('wakeLock' in navigator) {
    var screenWakeLock = null;
    var acquireWakeLock = function() {
      try {
        navigator.wakeLock.request('screen').then(function(lock) {
          screenWakeLock = lock;
        }).catch(function() {});
      } catch (e) {}
    };
    acquireWakeLock();
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') acquireWakeLock();
    });
  }
})();
</script>
`;

  // Inject at the very beginning of <head> or <html>
  if (html.includes('<head>')) {
    return html.replace('<head>', '<head>' + injectionScript);
  } else if (html.includes('<html>')) {
    return html.replace('<html>', '<html><head>' + injectionScript + '</head>');
  } else {
    return injectionScript + html;
  }
}

export async function handleProxyRequest(
  req: IncomingMessage,
  res: ServerResponse
) {
  try {
    const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

    // Diagnostic API endpoint
    if (reqUrl.pathname === '/api/info') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(
        JSON.stringify({
          status: 'ok',
          targetUrl: TARGET_URL,
          forcedUserAgent: FORCED_USER_AGENT,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    let queryUrl = reqUrl.searchParams.get('url');

    // If no ?url parameter, check if the request was made directly to a Blogger path like /2026/08/...
    if (!queryUrl) {
      if (reqUrl.pathname !== '/api/proxy') {
        queryUrl = `${TARGET_URL}${reqUrl.pathname}${reqUrl.search}`;
      } else {
        queryUrl = TARGET_URL;
      }
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(queryUrl.startsWith('http') ? queryUrl : `https://${queryUrl}`);
    } catch {
      targetUrl = new URL(TARGET_URL);
    }

    // Forward request with strictly enforced custom User-Agent
    const forwardHeaders: Record<string, string> = {
      'User-Agent': FORCED_USER_AGENT,
      'Accept':
        (req.headers['accept'] as string) ||
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': (req.headers['accept-language'] as string) || 'en-US,en;q=0.9,bn;q=0.8',
      'Referer': targetUrl.origin,
    };

    if (req.headers['cookie']) {
      forwardHeaders['Cookie'] = req.headers['cookie'] as string;
    }

    let requestBody: Buffer | undefined = undefined;
    if (req.method && ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase())) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      if (chunks.length > 0) {
        requestBody = Buffer.concat(chunks);
        if (req.headers['content-type']) {
          forwardHeaders['Content-Type'] = req.headers['content-type'] as string;
        }
      }
    }

    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: req.method || 'GET',
      headers: forwardHeaders,
      body: requestBody,
      redirect: 'follow',
    });

    const finalUrl = new URL(upstreamResponse.url || targetUrl.toString());
    const contentType = upstreamResponse.headers.get('content-type') || 'text/html';

    const responseHeaders: Record<string, string | number> = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'X-Proxied-By': 'HDSKay-WebView-Core',
      'X-Forced-User-Agent': FORCED_USER_AGENT,
      'X-Final-Target-Url': finalUrl.toString(),
    };

    const setCookie = upstreamResponse.headers.get('set-cookie');
    if (setCookie) {
      responseHeaders['Set-Cookie'] = setCookie;
    }

    const isHtml = contentType.toLowerCase().includes('text/html');

    if (isHtml) {
      const rawHtml = await upstreamResponse.text();
      const processedHtml = processHtmlContent(rawHtml, finalUrl);
      const bodyBuffer = Buffer.from(processedHtml, 'utf-8');
      responseHeaders['Content-Length'] = bodyBuffer.length;

      res.writeHead(upstreamResponse.status, responseHeaders);
      res.end(bodyBuffer);
    } else {
      const arrayBuffer = await upstreamResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      responseHeaders['Content-Length'] = buffer.length;

      res.writeHead(upstreamResponse.status, responseHeaders);
      res.end(buffer);
    }
  } catch (error: any) {
    console.error('Proxy request failed:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Proxy Error',
        message: error?.message || 'Failed to proxy request',
      })
    );
  }
}
