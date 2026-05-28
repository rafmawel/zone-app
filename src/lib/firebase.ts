import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import * as firebaseAuth from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// getReactNativePersistence ships in the React Native bundle but is not
// part of the web type definitions Metro resolves for TypeScript.
const getReactNativePersistence = (
  firebaseAuth as unknown as {
    getReactNativePersistence: (storage: unknown) => Persistence;
  }
).getReactNativePersistence;

const firebaseConfig = {
  apiKey: 'AIzaSyB3qb-HWBYcf-bYmt8vOyzHVCx5Nc7W0Wo',
  authDomain: 'zone-app-cc098.firebaseapp.com',
  projectId: 'zone-app-cc098',
  storageBucket: 'zone-app-cc098.firebasestorage.app',
  messagingSenderId: '771528959241',
  appId: '1:771528959241:web:f1154cb4f5b62d73309fd8',
};

export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const isExpoGo = Constants.appOwnership === 'expo';

interface MaybeCodedError {
  code?: string;
}

function createAuth(): Auth {
  // Expo Go bundles a Firebase JS SDK that already wires persistence;
  // initializeAuth there throws, so fall back to getAuth.
  if (isExpoGo) return getAuth(app);
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e: unknown) {
    if ((e as MaybeCodedError).code === 'auth/already-initialized') {
      return getAuth(app);
    }
    throw e;
  }
}

export const auth: Auth = createAuth();
export const db: Firestore = getFirestore(app);
