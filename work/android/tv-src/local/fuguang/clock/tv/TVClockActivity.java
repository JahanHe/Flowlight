package local.fuguang.clock.tv;

import android.app.Activity;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.ScrollView;
import org.json.JSONObject;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public final class TVClockActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String PAGE = "https://" + HOST + "/assets/glass-clock-tv.html";
    private String pageUrl = PAGE, appVersion = "版本未读取";
    private WebView web;
    private FrameLayout root;
    private boolean ready;
    private long lastDirectionAt;
    private static final int MAX_STARTUP_PROBES = 10;
    private static final long STARTUP_TIMEOUT_MS = 18000;
    private static final String STARTUP_PROBE = "(function(){var d=window.clockTVDiagnostics||{};return {ready:typeof window.clockTVRemote === 'function' && window.clockAppReady === true && window.clockTVReady === true,documentState:document.readyState,bootstrap:window.clockTV===true,compatChecked:typeof window.clockTVIncompatible==='boolean',compatRejected:window.clockTVIncompatible===true,appReady:window.clockAppReady===true,tvReady:window.clockTVReady===true,remote:typeof window.clockTVRemote,stage:String(d.stage||''),reason:String(d.reason||window.clockTVCompatReason||''),firstError:String(d.firstError||window.clockTVFirstError||''),ua:navigator.userAgent};})()";
    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private final Runnable startupTimeout = () -> showStartupFailure();
    private final Runnable startupProbeTask = () -> probeStartup();
    private int startupProbes;
    private boolean pageFinished, probePending, foreground;
    private String userAgent = "", webViewPackage = "未提供版本", firstScriptError = "", firstConsoleError = "";
    private volatile String mainResourceError = "";
    private JSONObject startupSnapshot = new JSONObject();
    private ScrollView failureDetails;
    private Button failureDetailsButton;
    private static final long BACK_TIMEOUT_MS = 1500;
    private final Handler backHandler = new Handler(Looper.getMainLooper());
    private boolean backPending;
    private final Runnable backTimeout = () -> { backPending = false; if (foreground && !isFinishing()) finish(); };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        try {
            PackageInfo app = getPackageManager().getPackageInfo(getPackageName(), 0);
            appVersion = app.versionName + "（" + app.versionCode + "）";
            pageUrl = PAGE + "?v=" + app.versionCode;
        } catch (android.content.pm.PackageManager.NameNotFoundException ignored) { }
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> sendRemote("Escape", true));
        }
        immerse();
        try { startClock(); }
        catch (RuntimeException | LinkageError error) {
            firstScriptError = error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage());
            showFailure("网页组件未能打开", "未能创建系统网页组件。可以先重试；具体错误已记录在详情中。无需安装 Java。");
        }
    }

    private void startClock() {
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = web.getSettings();
        userAgent = String.valueOf(settings.getUserAgentString());
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                PackageInfo provider = WebView.getCurrentWebViewPackage();
                if (provider != null) webViewPackage = provider.packageName + " / " + provider.versionName;
            } catch (RuntimeException error) { webViewPackage = "版本读取失败：" + error.getClass().getSimpleName(); }
        }
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isLocal(uri)) {
                    if ("GET".equals(request.getMethod()) && "/assets/glass-clock-tv.html".equals(uri.getPath())) {
                        try {
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Cache-Control", "no-store, max-age=0");
                            headers.put("Content-Security-Policy", "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src https://api.open-meteo.com https://geocoding-api.open-meteo.com https://weather.cma.cn; object-src 'none'; base-uri 'none'; frame-src 'none'");
                            return new WebResourceResponse("text/html", "UTF-8", 200, "OK", headers, getAssets().open("glass-clock-tv.html"));
                        } catch (IOException error) {
                            mainResourceError = "内置 HTML 读取失败：" + error.getClass().getSimpleName();
                            return blocked();
                        }
                    }
                    return blocked();
                }
                // ponytail: one inline HTML asset and three weather hosts need no asset-loading library or exposed filesystem.
                if ("https".equals(uri.getScheme()) && ("api.open-meteo.com".equals(uri.getHost()) || "geocoding-api.open-meteo.com".equals(uri.getHost()) || "weather.cma.cn".equals(uri.getHost()))) return null;
                return blocked();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !pageUrl.equals(request.getUrl().toString()); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return !pageUrl.equals(url); }
            @Override public void onPageFinished(WebView view, String url) {
                if (!pageUrl.equals(url) || view != web || ready) return;
                pageFinished = true;
                startupHandler.removeCallbacks(startupProbeTask);
                probeStartup();
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) mainResourceError = "主页面错误 " + error.getErrorCode() + "：" + error.getDescription();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) mainResourceError = "主页面响应 HTTP " + response.getStatusCode();
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != web) return true;
                firstScriptError = "WebView 渲染进程已停止；didCrash=" + detail.didCrash();
                showFailure("网页渲染进程停止", "时钟的显示设置已保留，可以重新打开。停止原因尚不能确定，请查看详情。");
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    String text = String.valueOf(message.message()), source = String.valueOf(message.sourceId());
                    String error = text + "（行 " + message.lineNumber() + "，" + source + "）";
                    if (firstConsoleError.isEmpty()) firstConsoleError = shorten(error, 1200);
                    if (firstScriptError.isEmpty() && (source.startsWith(PAGE) || text.contains("Uncaught"))) firstScriptError = shorten(error, 1200);
                }
                return false;
            }
        });
        startupHandler.postDelayed(startupTimeout, STARTUP_TIMEOUT_MS);
        web.loadUrl(pageUrl);
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && (uri.getPort() == -1 || uri.getPort() == 443);
    }
    private static WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream("Not found".getBytes(StandardCharsets.UTF_8)));
    }
    private void probeStartup() {
        final WebView view = web;
        if (view == null || ready || probePending || !foreground) return;
        probePending = true;
        startupProbes++;
        view.evaluateJavascript(STARTUP_PROBE, result -> {
            probePending = false;
            if (view != web || ready) return;
            try { startupSnapshot = new JSONObject(result); }
            catch (Exception error) { if (firstScriptError.isEmpty()) firstScriptError = "启动状态没有返回有效数据：" + shorten(String.valueOf(result), 160); }
            if (startupSnapshot.optBoolean("ready")) {
                ready = true; startupHandler.removeCallbacksAndMessages(null); view.requestFocus();
            } else if (foreground && startupProbes < MAX_STARTUP_PROBES) startupHandler.postDelayed(startupProbeTask, 1000);
            else if (foreground) showStartupFailure();
        });
    }
    private void showStartupFailure() {
        if (web == null || ready || !foreground || isFinishing()) return;
        String reported = startupSnapshot.optString("firstError");
        if (!reported.isEmpty()) firstScriptError = shorten(reported, 1200);
        String title, message;
        if (!mainResourceError.isEmpty()) {
            title = "内置页面读取失败"; message = mainResourceError;
        } else if (startupSnapshot.optBoolean("compatRejected")) {
            title = "兼容性检查未通过";
            message = startupSnapshot.optString("reason");
            if (message.isEmpty()) message = "网页的功能检查未通过。请查看详情确认缺失的功能。";
        } else if (!firstScriptError.isEmpty()) {
            title = "启动脚本执行中断"; message = shorten(firstScriptError, 180);
        } else if (!pageFinished) {
            title = "页面加载尚未完成"; message = "等待 18 秒后仍未收到完成通知。可以先重试，具体状态保留在详情中。";
        } else if (!startupSnapshot.optBoolean("bootstrap")) {
            title = "启动脚本未执行"; message = "页面已经载入，但没有检测到时钟的启动标记。";
        } else if (!startupSnapshot.optBoolean("appReady")) {
            title = "时钟初始化未完成"; message = "启动脚本已运行，但主时钟尚未就绪。请查看详情中的失败环节。";
        } else {
            title = "遥控界面初始化未完成"; message = "主时钟已就绪，遥控界面尚未就绪。请查看详情中的失败环节。";
        }
        showFailure(title, message);
    }
    private static String shorten(String value, int limit) { return value.length() > limit ? value.substring(0, limit) + "…" : value; }
    private String detectedVersion() {
        Matcher version = Pattern.compile("(?:Chrome|Chromium)/(\\d+(?:\\.\\d+)*)").matcher(userAgent);
        return "Android " + Build.VERSION.RELEASE + "（API " + Build.VERSION.SDK_INT + "） · " + (version.find() ? "Chromium " + version.group(1) : "网页内核版本未识别");
    }
    private String diagnostics() {
        return "应用：浮光·TV " + appVersion + "\n页面：" + pageUrl + "\n" + detectedVersion() + "\nWebView 包：" + webViewPackage
            + "\n加载完成：" + pageFinished + "；检查次数：" + startupProbes
            + "\n页面状态：" + startupSnapshot.optString("documentState", "无返回")
            + "\n启动脚本：" + startupSnapshot.optBoolean("bootstrap") + "；兼容检查已运行：" + startupSnapshot.optBoolean("compatChecked")
            + "\n兼容检查拒绝：" + startupSnapshot.optBoolean("compatRejected")
            + "\n主时钟：" + startupSnapshot.optBoolean("appReady") + "；遥控界面：" + startupSnapshot.optBoolean("tvReady") + "；按键接口：" + startupSnapshot.optString("remote", "无返回")
            + "\n失败环节：" + startupSnapshot.optString("stage", "未记录") + "\n功能检查：" + startupSnapshot.optString("reason", "未记录")
            + "\n主资源错误：" + (mainResourceError.isEmpty() ? "未记录" : mainResourceError)
            + "\n首条脚本错误：" + (firstScriptError.isEmpty() ? "未记录" : firstScriptError)
            + "\n首条控制台错误：" + (firstConsoleError.isEmpty() ? "未记录" : firstConsoleError)
            + "\nUser-Agent：" + userAgent;
    }
    private void showFailure(String heading, String message) {
        ready = false;
        cancelBack();
        startupHandler.removeCallbacksAndMessages(null);
        if (web != null) { root.removeView(web); web.destroy(); web = null; }
        root.removeAllViews();
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        panel.setPadding(padding, padding, padding, padding);
        TextView title = new TextView(this);
        title.setText(heading); title.setTextSize(25); title.setTextColor(Color.WHITE); title.setGravity(Gravity.CENTER);
        panel.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView detail = new TextView(this);
        detail.setText(detectedVersion() + "\n\n" + message); detail.setTextSize(17); detail.setTextColor(0xFFCCD8E3);
        detail.setGravity(Gravity.CENTER); detail.setPadding(0, padding / 2, 0, padding / 2);
        panel.addView(detail, new LinearLayout.LayoutParams(-1, -2));
        failureDetails = new ScrollView(this); failureDetails.setFocusable(true); failureDetails.setVisibility(View.GONE);
        TextView diagnosticText = new TextView(this);
        diagnosticText.setText(diagnostics()); diagnosticText.setTextSize(14); diagnosticText.setTextColor(0xFFE1EBF5);
        diagnosticText.setPadding(padding / 2, padding / 2, padding / 2, padding / 2);
        failureDetails.addView(diagnosticText, new ScrollView.LayoutParams(-1, -2));
        panel.addView(failureDetails, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout buttons = new LinearLayout(this); buttons.setGravity(Gravity.CENTER);
        Button retry = new Button(this); retry.setText("重新打开"); retry.setOnClickListener(view -> recreate());
        failureDetailsButton = new Button(this); failureDetailsButton.setText("查看详情");
        failureDetailsButton.setOnClickListener(view -> {
            boolean show = failureDetails.getVisibility() != View.VISIBLE;
            failureDetails.setVisibility(show ? View.VISIBLE : View.GONE);
            failureDetailsButton.setText(show ? "隐藏详情" : "查看详情");
            if (show) failureDetails.requestFocus();
        });
        Button close = new Button(this); close.setText("退出"); close.setOnClickListener(view -> finish());
        buttons.addView(retry); buttons.addView(failureDetailsButton); buttons.addView(close); panel.addView(buttons);
        root.addView(panel, new FrameLayout.LayoutParams(-1, -1)); retry.requestFocus();
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK || event.getKeyCode() == KeyEvent.KEYCODE_ESCAPE) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) sendRemote("Escape", true);
            return true;
        }
        if (!ready || web == null) return super.dispatchKeyEvent(event);
        String key;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: key = "ArrowUp"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: key = "ArrowDown"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: key = "ArrowLeft"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: key = "ArrowRight"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_NUMPAD_ENTER: key = "Enter"; break;
            case KeyEvent.KEYCODE_MENU: key = "Menu"; break;
            default: return super.dispatchKeyEvent(event);
        }
        if (key.startsWith("Arrow")) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && (event.getRepeatCount() == 0 || SystemClock.uptimeMillis() - lastDirectionAt >= 90)) {
                lastDirectionAt = SystemClock.uptimeMillis(); sendRemote(key, false);
            }
        } else if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) sendRemote(key, false);
        return true;
    }
    private void sendRemote(String key, boolean finishIfUnhandled) {
        if (finishIfUnhandled && backPending) { cancelBack(); finish(); return; }
        if (!ready || web == null) {
            if (finishIfUnhandled) {
                if (failureDetails != null && failureDetails.getVisibility() == View.VISIBLE) {
                    failureDetails.setVisibility(View.GONE); failureDetailsButton.setText("查看详情"); failureDetailsButton.requestFocus();
                } else finish();
            }
            return;
        }
        // Only fixed physical key names above enter JavaScript. No JavaScript-to-native bridge exists.
        // ponytail: a bounded native fallback keeps Back usable when the web thread cannot reply.
        final WebView view = web;
        if (finishIfUnhandled) { backPending = true; backHandler.postDelayed(backTimeout, BACK_TIMEOUT_MS); }
        try {
            view.evaluateJavascript("typeof window.clockTVRemote === 'function' && window.clockTVRemote('" + key + "') === true", handled -> {
                if (view != web || isFinishing() || !finishIfUnhandled || !backPending) return;
                cancelBack();
                if (!"true".equals(handled)) finish();
            });
        } catch (RuntimeException error) {
            if (finishIfUnhandled) { cancelBack(); finish(); }
            else if (firstScriptError.isEmpty()) firstScriptError = "遥控接口：" + error.getClass().getSimpleName();
        }
    }
    private void cancelBack() { backPending = false; backHandler.removeCallbacks(backTimeout); }
    @Override public void onBackPressed() { sendRemote("Escape", true); }
    private void immerse() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) { controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); controller.hide(WindowInsets.Type.systemBars()); }
        } else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);
    }
    @Override public void onWindowFocusChanged(boolean focused) { super.onWindowFocusChanged(focused); if (focused) immerse(); }
    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (web != null) {
            web.onResume(); web.resumeTimers();
            if (!ready) {
                startupHandler.removeCallbacksAndMessages(null);
                startupHandler.postDelayed(startupTimeout, STARTUP_TIMEOUT_MS);
                if (pageFinished) startupHandler.post(startupProbeTask);
            }
        }
        immerse();
    }
    @Override protected void onPause() { foreground = false; cancelBack(); startupHandler.removeCallbacksAndMessages(null); if (web != null) { web.onPause(); web.pauseTimers(); } super.onPause(); }
    @Override protected void onDestroy() { cancelBack(); startupHandler.removeCallbacksAndMessages(null); if (web != null) { root.removeView(web); web.destroy(); web = null; } super.onDestroy(); }
}
