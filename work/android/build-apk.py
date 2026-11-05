#!/usr/bin/env python3
"""Build the offline clock with the official SDK command-line tools, without Gradle."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tv', action='store_true', help='Build the standalone Android TV edition')
parser.add_argument('--dev', action='store_true', help='Make a separately installable test APK, signed with its own local test key')
args = parser.parse_args()
TV = args.tv
BUILD = ROOT / (('build-tv' if TV else 'build') + ('-dev' if args.dev else ''))
OUTPUT = BUILD / 'test.apk' if args.dev else PROJECT / 'outputs' / ('浮光·TV.apk' if TV else '浮光时钟.apk')
ASSET = 'glass-clock-tv.html' if TV else 'glass-clock.html'
SOURCE = (BUILD if args.dev and not TV else PROJECT / 'outputs') / ASSET
MANIFEST = ROOT / ('AndroidManifest-tv.xml' if TV else 'AndroidManifest.xml')
manifest = ET.parse(MANIFEST).getroot()
version = {field: manifest.get('{http://schemas.android.com/apk/res/android}' + field) for field in ['versionCode', 'versionName']}
PACKAGE = manifest.get('package') + ('.dev' if args.dev else '')
MIN_SDK = 23 if TV else 26
SOURCE_DIR = ROOT / ('tv-src' if TV else 'src')
ASSETS = BUILD / 'assets' if TV or args.dev else ROOT / 'assets'
signing = (BUILD if args.dev else ROOT) / 'signing'
key = signing / ('test.jks' if args.dev else 'local-release.jks')
password_file = signing / 'keystore-password'
if not args.dev and not (key.is_file() and password_file.is_file()):
    raise SystemExit('Official signing key required. Use --dev to build a separate test app.')
from android_tools import ANDROID_JAR, BUILD_TOOLS as SDK, JDK_BIN

def exe(directory, name):
    return directory / (name + '.exe' if os.name == 'nt' else name)

if not args.dev:
    cert = subprocess.check_output([exe(JDK_BIN, 'keytool'), '-exportcert', '-keystore', key,
                                    '-storepass:file', password_file, '-alias', 'floating-light'])
    if hashlib.sha256(cert).hexdigest() != '468780696fd58f9c9a7eeeff7fccae9c826ace0c69a9baa63b58a43ed96f7beb':
        raise SystemExit('Signing certificate does not match the published app. Use --dev for local tests.')
if not TV:
    # ponytail: one existing build command refreshes the shared page and both full editions.
    subprocess.run([sys.executable, str(PROJECT / 'work/build-weather-clock.py'), '--output', SOURCE], check=True)
if not SOURCE.is_file():
    raise SystemExit(f'Missing HTML: {SOURCE}; build the web edition first.')
if TV:
    frozen_hashes = json.loads((PROJECT / 'work/tv-frozen-1.0.4.json').read_text())
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == frozen_hashes[ASSET], 'Expected the frozen TV page'
    assert f'<meta name="clock-tv-version" content="{version["versionName"]}">' in SOURCE.read_text(), 'Rebuild TV HTML after changing the manifest version'
else:
    assert f'<meta name="clock-mobile-version" content="{version["versionName"]}">' in SOURCE.read_text(), 'Rebuild phone HTML after changing the manifest version'

def run(*args, capture=False):
    result = subprocess.run([str(arg) for arg in args], check=True, text=True, capture_output=capture)
    return result.stdout if capture else None

for directory in ['classes', 'generated', 'dex']:
    path = BUILD / directory
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)
ASSETS.mkdir(parents=True, exist_ok=True)
shutil.copyfile(SOURCE, ASSETS / ASSET)
run(exe(SDK, 'aapt2'), 'compile', '--dir', ROOT / 'res', '-o', BUILD / 'compiled-resources.zip')
resources = [BUILD / 'compiled-resources.zip']
if TV:
    run(exe(SDK, 'aapt2'), 'compile', '--dir', ROOT / 'tv-res', '-o', BUILD / 'compiled-tv-resources.zip')
    resources.append(BUILD / 'compiled-tv-resources.zip')
rename = ['--rename-manifest-package', PACKAGE] if args.dev else []
run(exe(SDK, 'aapt2'), 'link', *rename, '-o', BUILD / 'unsigned.apk', '--manifest', MANIFEST,
    '-I', ANDROID_JAR, '-A', ASSETS, '--java', BUILD / 'generated', *resources)
java_sources = list(SOURCE_DIR.rglob('*.java')) + list((BUILD / 'generated').rglob('*.java'))
run(exe(JDK_BIN, 'javac'), '-encoding', 'UTF-8', '--release', '8', '-classpath', ANDROID_JAR,
    '-d', BUILD / 'classes', *java_sources)
run(exe(JDK_BIN, 'java'), '-cp', SDK / 'lib' / 'd8.jar', 'com.android.tools.r8.D8', '--release', '--min-api', str(MIN_SDK),
    '--lib', ANDROID_JAR, '--output', BUILD / 'dex', *sorted((BUILD / 'classes').rglob('*.class')))
with zipfile.ZipFile(BUILD / 'unsigned.apk', 'a') as apk:
    for dex in (BUILD / 'dex').glob('*.dex'):
        apk.write(dex, dex.name, compress_type=zipfile.ZIP_STORED)
run(exe(SDK, 'zipalign'), '-f', '-p', '4', BUILD / 'unsigned.apk', BUILD / 'aligned.apk')
if args.dev and not key.exists():
    signing.mkdir(mode=0o700, exist_ok=True)
    with password_file.open('x') as new_password:
        password_file.chmod(0o600)
        new_password.write(secrets.token_urlsafe(36))
    run(exe(JDK_BIN, 'keytool'), '-genkeypair', '-keystore', key, '-storetype', 'JKS',
        '-storepass:file', password_file, '-keypass:file', password_file, '-alias', 'floating-light',
        '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
        '-dname', 'CN=Floating Light Test Build')
    key.chmod(0o600)
run(exe(JDK_BIN, 'java'), '-jar', SDK / 'lib' / 'apksigner.jar', 'sign', '--ks', key,
    '--ks-key-alias', 'floating-light', '--ks-pass', 'file:' + str(password_file),
    '--v1-signing-enabled', 'true',
    '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true', '--v4-signing-enabled', 'false',
    '--out', OUTPUT, BUILD / 'aligned.apk')
verification = run(exe(JDK_BIN, 'java'), '-jar', SDK / 'lib' / 'apksigner.jar', 'verify', '--verbose', '--print-certs', OUTPUT, capture=True)
badging = run(exe(SDK, 'aapt2'), 'dump', 'badging', OUTPUT, capture=True)
run(exe(SDK, 'zipalign'), '-c', '-p', '4', OUTPUT)
with zipfile.ZipFile(OUTPUT) as apk:
    assert apk.testzip() is None
    assert apk.read('assets/' + ASSET) == SOURCE.read_bytes(), 'APK must contain the latest exact HTML'
    assert 'classes.dex' in apk.namelist()
assert f"package: name='{PACKAGE}'" in badging
for field, expected in version.items():
    assert expected and f"{field}='{expected}'" in badging
assert f"minSdkVersion:'{MIN_SDK}'" in badging and "targetSdkVersion:'35'" in badging
permissions = [line for line in badging.splitlines() if line.startswith('uses-permission:')]
assert len(permissions) == (1 if TV else 2) and all('INTERNET' in line or (not TV and 'ACCESS_COARSE_LOCATION' in line) for line in permissions)
assert 'android.permission.ACCESS_FINE_LOCATION' not in badging
assert 'application-debuggable' not in badging
source = next(SOURCE_DIR.rglob('*Activity.java')).read_text()
assert 'addJavascriptInterface' not in source
assert 'setAllowFileAccess(false)' in source and 'setAllowContentAccess(false)' in source
report = {
    'apk': OUTPUT.name,
    'bytes': OUTPUT.stat().st_size,
    'sha256': hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
    'htmlSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'package': PACKAGE,
    **version,
    'minSdk': MIN_SDK,
    'targetSdk': 35,
    'signature': verification.strip(),
    'permissions': permissions,
    'checks': ['signature v2/v3', 'ZIP alignment', 'complete ZIP integrity', 'exact latest HTML', 'manifest', 'restricted WebView source'],
    'runtimeVerified': False,
}
if TV:
    assert 'Verified using v1 scheme (JAR signing): true' in verification, 'Android 6 requires v1 signing'
    assert 'FLAG_KEEP_SCREEN_ON' in source and 'clearFlags' not in source
    assert "leanback-launchable-activity: name='local.fuguang.clock.tv.TVClockActivity'" in badging
    assert 'android.hardware.touchscreen' not in '\n'.join(line for line in badging.splitlines() if line.startswith('uses-feature:'))
    assert 'native-code:' not in badging, 'TV APK must be independent of CPU ABI'
    with zipfile.ZipFile(OUTPUT) as apk:
        assert not any(name.startswith('lib/') for name in apk.namelist())
        assert 'res/drawable-xhdpi-v4/tv_banner.png' in apk.namelist()
        assert 'assets/glass-clock.html' not in apk.namelist()
    report['checks'] += ['Android 6 v1 signature', 'TV + standard launcher', 'no touchscreen requirement', '32/64-bit CPU independent', 'no bundled browser/runtime', 'TV banner', 'foreground screen stays on independently of HTML/fullscreen']
    report['pageUrl'] = 'https://appassets.androidplatform.net/assets/glass-clock-tv.html?v=' + version['versionCode']
    if not args.dev:
        versioned_output = OUTPUT.with_name('浮光·TV-' + version['versionName'] + '.apk')
        shutil.copyfile(OUTPUT, versioned_output)
        report['versionedApk'] = versioned_output.name
        shutil.copyfile(OUTPUT, OUTPUT.with_name('浮光时钟-TV.apk'))
else:
    assert 'FLAG_KEEP_SCREEN_ON' in source and 'clearFlags' not in source
    assert 'android:hardwareAccelerated="true"' in MANIFEST.read_text()
    assert 'native-code:' not in badging, 'Phone APK must be independent of CPU ABI'
    with zipfile.ZipFile(OUTPUT) as apk:
        assert 'assets/glass-clock-tv.html' not in apk.namelist()
        assert not any(name.startswith('lib/') for name in apk.namelist())
    assert "launchable-activity: name='local.fuguang.clock.ClockActivity'" in badging
    report['pageUrl'] = 'https://appassets.androidplatform.net/assets/glass-clock.html?v=' + version['versionCode']
    report['runtimeQueryFields'] = ['ramMB', 'availableMB', 'cores', 'lowRam', 'heapMB']
    report['checks'] += ['phone page version matches manifest', 'hardware acceleration enabled', 'foreground screen stays on', 'no bundled browser/runtime', '32/64-bit CPU independent']
if not TV and not args.dev:
    versioned_output = OUTPUT.with_name('浮光时钟-手机版-' + version['versionName'] + '.apk')
    shutil.copyfile(OUTPUT, versioned_output)
    report['versionedApk'] = versioned_output.name
    run(sys.executable, PROJECT / 'work/package-portable-clock.py')
    portable_name = '浮光时钟-通用版-' + version['versionName']
    portable_zip = PROJECT / 'outputs' / (portable_name + '.zip')
    with zipfile.ZipFile(portable_zip) as portable:
        assert portable.testzip() is None
        page = portable.read(portable_name + '/浮光时钟.html').decode('utf-8')
    # Only the platform label and an extra license notice may differ; styles, assets and scripts must match.
    page = page.replace(f'<span class="edition-label">通用网页版 {version["versionName"]}</span>',
                        f'<span class="edition-label">手机版 {version["versionName"]}</span>', 1)
    page = re.sub(r'<template id="solar-license">.*?</template>\n', '', page, count=1, flags=re.S)
    assert page == SOURCE.read_text(encoding='utf-8'), 'Phone and portable editions must contain the same shared page'
    report['portableZip'] = portable_zip.name
    report['portableZipSha256'] = hashlib.sha256(portable_zip.read_bytes()).hexdigest()
    report['checks'] += ['portable ZIP integrity', 'phone and portable versions and shared page match']
(BUILD / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
(BUILD / 'manifest-badging.txt').write_text(badging)
print(json.dumps(report, ensure_ascii=False, indent=2))
