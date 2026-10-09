#!/bin/sh
# Builds a debug-signed TeliTall.apk. Requires Android SDK 34 build-tools.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/tmp/android-sdk}}"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-34/android.jar"
OUT="${TMPDIR:-/tmp}/telitall-apk-out"
DEST="${1:-$ROOT/../artifacts/TeliTall.apk}"

if [ ! -x "$BT/aapt2" ] || [ ! -f "$PLATFORM" ]; then
  echo "Android SDK not found at $SDK (need platforms/android-34 and build-tools/34.0.0)." >&2
  exit 1
fi

python3 "$ROOT/make-icons.py"
rm -rf "$OUT"
mkdir -p "$OUT/classes" "$OUT/compiled" "$(dirname "$DEST")"

"$BT/aapt2" compile --dir "$ROOT/app/src/main/res" -o "$OUT/compiled/resources.zip"
"$BT/aapt2" link \
  -I "$PLATFORM" \
  --manifest "$ROOT/app/src/main/AndroidManifest.xml" \
  -o "$OUT/linked.apk" \
  --auto-add-overlay \
  "$OUT/compiled/resources.zip"

javac --release 17 -classpath "$PLATFORM" -d "$OUT/classes" \
  "$ROOT/app/src/main/java/app/telitall/MainActivity.java"

"$BT/d8" --min-api 24 --output "$OUT" "$OUT/classes/app/telitall/"*.class

cp "$OUT/linked.apk" "$OUT/unsigned.apk"
python3 - "$OUT/unsigned.apk" "$OUT/classes.dex" "$ROOT/app/src/main/assets/www/index.html" <<'PY'
import sys
import zipfile
apk, dex, html = sys.argv[1:]
with zipfile.ZipFile(apk, "a") as zf:
    zf.write(dex, "classes.dex")
    zf.write(html, "assets/www/index.html")
PY

"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$OUT/debug.keystore" ]; then
  keytool -genkeypair -keystore "$OUT/debug.keystore" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=TeliTall Debug,O=TeliTall,C=IN"
fi

"$BT/apksigner" sign \
  --ks "$OUT/debug.keystore" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --ks-key-alias androiddebugkey \
  --out "$DEST" \
  "$OUT/aligned.apk"

"$BT/apksigner" verify --verbose "$DEST"
echo "Wrote $DEST"
