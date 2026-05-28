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

## RevenueCat setup
1. Create an account at [app.revenuecat.com](https://app.revenuecat.com).
2. Create an Android app and copy the public Android API key.
3. Replace `rc_android_REPLACE_ME` in `src/lib/subscriptions.ts`
   (the `RC_API_KEY` constant). The SDK is configured at runtime via
   `Purchases.configure({ apiKey })` so no config-plugin entry is
   needed in `app.json`.
4. Create the in-app subscription products in Google Play Console
   (one monthly, one annual). Default expected identifiers used by the
   paywall: `$rc_monthly` and `$rc_annual` packages under the `pro`
   entitlement.
5. Link the products in the RevenueCat dashboard and attach them to
   an offering named `default`.

## Branded assets
The icon / adaptive-icon / splash PNGs in `assets/` are programmatic
placeholders (dark background + gold dot). Replace with real branded
1024×1024 (icons) and 1284×2778 (splash) PNGs before submitting to the
Play Store.

## Development tips
- Local development without a build: `npm start`. RevenueCat calls are
  no-ops in Expo Go because `Constants.appOwnership === 'expo'`.
- For local Pro testing without RevenueCat configured, edit
  `src/hooks/usePro.ts` (the `__DEV__` short-circuit at the top of the
  hook returns Pro immediately).
- Type check before pushing: `npx tsc --noEmit`.
