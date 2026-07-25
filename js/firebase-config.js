/**
 * AndroGRAM — Firebase Web configuration
 * Project: abedin-eb675 | App: AndroGRAM Web
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAH_jy5t_7I8O7eagtTqRIDhA0m98ahjUo",
  authDomain: "abedin-eb675.firebaseapp.com",
  projectId: "abedin-eb675",
  storageBucket: "abedin-eb675.firebasestorage.app",
  messagingSenderId: "712418071147",
  appId: "1:712418071147:web:b3ae0b6e897de5c19c172e",
  measurementId: "G-K9ZCT791F0",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/** Persist session across reloads (IndexedDB / local storage). */
const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(
  (err) => {
    console.warn("Auth persistence setup:", err?.message || err);
  }
);

export { app, auth, firebaseConfig, persistenceReady };
