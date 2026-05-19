import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  // @ts-expect-error — getReactNativePersistence is exposed at runtime
  // from 'firebase/auth' on RN but not declared in firebase's main types.
  getReactNativePersistence,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyB3qb-HWBYcf-bYmt8vOyzHVCx5Nc7W0Wo',
  authDomain: 'zone-app-cc098.firebaseapp.com',
  projectId: 'zone-app-cc098',
  storageBucket: 'zone-app-cc098.firebasestorage.app',
  messagingSenderId: '771528959241',
  appId: '1:771528959241:web:f1154cb4f5b62d73309fd8',
};

export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const auth: Auth = createAuth();
export const db: Firestore = getFirestore(app);
