// Firebase configuration — hardcoded for GeoAttend
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDgudNZMKVeAsyMnA0URhxigq7Liz413fU",
  authDomain: "geoattend-ee6a2.firebaseapp.com",
  databaseURL: "https://geoattend-ee6a2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "geoattend-ee6a2",
  storageBucket: "geoattend-ee6a2.firebasestorage.app",
  messagingSenderId: "1096021041039",
  appId: "1:1096021041039:web:acd298ce6e686b46e035fa"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
