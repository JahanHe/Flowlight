#!/usr/bin/env python3
"""Compile the phone Activity and exercise its production Back handler without Android."""
from pathlib import Path
from android_tools import ANDROID_JAR, JDK_BIN
import os
import subprocess
import json
import re
import tempfile
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parent
ns = '{http://schemas.android.com/apk/res/android}'
manifest = ET.parse(root / 'AndroidManifest.xml').getroot()
assert manifest.get('package') == 'local.fuguang.clock'
assert manifest.get(ns + 'versionName') == '1.4.0' and manifest.get(ns + 'versionCode') == '13'
assert manifest.find('uses-sdk').get(ns + 'minSdkVersion') == '26'
assert {p.get(ns + 'name') for p in manifest.findall('uses-permission')} == {'android.permission.INTERNET', 'android.permission.ACCESS_COARSE_LOCATION'}
assert all(f.get(ns + 'required') == 'false' for f in manifest.findall('uses-feature'))
application = manifest.find('application')
assert application.get(ns + 'hardwareAccelerated') == 'true'
assert application.get(ns + 'usesCleartextTraffic') == 'false'
assert not application.findall('service')
assert application.find('activity').get(ns + 'screenOrientation') is None
assert {x.get(ns + 'name') for x in application.findall('./activity/intent-filter/category')} == {'android.intent.category.LAUNCHER'}
source = root / 'src/local/fuguang/clock/ClockActivity.java'
java = source.read_text()
for expected in ['pageUrl = PAGE + "?v=" + app.versionCode', 'web.loadUrl(pageUrl)', 'pageUrl.equals(uri.toString())',
                 '"Cache-Control", "no-store, max-age=0"', 'setAllowFileAccess(false)', 'setAllowContentAccess(false)',
                 '"Referrer-Policy", "no-referrer"',
                 'setAllowUniversalAccessFromFileURLs(false)', 'MIXED_CONTENT_NEVER_ALLOW',
                 'web.onPause(); web.pauseTimers();', 'web.onResume(); web.resumeTimers();',
                 'if (!isLocal(Uri.parse(origin)))', 'request.hasGesture()', 'BACK_TIMEOUT_MS = 1500',
                 'this::handleBack', 'onBackPressed() { handleBack(); }']:
    assert expected in java, expected
for prohibited in ['addJavascriptInterface', 'clearCache', 'deleteAllData', 'newWakeLock', 'clearFlags', 'setLayerType', 'preferredRefreshRate']:
    assert prohibited not in java, prohibited
assert java.index('FLAG_KEEP_SCREEN_ON') < java.index('web = new WebView(this)')
for field in ['ramMB', 'availableMB', 'cores', 'lowRam', 'heapMB']:
    assert '.appendQueryParameter("' + field + '",' in java
for getter in ['manager.getMemoryInfo(memory)', 'memory.totalMem / 1048576L', 'memory.availMem / 1048576L',
               'Runtime.getRuntime().availableProcessors()', 'manager.isLowRamDevice() ? "1" : "0"', 'manager.getMemoryClass()']:
    assert getter in java
assert java.index('manager.getMemoryInfo(memory)') < java.index('web = new WebView(this)')
assert java.count('getMemoryInfo(') == 1, 'metadata must be a startup snapshot, not native polling'
for api in [28, 30, 33]:
    assert 'Build.VERSION.SDK_INT >= ' + str(api) in java
assert 'foreground = false;\n        cancelBack();' in java
assert 'onDestroy() {\n        cancelBack();' in java
gone = java[java.index('public boolean onRenderProcessGone'):java.index('web.setWebChromeClient')]
assert 'view.destroy();' in gone and '.setOnCancelListener(dialog -> finish())' in gone
assert gone.count('recreate()') == 1 and '.setPositiveButton("重新打开", (dialog, which) -> recreate())' in gone

jdk = JDK_BIN / ('javac.exe' if os.name == 'nt' else 'javac')
with tempfile.TemporaryDirectory(prefix='clock-phone-native-') as output:
    subprocess.run([str(jdk), '-encoding', 'UTF-8', '--release', '8', '-classpath',
        str(ANDROID_JAR), '-d', output, str(source)], check=True)

start = java.index('    private void handleBack() {')
back = java[start:java.index('    @Override public void onBackPressed()', start)]
fields = java[java.index('    private static final long BACK_TIMEOUT_MS'):java.index('\n\n    @Override public void onCreate')]
harness = '''
import java.util.function.Consumer;
public class PhoneBackCheck {
  boolean finished;int finishes,customClosed; Object customView;
  WebView web=new WebView();
  boolean isFinishing(){return finished;}
  void finish(){finished=true;finishes++;}
  void hideCustomView(){customView=null;customClosed++;}
  static class Looper {static Object getMainLooper(){return null;}}
  static class Handler {Runnable pending;long delay;
    Handler(Object looper){}void postDelayed(Runnable r,long ms){pending=r;delay=ms;}
    void removeCallbacks(Runnable r){if(pending==r)pending=null;}
    void fire(){Runnable r=pending;pending=null;if(r!=null)r.run();}}
  static class WebView {Consumer<String> callback;boolean fail;int calls;
    void evaluateJavascript(String script,Consumer<String> callback){if(fail)throw new IllegalStateException();this.callback=callback;calls++;}}
''' + fields + back + '''
  static PhoneBackCheck fresh(){PhoneBackCheck c=new PhoneBackCheck();c.foreground=true;return c;}
  static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
  public static void main(String[] args){
    PhoneBackCheck c=fresh();c.handleBack();c.web.callback.accept("true");c.backHandler.fire();require(!c.finished&&!c.backPending,"handled Back closes panel without exiting");
    c=fresh();c.handleBack();c.web.callback.accept("false");require(c.finishes==1,"unhandled Back exits");
    c=fresh();c.handleBack();require(c.backHandler.delay==1500,"bounded timeout");c.backHandler.fire();require(c.finishes==1,"no callback exits");c.web.callback.accept("true");require(c.finishes==1,"late callback cannot revive activity");
    c=fresh();c.handleBack();c.handleBack();c.backHandler.fire();require(c.finishes==1&&c.web.calls==1,"second Back exits immediately and cancels timer");
    c=fresh();c.customView=new Object();c.handleBack();require(c.customClosed==1&&!c.finished&&c.web.calls==0,"native fullscreen closes before JS evaluation");
    c=fresh();c.web=null;c.handleBack();require(c.finishes==1,"no WebView still exits");
    c=fresh();c.web.fail=true;c.handleBack();require(c.finishes==1&&!c.backPending,"evaluate failure exits");
    c=fresh();c.handleBack();c.foreground=false;c.cancelBack();c.backHandler.fire();require(!c.finished&&!c.backPending,"pause/destroy cancels pending timeout");
    c=fresh();c.handleBack();WebView old=c.web;c.web=new WebView();old.callback.accept("false");require(!c.finished,"stale WebView callback ignored");c.cancelBack();
    System.out.println("PASS: actual phone Back method: normal panel, unhandled exit, 1.5s no-reply fallback, second Back, native fullscreen, missing WebView, evaluate exception, background and stale callback");
  }
}
'''
with tempfile.TemporaryDirectory(prefix='clock-phone-back-') as output:
    test = Path(output) / 'PhoneBackCheck.java'
    test.write_text(harness)
    subprocess.run([str(jdk), '-encoding', 'UTF-8', '-d', output, str(test)], check=True)
    subprocess.run([str(jdk.with_name('java' + jdk.suffix)), '-cp', output, 'PhoneBackCheck'], check=True)

# Exercise the actual navigation method, including source links added with the calendar.
start = java.index('            @Override public boolean shouldOverrideUrlLoading(')
navigation = java[start:java.index('            @Override public boolean onRenderProcessGone', start)].replace('@Override ', '', 1)
navigation_harness = '''
public class PhoneNavigationCheck {
  static final String HOST="appassets.androidplatform.net";
  String pageUrl="https://"+HOST+"/assets/glass-clock.html?v=13", opened;
  static class WebView {}
  static class Uri {String raw;java.net.URI value;
    Uri(String raw){this.raw=raw;value=java.net.URI.create(raw);}
    String getScheme(){return value.getScheme();}String getHost(){return value.getHost();}
    public String toString(){return raw;}}
  static class WebResourceRequest {Uri uri;boolean main,gesture;
    WebResourceRequest(String url,boolean main,boolean gesture){uri=new Uri(url);this.main=main;this.gesture=gesture;}
    Uri getUrl(){return uri;}boolean isForMainFrame(){return main;}boolean hasGesture(){return gesture;}}
  static class Intent {static final String ACTION_VIEW="view";Uri uri;Intent(String action,Uri uri){this.uri=uri;}}
  static class android {static class content {static class ActivityNotFoundException extends RuntimeException {}}}
  void startActivity(Intent intent){opened=intent.uri.toString();}
''' + navigation + '''
  void check(String url,boolean main,boolean gesture,boolean blocked,boolean external){
    opened=null;boolean result=shouldOverrideUrlLoading(new WebView(),new WebResourceRequest(url,main,gesture));
    if(result!=blocked||(opened!=null)!=external)throw new AssertionError(url+" main="+main+" gesture="+gesture);
  }
  public static void main(String[] args){
    PhoneNavigationCheck c=new PhoneNavigationCheck();
    c.check(c.pageUrl,true,false,false,false);
    for(String url:new String[]{"https://www.un.org/en/observances", "https://www.gushiwen.cn/", "https://www.eso.org/public/images/eso0932a/", "https://weather.cma.cn/"}){
      c.check(url,true,true,true,true);c.check(url,true,false,true,false);c.check(url,false,true,true,false);
    }
    for(String url:new String[]{"http://example.com/", "javascript:alert(1)", "intent://example.com/", "file:///sdcard/test.html", "https://appassets.androidplatform.net/other", "https://appassets.androidplatform.net:444/other"})c.check(url,true,true,true,false);
    System.out.println("PASS: actual native source navigation: main-frame tapped HTTPS opens externally; automatic/subframe/other schemes and internal asset variants stay blocked");
  }
}
'''
with tempfile.TemporaryDirectory(prefix='clock-phone-navigation-') as output:
    test = Path(output) / 'PhoneNavigationCheck.java'
    test.write_text(navigation_harness)
    subprocess.run([str(jdk), '-encoding', 'UTF-8', '-d', output, str(test)], check=True)
    subprocess.run([str(jdk.with_name('java' + jdk.suffix)), '-cp', output, 'PhoneNavigationCheck'], check=True)
print('PASS: phone version/package, API26 installation minimum, guarded APIs, hardware acceleration, foreground screen-on, background pause, no forced refresh/software layer, read-only startup memory/CPU URL hints with no-referrer, secure URL and optional coarse location, user-controlled renderer retry, Java compilation')

back_script = json.loads(re.search(r'private static final String BACK_SCRIPT = ("(?:\\.|[^"\\])*");', java)[1])
subprocess.run(['node', '-e', '''
const vm=require('node:vm'),assert=require('node:assert/strict'),script=JSON.parse(process.argv[1]);
function check(active,expected){
 const actions=[],elements={};
 for(const id of ['appearance-close','gallery-close'])elements[id]={getClientRects:()=>active[id]?[{}]:[],click:()=>actions.push(id)};
 if(!active.noCity){elements['city-form']={hidden:!active.city,getClientRects:()=>active.cityVisible===false?[]:[{}]};elements['city-toggle']={click:()=>actions.push('city-toggle')};}
 const document={fullscreenElement:active.fullscreen?{}:null,body:{classList:{contains:()=>!!active.cssFullscreen}},getElementById:id=>elements[id],dispatchEvent:()=>actions.push('Escape')};
 assert.equal(vm.runInNewContext(script,{document,KeyboardEvent:function(){}}),expected!==null);
 assert.deepEqual(actions,expected===null?[]:[expected]);
}
check({fullscreen:true,'appearance-close':true,'gallery-close':true,city:true},'Escape');
check({cssFullscreen:true,city:true},'Escape');
check({'appearance-close':true,'gallery-close':true,city:true},'appearance-close');
check({'gallery-close':true,city:true},'gallery-close');
check({city:true},'city-toggle');check({city:false},null);check({city:true,cityVisible:false},null);check({noCity:true},null);
console.log('PASS: actual native Back JavaScript preserves fullscreen/appearance/gallery order, closes visible city form, and allows exit when no panel is open');
''', json.dumps(back_script)], check=True)
