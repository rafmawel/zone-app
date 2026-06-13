# Zone — Build Instructions

## Prerequisites
```
npm install -g eas-cli
eas login
```
(Use your Expo account.)

## First time setup
```
eas build:configure
```
This will ask for your Expo project ID and write it into `app.json`
(replace the `REPLACE_WITH_EAS_PROJECT_ID` placeholder under `extra.eas.projectId`).

## Build preview APK (install directly on Android)
```
eas build --platform android --profile preview
```

## Development build
```
eas build --platform android --profile development
```

## Build production AAB (for Play Store)
```
eas build --platform android --profile production
```

## After build
Download the `.apk` from the EAS dashboard.

Install on Android:
```
adb install zone.apk
```
Or scan the QR code shown in the EAS dashboard.

## Branded assets
The icon / adaptive-icon / splash PNGs in `assets/` are programmatic
placeholders (dark background + accent dot). Replace with real branded
1024×1024 (icons) and 1284×2778 (splash) PNGs before submitting to the
Play Store.

## Development tips
- Local development without a build: `npm start`.
- Every feature is free — the app has no subscription/paywall layer.
- Type check before pushing: `npx tsc --noEmit`.
