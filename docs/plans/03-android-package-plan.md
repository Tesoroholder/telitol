# TeliTall Android package plan

## Why this is not a copy of the server inside a phone

The web app needs three things a sideloaded APK cannot honestly carry:

1. A Postgres database shared by every member.
2. A signed-in session (`context.userId`) on every write.
3. `XAI_API_KEY` on the server, which must not be baked into an installable file. Anyone who unpacks an APK can read a key shipped inside it.

Wrapping the website in a WebView that points at a private preview would also fail on a phone: that address is not a public site, and it is not the user's network.

So `TeliTall.apk` is a **phone edition** of the same product, not a remote control for the website.

## What the phone edition is

A small Android app (`app.telitall`) with one activity. The activity is a WebView that loads `file:///android_asset/www/index.html`. There is no remote code, no analytics, and no embedded API key.

The page is the TeliTall UI: boot mark, Home, Ask, question thread, Laya, You, and the same colors, wordmark, categories, validation sentences, reputation math, and crisis reply.

Posts, votes, the display name, and Laya threads are stored in the WebView's `localStorage` on that phone. They do not sync to the website, and the website's members do not appear as live people. The opening questions are the same seed stories as `migrations/0002_telitall.sql`, so the room is not empty the first time it opens.

Seed voices are given the reputation those actions would have earned (answer +2, helpful votes, accept +5), so Helper and Trusted show up. On the website, seed authors have no `profiles` row, so they currently read as "New voice" until a profile exists. That difference is intentional and documented here.

## How Laya differs

On the website, Laya calls the live model after the crisis check.

On the phone, the crisis check is the same and the crisis reply is the same. Every other reply is an on-device companion written to the same voice rules (plain, short, not a clinician, invites a real story on TeliTall). It does not call the network. The Laya screen says that, so the phone does not pretend to be the live model.

## Android project

```
android/app/src/main/AndroidManifest.xml
android/app/src/main/java/app/telitall/MainActivity.java
android/app/src/main/assets/www/index.html
android/app/src/main/res/mipmap-*/ic_launcher.png
android/make-icons.py
android/build-apk.sh
```

`MainActivity` enables JavaScript and DOM storage (required for `localStorage`), resizes for the keyboard, keeps state across rotation, and lets the system Back button walk the in-app stack before leaving the app. The status bar is white with dark icons.

Target SDK 34, minimum SDK 24 (Android 7). INTERNET is declared because WebView is a browser component; the page itself does not fetch anything.

## How the APK was built

Debug-signed with a throwaway keystore created at build time (`CN=TeliTall Debug`). This is the right signature for a personal install. It is not a Play App Signing key, and it will not update an install that was signed with a different key.

Toolchain, not committed (it is the Android SDK license, and it is large):

- Android command-line tools
- `platforms;android-34`
- `build-tools;34.0.0` (`aapt2`, `d8`, `zipalign`, `apksigner`)
- `javac` 17 against `android.jar`

`android/build-apk.sh` repeats those steps when `ANDROID_SDK_ROOT` points at an SDK that already contains those packages.

## Install

1. Copy `TeliTall.apk` onto the phone.
2. Open it and allow install from the app that received the file (Files, Chrome, or Drive). Android calls this "install unknown apps."
3. Open TeliTall. The first screen is the mark, then the community.
4. Set a name under You. Ask, answer, and talk to Laya. Everything stays on the phone until the app's storage is cleared.

Uninstall removes the on-device posts.
