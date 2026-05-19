import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB3qb-HWBYcf-bYmt8vOyzHVCx5Nc7W0Wo',
  authDomain: 'zone-app-cc098.firebaseapp.com',
  projectId: 'zone-app-cc098',
  storageBucket: 'zone-app-cc098.firebasestorage.app',
  messagingSenderId: '771528959241',
  appId: '1:771528959241:web:f1154cb4f5b62d73309fd8',
};

export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
