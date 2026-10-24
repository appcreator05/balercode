package com.sayantika.eara;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.startapp.sdk.ads.banner.Banner;
import com.startapp.sdk.adsbase.Ad;
import com.startapp.sdk.adsbase.StartAppAd;
import com.startapp.sdk.adsbase.StartAppSDK;
import com.startapp.sdk.adsbase.VideoListener;
import com.startapp.sdk.adsbase.adlisteners.AdDisplayListener;
import com.startapp.sdk.adsbase.adlisteners.AdEventListener;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    public static final String START_IO_APP_ID = "203877183";
    public static final boolean ENABLE_TEST_ADS = false; // 100% Real Production Ads
    public static final String FORCED_USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Safari/53";
    public static final String TARGET_URL = "https://hdskay.blogspot.com";
    private static final int PERMISSION_REQUEST_CODE = 2001;

    private WebView webView;
    private ProgressBar progressBar;
    private RelativeLayout rootLayout;
    private Banner startAppBanner;

    // Splash overlay view
    private FrameLayout splashOverlay;

    // Video Fullscreen containers & state
    private FrameLayout fullscreenContainer;
    private View customVideoView = null;
    private WebChromeClient.CustomViewCallback customViewCallback = null;
    private boolean isVideoFullscreen = false;

    private RelativeLayout noInternetLayout;
    private boolean isOffline = false;

    // Start.io Ads
    private StartAppAd rewardedVideoAd;
    private StartAppAd interstitialAd;
    private boolean isInterstitialLoading = false;
    private long lastInterstitialShownTime = System.currentTimeMillis();
    private static final long INTERSTITIAL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    private static final long INTERSTITIAL_CHECK_INTERVAL_MS = 30 * 1000; // check every 30 seconds

    // Navigation queue: holds target URL until Rewarded Video Ad is finished
    private String pendingUrlToLoad = null;
    private boolean isNavigatingPostAd = false;

    private final Handler adHandler = new Handler(Looper.getMainLooper());

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    private final Runnable interstitialPeriodicChecker = new Runnable() {
        @Override
        public void run() {
            checkAndShowPeriodicInterstitial();
            adHandler.postDelayed(this, INTERSTITIAL_CHECK_INTERVAL_MS);
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Immersive True Fullscreen Mode (Hide System Bottom Navigation Bar & Status Bar)
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window window = getWindow();
        window.setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        hideSystemUI();

        // 2. Initialize Start.io SDK in 100% Real Live Production Ads Mode
        try {
            StartAppSDK.init(this, START_IO_APP_ID, false);
            StartAppSDK.setTestAdsEnabled(false);
            Log.d("StartApp", "StartApp SDK initialized for Real Ads (Test Mode: OFF).");
        } catch (Exception e) {
            Log.e("StartApp", "Error initializing StartApp SDK: " + e.getMessage());
        }

        // 3. Build Layout Hierarchy Dynamically
        rootLayout = new RelativeLayout(this);
        rootLayout.setBackgroundColor(0xFF0F172A);
        setContentView(rootLayout);

        // 4. Fullscreen Video Container (placed beneath banner, above webView)
        fullscreenContainer = new FrameLayout(this);
        fullscreenContainer.setBackgroundColor(Color.BLACK);
        fullscreenContainer.setVisibility(View.GONE);
        RelativeLayout.LayoutParams fsParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        rootLayout.addView(fullscreenContainer, fsParams);

        // 5. Initialize WebView & Progress Bar
        setupWebView();
        setupProgressBar();

        // 6. Initialize Start.io Banner Ad at bottom
        setupStartAppBanner();

        // 7. Initialize Pre-loaded Ads (Rewarded Video + Interstitial)
        preloadRewardedVideoAd();
        preloadInterstitialAd();

        // 8. Build Offline "No Internet" Dialog (English UI)
        buildNoInternetPopup();

        // 9. Setup Native Splash Screen Overlay
        setupSplashScreen();

        // 10. Request Required App Permissions
        checkAndRequestAppPermissions();

        // 11. Register Real-Time Network Connectivity Listener
        setupNetworkMonitoring();

        // 12. Start 10-Minute Interstitial Schedule (Checks periodically and auto-triggers on exact time)
        adHandler.postDelayed(interstitialPeriodicChecker, INTERSTITIAL_CHECK_INTERVAL_MS);

        // 13. Deep Link Handling & Initial Page Load
        handleDeepLink(getIntent());
        if (webView.getUrl() == null || webView.getUrl().isEmpty()) {
            if (isNetworkAvailable()) {
                webView.loadUrl(TARGET_URL);
            } else {
                showNoInternetPopup();
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    /**
     * Handles deep linking from web URLs or custom app scheme (movieapp://).
     */
    private void handleDeepLink(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri data = intent.getData();
        String scheme = data.getScheme();

        if ("movieapp".equalsIgnoreCase(scheme)) {
            String queryUrl = data.getQueryParameter("url");
            if (queryUrl != null && !queryUrl.isEmpty()) {
                if (webView != null) webView.loadUrl(queryUrl);
            } else {
                String host = data.getHost();
                String path = data.getPath();
                if (host != null) {
                    String fullUrl = "https://" + host + (path != null ? path : "");
                    if (webView != null) webView.loadUrl(fullUrl);
                }
            }
        } else if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            if (webView != null) {
                webView.loadUrl(data.toString());
            }
        }
    }

    /**
     * Checks and requests user permissions for location, camera, storage, audio, etc.
     */
    private void checkAndRequestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            List<String> needed = new ArrayList<>();

            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.CAMERA);
            }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.RECORD_AUDIO);
            }
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
            if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            }
            if (checkSelfPermission(Manifest.permission.MODIFY_AUDIO_SETTINGS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
            }
            if (checkSelfPermission(Manifest.permission.VIBRATE) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.VIBRATE);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.READ_MEDIA_IMAGES);
                }
                if (checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.READ_MEDIA_VIDEO);
                }
                if (checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.READ_MEDIA_AUDIO);
                }
            } else {
                if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                }
                if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                }
            }

            if (!needed.isEmpty()) {
                requestPermissions(needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
            }
        }
    }

    /**
     * Native Splash Screen Overlay with smooth fade-out
     */
    private void setupSplashScreen() {
        splashOverlay = new FrameLayout(this);
        splashOverlay.setBackgroundColor(0xFF000000);

        ImageView splashImage = new ImageView(this);
        splashImage.setImageResource(R.drawable.splash);
        splashImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
        FrameLayout.LayoutParams imgParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        splashOverlay.addView(splashImage, imgParams);

        RelativeLayout.LayoutParams overlayParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        rootLayout.addView(splashOverlay, overlayParams);
        splashOverlay.bringToFront();

        // Fade out splash screen after 2.5 seconds
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (splashOverlay != null && splashOverlay.getVisibility() == View.VISIBLE) {
                splashOverlay.animate()
                        .alpha(0f)
                        .setDuration(400)
                        .withEndAction(() -> {
                            if (splashOverlay != null) {
                                splashOverlay.setVisibility(View.GONE);
                            }
                        });
            }
        }, 2500);
    }

    /**
     * Hides the bottom banner ad (used during video fullscreen).
     */
    public void hideBannerAd() {
        runOnUiThread(() -> {
            if (startAppBanner != null) {
                startAppBanner.setVisibility(View.GONE);
            }
        });
    }

    /**
     * Shows the bottom banner ad (restored when exiting video fullscreen).
     */
    public void showBannerAd() {
        runOnUiThread(() -> {
            if (startAppBanner != null && !isVideoFullscreen && customVideoView == null) {
                startAppBanner.setVisibility(View.VISIBLE);
                startAppBanner.bringToFront();
            }
        });
    }

    /**
     * Intercepts a post click, displays Rewarded Video Ad (with multi-tier fallback), and loads destination on completion.
     */
    public void handlePostClick(final String targetUrl) {
        runOnUiThread(() -> {
            if (targetUrl == null || targetUrl.trim().isEmpty()) return;

            pendingUrlToLoad = targetUrl;

            // 1. If Video Ad is already loaded in memory -> Show immediately!
            if (rewardedVideoAd != null && rewardedVideoAd.isReady()) {
                Log.d("StartApp", "Displaying preloaded Rewarded Video Ad before navigation...");
                showRewardedVideoInternal();
                return;
            }

            // 2. Video Ad is not loaded yet -> Show quick loading prompt and attempt instant load
            Toast.makeText(this, "Loading video...", Toast.LENGTH_SHORT).show();

            final StartAppAd instantVideoAd = new StartAppAd(MainActivity.this);
            instantVideoAd.setVideoListener(new VideoListener() {
                @Override
                public void onVideoCompleted() {
                    Log.d("StartApp", "Instant Rewarded Video Completed.");
                    executePendingNavigation();
                }
            });

            // Set up a safety timeout: if ad doesn't load within 3.5 seconds, navigate immediately so user is never blocked
            final Handler fallbackHandler = new Handler(Looper.getMainLooper());
            final Runnable fallbackRunnable = () -> {
                Log.d("StartApp", "Ad loading timeout reached (3.5s). Navigating user directly.");
                executePendingNavigation();
            };
            fallbackHandler.postDelayed(fallbackRunnable, 3500);

            instantVideoAd.loadAd(StartAppAd.AdMode.REWARDED_VIDEO, new AdEventListener() {
                @Override
                public void onReceiveAd(@NonNull Ad ad) {
                    fallbackHandler.removeCallbacks(fallbackRunnable);
                    Log.d("StartApp", "Instant Video Ad ready! Showing now...");
                    instantVideoAd.showAd(new AdDisplayListener() {
                        @Override
                        public void adHidden(@NonNull Ad ad) {
                            Log.d("StartApp", "Instant Video Ad closed.");
                            executePendingNavigation();
                            preloadRewardedVideoAd();
                        }

                        @Override
                        public void adDisplayed(@NonNull Ad ad) {
                            Log.d("StartApp", "Instant Video Ad displayed.");
                        }

                        @Override
                        public void adClicked(@NonNull Ad ad) {
                            Log.d("StartApp", "Instant Video Ad clicked.");
                        }

                        @Override
                        public void adNotDisplayed(@NonNull Ad ad) {
                            Log.w("StartApp", "Instant Video Ad failed to display.");
                            executePendingNavigation();
                        }
                    });
                }

                @Override
                public void onFailedToReceiveAd(Ad ad) {
                    fallbackHandler.removeCallbacks(fallbackRunnable);
                    Log.w("StartApp", "Instant Video Ad failed to load. Checking interstitial fallback...");
                    // Try interstitial fallback
                    if (interstitialAd != null && interstitialAd.isReady()) {
                        interstitialAd.showAd(new AdDisplayListener() {
                            @Override
                            public void adHidden(@NonNull Ad ad) {
                                executePendingNavigation();
                                preloadInterstitialAd();
                            }

                            @Override
                            public void adDisplayed(@NonNull Ad ad) {}

                            @Override
                            public void adClicked(@NonNull Ad ad) {}

                            @Override
                            public void adNotDisplayed(@NonNull Ad ad) {
                                executePendingNavigation();
                            }
                        });
                    } else {
                        // Navigate directly
                        executePendingNavigation();
                    }
                }
            });
        });
    }

    private void showRewardedVideoInternal() {
        if (rewardedVideoAd != null) {
            rewardedVideoAd.showAd(new AdDisplayListener() {
                @Override
                public void adHidden(@NonNull Ad ad) {
                    Log.d("StartApp", "Rewarded Video Ad closed by user.");
                    executePendingNavigation();
                    preloadRewardedVideoAd();
                }

                @Override
                public void adDisplayed(@NonNull Ad ad) {
                    Log.d("StartApp", "Rewarded Video Ad displayed successfully.");
                }

                @Override
                public void adClicked(@NonNull Ad ad) {
                    Log.d("StartApp", "Rewarded Video Ad clicked.");
                }

                @Override
                public void adNotDisplayed(@NonNull Ad ad) {
                    Log.w("StartApp", "Rewarded Video Ad could not be displayed.");
                    executePendingNavigation();
                    preloadRewardedVideoAd();
                }
            });
        } else {
            executePendingNavigation();
        }
    }

    /**
     * Executes the pending navigation after ad is watched or skipped.
     */
    private void executePendingNavigation() {
        runOnUiThread(() -> {
            if (pendingUrlToLoad != null && !pendingUrlToLoad.isEmpty()) {
                String destination = pendingUrlToLoad;
                pendingUrlToLoad = null;
                isNavigatingPostAd = true;
                if (webView != null) {
                    webView.loadUrl(destination);
                }
            }
        });
    }

    /**
     * Preloads the next Rewarded Video Ad into memory.
     */
    private void preloadRewardedVideoAd() {
        rewardedVideoAd = new StartAppAd(this);
        rewardedVideoAd.setVideoListener(new VideoListener() {
            @Override
            public void onVideoCompleted() {
                Log.d("StartApp", "Preloaded Rewarded Video playback completed.");
                executePendingNavigation();
            }
        });

        rewardedVideoAd.loadAd(StartAppAd.AdMode.REWARDED_VIDEO, new AdEventListener() {
            @Override
            public void onReceiveAd(@NonNull Ad ad) {
                Log.d("StartApp", "Rewarded Video Ad preloaded successfully and ready in memory.");
            }

            @Override
            public void onFailedToReceiveAd(Ad ad) {
                String errorMsg = (ad != null && ad.getErrorMessage() != null) ? ad.getErrorMessage() : "Unknown";
                Log.w("StartApp", "Rewarded Video Ad preload failed: " + errorMsg + ". Retrying in 20s...");
                adHandler.postDelayed(() -> preloadRewardedVideoAd(), 20000);
            }
        });
    }

    /**
     * Preloads standard Interstitial Ad into memory with auto-retry.
     */
    private void preloadInterstitialAd() {
        if (isInterstitialLoading) return;
        isInterstitialLoading = true;

        interstitialAd = new StartAppAd(this);
        interstitialAd.loadAd(StartAppAd.AdMode.AUTOMATIC, new AdEventListener() {
            @Override
            public void onReceiveAd(@NonNull Ad ad) {
                isInterstitialLoading = false;
                Log.d("StartApp", "Interstitial Ad preloaded successfully and ready in memory.");
            }

            @Override
            public void onFailedToReceiveAd(Ad ad) {
                isInterstitialLoading = false;
                String errorMsg = (ad != null && ad.getErrorMessage() != null) ? ad.getErrorMessage() : "Unknown";
                Log.w("StartApp", "Interstitial Ad preload failed: " + errorMsg + ". Retrying in 25s...");
                // Keep retrying in background so an ad is guaranteed to be cached before 10-minute trigger
                adHandler.postDelayed(() -> preloadInterstitialAd(), 25000);
            }
        });
    }

    /**
     * Periodically checks whether 10 minutes have elapsed, triggering the interstitial ad if ready.
     * Triggers reliably every 10 minutes even if video is playing in fullscreen.
     */
    private void checkAndShowPeriodicInterstitial() {
        long now = System.currentTimeMillis();
        if (now - lastInterstitialShownTime < INTERSTITIAL_INTERVAL_MS) {
            return;
        }

        if (isOffline) {
            return;
        }

        showNativeInterstitial();
    }

    /**
     * Displays the 10-minute native interstitial ad with guaranteed fallback.
     */
    private void showNativeInterstitial() {
        Log.d("StartApp", "Attempting to show 10-minute Interstitial Ad (active even during fullscreen video)...");

        if (interstitialAd != null && interstitialAd.isReady()) {
            boolean displayed = interstitialAd.showAd(new AdDisplayListener() {
                @Override
                public void adHidden(@NonNull Ad ad) {
                    Log.d("StartApp", "10-minute Interstitial dismissed by user.");
                    lastInterstitialShownTime = System.currentTimeMillis();
                    hideSystemUI();
                    preloadInterstitialAd();
                }

                @Override
                public void adDisplayed(@NonNull Ad ad) {
                    Log.d("StartApp", "10-minute Interstitial displayed successfully.");
                    lastInterstitialShownTime = System.currentTimeMillis();
                }

                @Override
                public void adClicked(@NonNull Ad ad) {
                    Log.d("StartApp", "10-minute Interstitial clicked.");
                }

                @Override
                public void adNotDisplayed(@NonNull Ad ad) {
                    Log.w("StartApp", "10-minute Interstitial adNotDisplayed. Invoking fallback...");
                    fallbackShowInterstitial();
                }
            });

            if (displayed) {
                lastInterstitialShownTime = System.currentTimeMillis();
            } else {
                fallbackShowInterstitial();
            }
        } else {
            Log.d("StartApp", "Preloaded interstitial was not ready. Using instant show/load fallback...");
            fallbackShowInterstitial();
        }
    }

    /**
     * Guaranteed fallback for interstitial ad display.
     */
    private void fallbackShowInterstitial() {
        // 1. Try SDK's default auto-cache singleton
        try {
            boolean showedDirectly = StartAppAd.showAd(this);
            if (showedDirectly) {
                lastInterstitialShownTime = System.currentTimeMillis();
                hideSystemUI();
                preloadInterstitialAd();
                return;
            }
        } catch (Exception e) {
            Log.e("StartApp", "Direct StartAppAd.showAd error: " + e.getMessage());
        }

        // 2. Fetch fresh ad and display immediately upon receive
        final StartAppAd instantAd = new StartAppAd(this);
        instantAd.loadAd(StartAppAd.AdMode.AUTOMATIC, new AdEventListener() {
            @Override
            public void onReceiveAd(@NonNull Ad ad) {
                instantAd.showAd(new AdDisplayListener() {
                    @Override
                    public void adHidden(@NonNull Ad ad) {
                        lastInterstitialShownTime = System.currentTimeMillis();
                        hideSystemUI();
                        preloadInterstitialAd();
                    }

                    @Override
                    public void adDisplayed(@NonNull Ad ad) {
                        lastInterstitialShownTime = System.currentTimeMillis();
                    }

                    @Override
                    public void adClicked(@NonNull Ad ad) {}

                    @Override
                    public void adNotDisplayed(@NonNull Ad ad) {
                        preloadInterstitialAd();
                    }
                });
            }

            @Override
            public void onFailedToReceiveAd(Ad ad) {
                Log.w("StartApp", "Instant fallback interstitial failed to load. Will retry shortly.");
                preloadInterstitialAd();
            }
        });
    }

    /**
     * Configures the Start.io Bottom Banner Ad.
     */
    private void setupStartAppBanner() {
        try {
            startAppBanner = new Banner(this);
            RelativeLayout.LayoutParams bannerParams = new RelativeLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
            );
            bannerParams.addRule(RelativeLayout.ALIGN_PARENT_BOTTOM);
            bannerParams.addRule(RelativeLayout.CENTER_HORIZONTAL);
            startAppBanner.setLayoutParams(bannerParams);

            rootLayout.addView(startAppBanner);
            startAppBanner.bringToFront();
            Log.d("StartApp", "StartApp Banner added to layout.");
        } catch (Exception e) {
            Log.e("StartApp", "Error attaching StartApp banner: " + e.getMessage());
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        webView = new WebView(this);
        RelativeLayout.LayoutParams webParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        webView.setLayoutParams(webParams);
        rootLayout.addView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(FORCED_USER_AGENT);
        settings.setGeolocationEnabled(true);

        // JavaScript Bridge for Ad Interception & Video Fullscreen Callbacks
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void showRewardedVideoForUrl(final String url) {
                handlePostClick(url);
            }

            @JavascriptInterface
            public void setBannerVisibility(final boolean visible) {
                if (visible) {
                    showBannerAd();
                } else {
                    hideBannerAd();
                }
            }

            @JavascriptInterface
            public void setVideoFullscreen(final boolean isFs) {
                runOnUiThread(() -> {
                    if (isFs) {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                        hideBannerAd();
                        hideSystemUI();
                        if (getWindow() != null && getWindow().getDecorView() != null) {
                            getWindow().getDecorView().postDelayed(MainActivity.this::hideSystemUI, 150);
                            getWindow().getDecorView().postDelayed(MainActivity.this::hideSystemUI, 500);
                        }
                    } else {
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                        hideSystemUI();
                        showBannerAd();
                    }
                });
            }
        }, "AndroidStartApp");

        // WebChromeClient: Fullscreen Video, Progress Bar, Permissions, Geolocation
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (progressBar != null) {
                    if (newProgress < 100) {
                        progressBar.setVisibility(View.VISIBLE);
                        progressBar.setProgress(newProgress);
                    } else {
                        progressBar.setVisibility(View.GONE);
                    }
                }
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        request.grant(request.getResources());
                    }
                });
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customVideoView != null) {
                    callback.onCustomViewHidden();
                    return;
                }

                customVideoView = view;
                customViewCallback = callback;
                isVideoFullscreen = true;

                // 1. Force Landscape orientation so video rotates to landscape fullscreen
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);

                hideBannerAd();

                fullscreenContainer.addView(customVideoView, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                ));
                fullscreenContainer.setVisibility(View.VISIBLE);
                fullscreenContainer.bringToFront();

                // 2. Hide system UI (top status bar and bottom navigation bar) immediately and with delayed retries
                hideSystemUI();
                if (getWindow() != null && getWindow().getDecorView() != null) {
                    getWindow().getDecorView().postDelayed(MainActivity.this::hideSystemUI, 100);
                    getWindow().getDecorView().postDelayed(MainActivity.this::hideSystemUI, 300);
                    getWindow().getDecorView().postDelayed(MainActivity.this::hideSystemUI, 700);
                }
            }

            @Override
            public void onHideCustomView() {
                if (customVideoView == null) return;

                try {
                    fullscreenContainer.removeView(customVideoView);
                } catch (Exception ignored) {}
                customVideoView = null;
                fullscreenContainer.setVisibility(View.GONE);
                isVideoFullscreen = false;

                if (customViewCallback != null) {
                    try {
                        customViewCallback.onCustomViewHidden();
                    } catch (Exception ignored) {}
                    customViewCallback = null;
                }

                // Return to portrait orientation when exiting video fullscreen
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

                // Keep Immersive Fullscreen and hide system top status bar & bottom navigation bar
                hideSystemUI();
                if (getWindow() != null && getWindow().getDecorView() != null) {
                    getWindow().getDecorView().postDelayed(MainActivity.this::hideSystemUI, 100);
                    getWindow().getDecorView().postDelayed(MainActivity.this::hideSystemUI, 300);
                    getWindow().getDecorView().postDelayed(MainActivity.this::hideSystemUI, 700);
                }

                showBannerAd();

                // If 10-minute interstitial was postponed during fullscreen video, show it now
                checkAndShowPeriodicInterstitial();
            }
        });

        // WebViewClient: Link Interception, Video Ads & Custom Tabs
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return handleUrlNavigation(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                return handleUrlNavigation(uri);
            }

            private boolean handleUrlNavigation(Uri uri) {
                if (uri == null) return false;
                String urlStr = uri.toString();
                String host = uri.getHost();

                // 1. External protocols (WhatsApp, Telegram, Tel, Mailto, Market)
                String scheme = uri.getScheme();
                if (scheme != null && !scheme.startsWith("http") && !scheme.startsWith("https")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                    } catch (Exception e) {
                        Log.e("WebView", "Unable to open external scheme: " + urlStr);
                    }
                    return true;
                }

                // 2. If navigation is triggered after completing ad -> Load directly
                if (isNavigatingPostAd) {
                    isNavigatingPostAd = false;
                    return false;
                }

                // 3. Blogspot Post Navigation -> Intercept & Trigger Rewarded Video Ad!
                if (host != null && (host.contains("hdskay.blogspot.com") || host.contains("blogspot.com"))) {
                    String path = uri.getPath();
                    if (path != null && path.matches(".*/\\d{4}/\\d{2}/.*\\.html.*")) {
                        Log.d("StartApp", "Intercepted Post URL click: " + urlStr + " -> Triggering Rewarded Video Ad.");
                        handlePostClick(urlStr);
                        return true;
                    }
                    return false;
                }

                // 4. External websites -> Open in Chrome Custom Tabs
                openInCustomTabs(urlStr);
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showNoInternetPopup();
                }
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (progressBar != null) {
                    progressBar.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (progressBar != null) {
                    progressBar.setVisibility(View.GONE);
                }

                // 1. Make internal links execute through Android Bridge
                String postClickJs = "(function() {" +
                        "if (window.__hdskay_ad_interceptor_set) return;" +
                        "window.__hdskay_ad_interceptor_set = true;" +
                        "document.addEventListener('click', function(e) {" +
                        "  var target = e.target;" +
                        "  while (target && target.tagName !== 'A') {" +
                        "    target = target.parentElement;" +
                        "  }" +
                        "  if (target && target.href) {" +
                        "    var href = target.getAttribute('href');" +
                        "    var abs = target.href;" +
                        "    if (abs && abs.match(/\\/\\d{4}\\/\\d{2}\\/.*\\.html/) && window.AndroidStartApp) {" +
                        "      e.preventDefault();" +
                        "      e.stopPropagation();" +
                        "      window.AndroidStartApp.showRewardedVideoForUrl(abs);" +
                        "    }" +
                        "  }" +
                        "}, true);" +
                        "})();";
                view.evaluateJavascript(postClickJs, null);

                // 2. Inject Video Fullscreen detector to hide banner whenever any HTML5 video goes fullscreen
                String videoFsJs = "(function() {" +
                        "if (window.__hdskay_video_fs_set) return;" +
                        "window.__hdskay_video_fs_set = true;" +
                        "function updateBanner() {" +
                        "  var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);" +
                        "  if (window.AndroidStartApp && typeof window.AndroidStartApp.setBannerVisibility === 'function') {" +
                        "    window.AndroidStartApp.setBannerVisibility(!isFs);" +
                        "  }" +
                        "}" +
                        "document.addEventListener('fullscreenchange', updateBanner);" +
                        "document.addEventListener('webkitfullscreenchange', updateBanner);" +
                        "document.addEventListener('mozfullscreenchange', updateBanner);" +
                        "document.addEventListener('webkitbeginfullscreen', function(){ if (window.AndroidStartApp) window.AndroidStartApp.setBannerVisibility(false); }, true);" +
                        "document.addEventListener('webkitendfullscreen', function(){ if (window.AndroidStartApp) window.AndroidStartApp.setBannerVisibility(true); }, true);" +
                        "})();";
                view.evaluateJavascript(videoFsJs, null);

                if (isNetworkAvailable()) {
                    hideNoInternetPopup();
                }
            }
        });
    }

    private void setupProgressBar() {
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgress(0);
        progressBar.setVisibility(View.GONE);

        RelativeLayout.LayoutParams progressParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                10
        );
        progressParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        progressBar.setLayoutParams(progressParams);
        rootLayout.addView(progressBar);
    }

    /**
     * Builds clean English offline recovery dialog
     */
    private void buildNoInternetPopup() {
        noInternetLayout = new RelativeLayout(this);
        noInternetLayout.setBackgroundColor(0xD90F172A);
        noInternetLayout.setVisibility(View.GONE);
        noInternetLayout.setClickable(true);
        noInternetLayout.setFocusable(true);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(64, 56, 64, 56);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(0xFF1E293B);
        cardBg.setCornerRadius(32f);
        cardBg.setStroke(2, 0xFF334155);
        card.setBackground(cardBg);

        TextView iconView = new TextView(this);
        iconView.setText("📡");
        iconView.setTextSize(48);
        iconView.setGravity(Gravity.CENTER);
        card.addView(iconView);

        TextView titleView = new TextView(this);
        titleView.setText("No Internet Connection");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(19);
        titleView.setTypeface(null, Typeface.BOLD);
        titleView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.setMargins(0, 24, 0, 12);
        card.addView(titleView, titleParams);

        TextView descView = new TextView(this);
        descView.setText("Please check your Wi-Fi or mobile data network and try again.");
        descView.setTextColor(0xFF94A3B8);
        descView.setTextSize(14);
        descView.setGravity(Gravity.CENTER);
        descView.setMaxWidth(680);
        card.addView(descView);

        Button retryBtn = new Button(this);
        retryBtn.setText("Retry Connection");
        retryBtn.setTextColor(Color.WHITE);
        retryBtn.setTextSize(15);
        retryBtn.setTypeface(null, Typeface.BOLD);

        GradientDrawable btnBg = new GradientDrawable();
        btnBg.setColor(0xFF0284C7);
        btnBg.setCornerRadius(24f);
        retryBtn.setBackground(btnBg);
        retryBtn.setPadding(48, 20, 48, 20);

        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        btnParams.setMargins(0, 36, 0, 0);
        card.addView(retryBtn, btnParams);

        retryBtn.setOnClickListener(v -> {
            if (isNetworkAvailable()) {
                hideNoInternetPopup();
            } else {
                Toast.makeText(this, "Still no internet connection. Please check your network.", Toast.LENGTH_SHORT).show();
            }
        });

        RelativeLayout.LayoutParams cardParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        cardParams.addRule(RelativeLayout.CENTER_IN_PARENT);
        noInternetLayout.addView(card, cardParams);

        RelativeLayout.LayoutParams layoutParams = new RelativeLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        rootLayout.addView(noInternetLayout, layoutParams);
    }

    public void showNoInternetPopup() {
        runOnUiThread(() -> {
            isOffline = true;
            if (noInternetLayout != null) {
                noInternetLayout.setVisibility(View.VISIBLE);
                noInternetLayout.bringToFront();
            }
        });
    }

    public void hideNoInternetPopup() {
        runOnUiThread(() -> {
            isOffline = false;
            if (noInternetLayout != null) {
                noInternetLayout.setVisibility(View.GONE);
            }
        });
    }

    private void setupNetworkMonitoring() {
        try {
            connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                networkCallback = new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(@NonNull Network network) {
                        runOnUiThread(() -> {
                            if (isOffline) {
                                hideNoInternetPopup();
                            }
                        });
                    }

                    @Override
                    public void onLost(@NonNull Network network) {
                        runOnUiThread(() -> {
                            showNoInternetPopup();
                        });
                    }
                };
                connectivityManager.registerDefaultNetworkCallback(networkCallback);
            }
        } catch (Exception ignored) {}
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network network = cm.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities capabilities = cm.getNetworkCapabilities(network);
                return capabilities != null && (
                        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                );
            } else {
                android.net.NetworkInfo activeNetworkInfo = cm.getActiveNetworkInfo();
                return activeNetworkInfo != null && activeNetworkInfo.isConnected();
            }
        } catch (Exception e) {
            return false;
        }
    }

    private void openInCustomTabs(String url) {
        try {
            CustomTabColorSchemeParams colorScheme = new CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(0xFF0F172A)
                    .build();

            CustomTabsIntent customTabsIntent = new CustomTabsIntent.Builder()
                    .setDefaultColorSchemeParams(colorScheme)
                    .setShowTitle(true)
                    .build();

            customTabsIntent.launchUrl(this, Uri.parse(url));
        } catch (Exception e) {
            try {
                Intent fallbackIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(fallbackIntent);
            } catch (Exception ex) {
                Toast.makeText(this, "Could not open link: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (customVideoView != null) {
            if (webView != null && webView.getWebChromeClient() != null) {
                webView.getWebChromeClient().onHideCustomView();
            }
            return;
        }

        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    /**
     * Immersive Sticky Fullscreen: Hides system navigation bar and status bar completely.
     * Re-applies whenever the window regains focus, orientation changes, or video closes.
     */
    private void hideSystemUI() {
        runOnUiThread(() -> {
            try {
                Window win = getWindow();
                if (win == null) return;

                win.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                win.clearFlags(WindowManager.LayoutParams.FLAG_FORCE_NOT_FULLSCREEN);

                WindowInsetsControllerCompat insetsController =
                        WindowCompat.getInsetsController(win, win.getDecorView());
                if (insetsController != null) {
                    insetsController.hide(WindowInsetsCompat.Type.systemBars());
                    insetsController.setSystemBarsBehavior(
                            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    );
                }

                View decorView = win.getDecorView();
                if (decorView != null) {
                    decorView.setSystemUiVisibility(
                            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                    );
                }
            } catch (Exception e) {
                Log.e("Fullscreen", "Error hiding system UI: " + e.getMessage());
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUI();
        }
    }

    @Override
    public void onConfigurationChanged(@NonNull Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        hideSystemUI();
        if (getWindow() != null && getWindow().getDecorView() != null) {
            getWindow().getDecorView().postDelayed(this::hideSystemUI, 250);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUI();
        if (webView != null) {
            webView.onResume();
        }
        showBannerAd();
        checkAndShowPeriodicInterstitial();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onDestroy() {
        adHandler.removeCallbacksAndMessages(null);
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {}
        }
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
