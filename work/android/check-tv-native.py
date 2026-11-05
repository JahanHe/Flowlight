#!/usr/bin/env python3
"""Small native-contract check; build-apk.py --tv also verifies the actual APK."""
from pathlib import Path
from android_tools import ANDROID_JAR, JDK_BIN
import os
import subprocess
import tempfile
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
ns = '{http://schemas.android.com/apk/res/android}'
manifest = ET.parse(root / 'AndroidManifest-tv.xml').getroot()
assert manifest.get('package') == 'local.fuguang.clock.tv'
assert manifest.get(ns + 'versionCode') == '5' and manifest.get(ns + 'versionName') == '1.0.4'
assert manifest.find('uses-sdk').get(ns + 'minSdkVersion') == '23'
permissions = [item.get(ns + 'name') for item in manifest.findall('uses-permission')]
assert permissions == ['android.permission.INTERNET']
features = {item.get(ns + 'name'): item.get(ns + 'required') for item in manifest.findall('uses-feature')}
assert features['android.hardware.touchscreen'] == 'false'
assert features['android.hardware.location'] == 'false'
assert features['android.software.leanback'] == 'false'
application = manifest.find('application')
assert application.get(ns + 'label') == '浮光·TV'
assert application.get(ns + 'banner') == '@drawable/tv_banner'
assert application.get(ns + 'hardwareAccelerated') == 'true'
activity = application.find('activity')
assert activity.get(ns + 'screenOrientation') == 'landscape'
categories = {item.get(ns + 'name') for item in activity.findall('./intent-filter/category')}
assert {'android.intent.category.LAUNCHER', 'android.intent.category.LEANBACK_LAUNCHER'} == categories
source = root / 'tv-src/local/fuguang/clock/tv/TVClockActivity.java'
java = source.read_text()
for key in ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Menu']:
    assert '"' + key + '"' in java
for contract in ['window.clockTVRemote(', 'window.clockTVReady === true', 'setAllowFileAccess(false)',
                 'setAllowContentAccess(false)', 'setGeolocationEnabled(false)', 'web.pauseTimers()',
                 'web.resumeTimers()', 'onRenderProcessGone', 'WebView 包：', 'MAX_STARTUP_PROBES = 10', 'STARTUP_TIMEOUT_MS = 18000', 'onConsoleMessage', 'onReceivedError', '查看详情', 'finishIfUnhandled']:
    assert contract in java
assert 'addJavascriptInterface' not in java
assert '应用：浮光·TV ' in java and '浮光时钟·电视版' not in java
assert 'appVersion = app.versionName' in java and 'pageUrl = PAGE + "?v=" + app.versionCode' in java
assert 'headers.put("Cache-Control", "no-store, max-age=0")' in java
assert 'web.loadUrl(pageUrl)' in java and java.count('!pageUrl.equals(') == 3
assert 'clearCache' not in java and 'deleteAllData' not in java and 'setCacheMode' not in java
assert '需要使用其他电视' not in java and 'Chromium 77 或更高版本' not in java
assert java.index('addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)') < java.index('try { startClock(); }')
assert 'clearFlags' not in java and 'newWakeLock' not in java
assert not manifest.findall('./application/service')
assert java.count('Build.VERSION.SDK_INT >= 33') == 1
assert java.count('Build.VERSION.SDK_INT >= 30') == 1
assert 'getOnBackInvokedDispatcher' in java
assert 'onBackPressed() { sendRemote("Escape", true); }' in java
dispatch = java[java.index('    @Override public boolean dispatchKeyEvent'):java.index('    private void sendRemote')]
assert dispatch.index('KeyEvent.KEYCODE_BACK') < dispatch.index('if (!ready || web == null)')
assert 'BACK_TIMEOUT_MS = 1500' in java
assert 'onPause() { foreground = false; cancelBack();' in java
assert 'onDestroy() { cancelBack();' in java
jdk = JDK_BIN / ('javac.exe' if os.name == 'nt' else 'javac')
with tempfile.TemporaryDirectory(prefix='clock-tv-native-') as output:
    subprocess.run([str(jdk), '-encoding', 'UTF-8', '--release', '8', '-classpath',
        str(ANDROID_JAR), '-d', output, str(source)], check=True)
print('PASS: TV manifest, optional TV/touch/location hardware, fixed remote keys, native back, foreground keep-screen-on independent of touch/fullscreen, no CPU wakelock/service, background pause, WebView failure UI, and Java compilation')

# Exercise the production classification method without pretending desktop Java is Android.
start = java.index('    private void showStartupFailure() {')
end = java.index('    private static String shorten', start)
classification = java[start:end]
harness = '''
import java.util.HashMap;
public class StartupDiagnosticCheck {
  Object web=new Object(); boolean ready=false,foreground=true,pageFinished=true;
  String firstScriptError="",mainResourceError="",heading="",message="";
  Snapshot startupSnapshot=new Snapshot();
  boolean isFinishing(){return false;}
  static String shorten(String value,int limit){return value.length()>limit?value.substring(0,limit):value;}
  void showFailure(String h,String m){heading=h;message=m;}
  static class Snapshot extends HashMap<String,Object>{
    boolean optBoolean(String key){return Boolean.TRUE.equals(get(key));}
    String optString(String key){Object value=get(key);return value==null?"":String.valueOf(value);}
  }
''' + classification + '''
  static void check(StartupDiagnosticCheck c,String expected){
    c.showStartupFailure();if(!c.heading.equals(expected))throw new AssertionError(c.heading+" != "+expected);
  }
  public static void main(String[] args){
    StartupDiagnosticCheck c=new StartupDiagnosticCheck();c.mainResourceError="missing asset";c.startupSnapshot.put("compatRejected",true);check(c,"内置页面读取失败");
    c=new StartupDiagnosticCheck();c.startupSnapshot.put("compatRejected",true);c.startupSnapshot.put("reason","missing Canvas metrics");check(c,"兼容性检查未通过");if(!c.message.contains("Canvas metrics"))throw new AssertionError("missing exact reason");
    c=new StartupDiagnosticCheck();c.firstScriptError="Uncaught SyntaxError";check(c,"启动脚本执行中断");
    c=new StartupDiagnosticCheck();c.firstScriptError="earlier network console error";c.startupSnapshot.put("firstError","early syntax error");check(c,"启动脚本执行中断");if(!c.message.contains("early syntax error"))throw new AssertionError("preflight error must take precedence over console noise");
    c=new StartupDiagnosticCheck();c.pageFinished=false;check(c,"页面加载尚未完成");
    c=new StartupDiagnosticCheck();check(c,"启动脚本未执行");
    c=new StartupDiagnosticCheck();c.startupSnapshot.put("bootstrap",true);check(c,"时钟初始化未完成");
    c=new StartupDiagnosticCheck();c.startupSnapshot.put("bootstrap",true);c.startupSnapshot.put("appReady",true);check(c,"遥控界面初始化未完成");
    c=new StartupDiagnosticCheck();c.ready=true;check(c,"");
    c=new StartupDiagnosticCheck();c.foreground=false;check(c,"");
    System.out.println("PASS: actual native classifier, all failure stages, exact compat reason, script preflight error, ready/background suppression");
  }
}
'''
with tempfile.TemporaryDirectory(prefix='clock-tv-diagnostics-') as output:
    test = Path(output) / 'StartupDiagnosticCheck.java'
    test.write_text(harness)
    subprocess.run([str(jdk), '-encoding', 'UTF-8', '-d', output, str(test)], check=True)
    subprocess.run([str(jdk.with_name('java' + jdk.suffix)), '-cp', output, 'StartupDiagnosticCheck'], check=True)

# Exercise the production remote/back handler with a controllable callback and native timer.
start = java.index('    private void sendRemote(')
remote = java[start:java.index('    @Override public void onBackPressed()', start)]
back_fields = java[java.index('    private static final long BACK_TIMEOUT_MS'):java.index('\n\n    @Override public void onCreate')]
back_harness = '''
import java.util.function.Consumer;
public class RemoteBackCheck {
  boolean ready=true,foreground=true,finished=false; int finishes=0;
  String firstScriptError="";
  WebView web=new WebView(); View failureDetails; Button failureDetailsButton=new Button();
  boolean isFinishing(){return finished;}
  void finish(){finished=true;finishes++;}
  static class View {static final int VISIBLE=0,GONE=8;int visibility=VISIBLE;boolean focused;
    int getVisibility(){return visibility;}void setVisibility(int v){visibility=v;}void requestFocus(){focused=true;}}
  static class Button extends View {void setText(String s){}}
  static class Looper {static Object getMainLooper(){return null;}}
  static class Handler {Runnable pending; long delay;
    Handler(Object looper){}void postDelayed(Runnable r,long ms){pending=r;delay=ms;}
    void removeCallbacks(Runnable r){if(pending==r)pending=null;}
    void fire(){Runnable r=pending;pending=null;if(r!=null)r.run();}}
  static class WebView {Consumer<String> callback;boolean fail;int calls;
    void evaluateJavascript(String js,Consumer<String> callback){if(fail)throw new IllegalStateException();this.callback=callback;calls++;}}
''' + back_fields + remote + '''
  static void require(boolean pass,String message){if(!pass)throw new AssertionError(message);}
  public static void main(String[] args){
    RemoteBackCheck c=new RemoteBackCheck();c.sendRemote("Escape",true);c.web.callback.accept("true");c.backHandler.fire();require(!c.finished&&!c.backPending,"handled Back should close settings without exit");
    c=new RemoteBackCheck();c.sendRemote("Escape",true);c.web.callback.accept("false");require(c.finishes==1,"unhandled Back exits");
    c=new RemoteBackCheck();c.sendRemote("Escape",true);require(c.backHandler.delay==1500,"bounded native timeout");c.backHandler.fire();require(c.finishes==1,"no JS callback must exit");c.web.callback.accept("true");require(c.finishes==1,"late callback must not affect finished activity");
    c=new RemoteBackCheck();c.sendRemote("Escape",true);c.sendRemote("Escape",true);require(c.finishes==1&&c.web.calls==1,"second Back exits without another JS request");c.backHandler.fire();require(c.finishes==1,"second Back cancels timer");
    c=new RemoteBackCheck();c.ready=false;c.sendRemote("Escape",true);require(c.finishes==1&&c.web.calls==0,"startup Back is independent of readiness");
    c=new RemoteBackCheck();c.web=null;c.sendRemote("Escape",true);require(c.finishes==1,"no WebView still exits");
    c=new RemoteBackCheck();c.web=null;c.failureDetails=new View();c.sendRemote("Escape",true);require(!c.finished&&c.failureDetails.visibility==View.GONE&&c.failureDetailsButton.focused,"diagnostic detail Back closes details first");c.sendRemote("Escape",true);require(c.finishes==1,"next Back exits diagnostics");
    c=new RemoteBackCheck();c.web.fail=true;c.sendRemote("Escape",true);require(c.finishes==1,"native evaluate exception must exit");
    c=new RemoteBackCheck();c.sendRemote("Enter",false);require(c.backHandler.pending==null,"non-Back key has no exit timer");c.web.callback.accept("false");require(!c.finished,"unhandled non-Back does not exit");
    c=new RemoteBackCheck();c.sendRemote("Escape",true);c.foreground=false;c.cancelBack();c.backHandler.fire();require(!c.finished&&!c.backPending,"background/destroy cancels pending back");
    System.out.println("PASS: production remote handler: normal Back, no-callback timeout, double Back, early startup, diagnostics, stale callback, evaluate failure, and background cancellation");
  }
}
'''
with tempfile.TemporaryDirectory(prefix='clock-tv-back-') as output:
    test = Path(output) / 'RemoteBackCheck.java'
    test.write_text(back_harness)
    subprocess.run([str(jdk), '-encoding', 'UTF-8', '-d', output, str(test)], check=True)
    subprocess.run([str(jdk.with_name('java' + jdk.suffix)), '-cp', output, 'RemoteBackCheck'], check=True)
