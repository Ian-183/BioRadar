import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAmZBNfQ1pJ96a105GYh7QG2MYh1CAE79o",
  authDomain: "bioradar-7e784.firebaseapp.com",
  projectId: "bioradar-7e784",
  storageBucket: "bioradar-7e784.firebasestorage.app",
  messagingSenderId: "184353925443",
  appId: "1:184353925443:web:8ce9526dd6ab0eb096e7f6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);