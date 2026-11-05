package local.fuguang.clock;

import android.Manifest;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public final class ClockActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String PAGE = "https://" + HOST + "/assets/glass-clock.html";
    private String pageUrl = PAGE;
    private static final int LOCATION_REQUEST = 41;
    private WebView web;
    private FrameLayout root;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;
    private static final long BACK_TIMEOUT_MS = 1500;
    private static final String BACK_SCRIPT = "(function(){if(document.fullscreenElement||document.webkitFullscreenElement||(document.body&&document.body.classList.contains('is-fullscreen'))){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return true;}var ids=['appearance-close','gallery-close'];for(var i=0;i<ids.length;i++){var b=document.getElementById(ids[i]);if(b&&b.getClientRects().length){b.click();return true;}}var form=document.getElementById('city-form'),toggle=document.getElementById('city-toggle');if(form&&!form.hidden&&form.getClientRects().length&&toggle){toggle.click();return true;}return false;})()";
    private final Handler backHandler = new Handler(Looper.getMainLooper());
    private boolean backPending, foreground;
    private final Runnable backTimeout = () -> { backPending = false; if (foreground && !isFinishing()) finish(); };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try {
            PackageInfo app = getPackageManager().getPackageInfo(getPackageName(), 0);
            pageUrl = PAGE + "?v=" + app.versionCode;
        } catch (PackageManager.NameNotFoundException ignored) { }
        try {
            ActivityManager manager = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (manager != null) {
                ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
                manager.getMemoryInfo(memory);
                // Read-only startup hints; available memory and the app heap class are not a WebView allocation budget.
                pageUrl = Uri.parse(pageUrl).buildUpon()
                    .appendQueryParameter("ramMB", Long.toString(Math.max(0, memory.totalMem / 1048576L)))
                    .appendQueryParameter("availableMB", Long.toString(Math.max(0, memory.availMem / 1048576L)))
                    .appendQueryParameter("cores", Integer.toString(Runtime.getRuntime().availableProcessors()))
                    .appendQueryParameter("lowRam", manager.isLowRamDevice() ? "1" : "0")
                    .appendQueryParameter("heapMB", Integer.toString(manager.getMemoryClass())).build().toString();
            }
        } catch (RuntimeException ignored) { }
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 28) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.view.DisplayCutout cutout = insets.getDisplayCutout();
                root.setPadding(cutout == null ? 0 : cutout.getSafeInsetLeft(), cutout == null ? 0 : cutout.getSafeInsetTop(),
                    cutout == null ? 0 : cutout.getSafeInsetRight(), cutout == null ? 0 : cutout.getSafeInsetBottom());
                return insets;
            });
        }
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setTextZoom(100);
        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri)) {
                    if ("GET".equals(request.getMethod()) && "/assets/glass-clock.html".equals(uri.getPath())) {
                        try {
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Cache-Control", "no-store, max-age=0");
                            headers.put("Referrer-Policy", "no-referrer");
                            headers.put("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src https://api.open-meteo.com https://geocoding-api.open-meteo.com https://weather.cma.cn; object-src 'none'; base-uri 'none'; frame-src 'none'");
                            return new WebResourceResponse("text/html", "UTF-8", 200, "OK", headers, getAssets().open("glass-clock.html"));
                        } catch (IOException error) { return blocked(); }
                    }
                    return blocked();
                }
                // ponytail: the app contains one fully inline page, so a fixed asset route needs no library or filesystem exposure.
                if ("https".equals(uri.getScheme()) && ("api.open-meteo.com".equals(uri.getHost()) || "geocoding-api.open-meteo.com".equals(uri.getHost()) || "weather.cma.cn".equals(uri.getHost()))) return null;
                return blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (pageUrl.equals(uri.toString())) return false;
                // Source links leave the clock only after a user tap; renderer requests keep the fixed allowlist above.
                if (request.isForMainFrame() && request.hasGesture() && "https".equals(uri.getScheme()) && uri.getHost() != null && !HOST.equals(uri.getHost())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (android.content.ActivityNotFoundException ignored) { }
                }
                return true;
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != web) return true;
                cancelBack();
                cancelLocation();
                hideCustomView();
                root.removeView(view);
                view.destroy();
                web = null;
                if (!isFinishing()) new AlertDialog.Builder(ClockActivity.this)
                    .setTitle("时钟显示已停止")
                    .setMessage("系统网页组件停止了本次显示。已保存的设置仍然保留，可以重新打开时钟。")
                    .setPositiveButton("重新打开", (dialog, which) -> recreate())
                    .setNegativeButton("退出", (dialog, which) -> finish())
                    .setOnCancelListener(dialog -> finish()).show();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!isLocal(Uri.parse(origin))) { callback.invoke(origin, false, false); return; }
                if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    cancelLocation();
                    locationOrigin = origin;
                    locationCallback = callback;
                    requestPermissions(new String[] { Manifest.permission.ACCESS_COARSE_LOCATION }, LOCATION_REQUEST);
                }
            }
            @Override public void onGeolocationPermissionsHidePrompt() { cancelLocation(); }
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customViewCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                web.setVisibility(View.GONE);
                immerse();
            }
            @Override public void onHideCustomView() { hideCustomView(); }
        });
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        immerse();
        web.loadUrl(pageUrl);
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443);
    }
    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream("Not found".getBytes(StandardCharsets.UTF_8)));
    }
    private void cancelLocation() {
        if (locationCallback != null) locationCallback.invoke(locationOrigin, false, false);
        locationCallback = null;
        locationOrigin = null;
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == LOCATION_REQUEST && locationCallback != null) {
            locationCallback.invoke(locationOrigin, results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED, false);
            locationCallback = null;
            locationOrigin = null;
        }
    }
    private void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        if (web != null) web.setVisibility(View.VISIBLE);
        WebChromeClient.CustomViewCallback callback = customViewCallback;
        customViewCallback = null;
        if (callback != null) callback.onCustomViewHidden();
        immerse();
    }
    private void immerse() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.systemBars());
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
        }
    }
    private void handleBack() {
        if (backPending) { cancelBack(); finish(); return; }
        if (customView != null) { hideCustomView(); return; }
        if (web == null) { finish(); return; }
        // ponytail: keep native Back usable when the web thread is busy or cannot reply.
        final WebView view = web;
        backPending = true;
        backHandler.postDelayed(backTimeout, BACK_TIMEOUT_MS);
        try {
            view.evaluateJavascript(BACK_SCRIPT, handled -> {
                if (view != web || isFinishing() || !backPending) return;
                cancelBack();
                if (!"true".equals(handled)) finish();
            });
        } catch (RuntimeException error) { cancelBack(); finish(); }
    }
    private void cancelBack() { backPending = false; backHandler.removeCallbacks(backTimeout); }
    @Override public void onBackPressed() { handleBack(); }
    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) immerse();
    }
    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (web != null) { web.onResume(); web.resumeTimers(); }
        immerse();
    }
    @Override protected void onPause() {
        foreground = false;
        cancelBack();
        if (web != null) { web.onPause(); web.pauseTimers(); }
        super.onPause();
    }
    @Override protected void onDestroy() {
        cancelBack();
        cancelLocation();
        hideCustomView();
        if (web != null) { root.removeView(web); web.destroy(); web = null; }
        super.onDestroy();
    }
}
