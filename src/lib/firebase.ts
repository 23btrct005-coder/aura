import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA9yRAPabjDcwZb1_3Er3UO9BM9kZmpjTA",
  authDomain: "aura-60c86.firebaseapp.com",
  projectId: "aura-60c86",
  storageBucket: "aura-60c86.firebasestorage.app",
  messagingSenderId: "748718813859",
  appId: "1:748718813859:web:a6ce6074048f2fd635c516",
  measurementId: "G-3ERV1G0YNT"
};

// Initialize Firebase only if it hasn't been initialized already
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, googleProvider };
