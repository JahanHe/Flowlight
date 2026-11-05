"""Resolve the standard Android SDK/JDK or the original checkout's local tools."""
import os
from pathlib import Path
import shutil

local = Path(__file__).resolve().parent / 'toolchain'
sdk_home = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
if sdk_home:
    BUILD_TOOLS = Path(sdk_home) / 'build-tools/35.0.0'
    ANDROID_JAR = Path(sdk_home) / 'platforms/android-35/android.jar'
else:
    BUILD_TOOLS = local / 'build-tools/android-15'
    ANDROID_JAR = local / 'platform/android-35/android.jar'
if not ANDROID_JAR.is_file() or not (BUILD_TOOLS / 'lib/apksigner.jar').is_file():
    raise SystemExit('Set ANDROID_HOME to an SDK with platforms;android-35 and build-tools;35.0.0.')

if os.environ.get('JAVA_HOME'):
    JDK_BIN = Path(os.environ['JAVA_HOME']) / 'bin'
else:
    bundled = sorted(local.glob('*/jdk*/Contents/Home/bin/javac'))
    javac = bundled[0] if bundled else shutil.which('javac')
    if not javac:
        raise SystemExit('Set JAVA_HOME to a JDK 21 installation.')
    JDK_BIN = Path(javac).parent
if not (JDK_BIN / ('javac.exe' if os.name == 'nt' else 'javac')).is_file():
    raise SystemExit('JAVA_HOME must point to a JDK installation with bin/javac.')
