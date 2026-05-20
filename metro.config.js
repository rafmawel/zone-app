const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Force Metro to use the legacy main/react-native field resolution instead of
// the package "exports" map. firebase 10's umbrella package routes
// `firebase/auth` to its browser bundle, which never registers the RN auth
// component — surfacing as "Component auth has not been registered yet".
// Disabling exports lets Metro resolve to @firebase/auth's RN bundle.
config.resolver.unstable_enablePackageExports = false;

module.exports = withNativeWind(config, { input: './global.css' });

