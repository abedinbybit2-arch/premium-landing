/**
 * AndroGRAM — Authentication helpers & route protection
 * Session is restored via Firebase onAuthStateChanged + local persistence.
 */
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { auth, persistenceReady } from "./firebase-config.js";

const LOGIN_PATH = "/login.html";
const DASHBOARD_PATH = "/dashboard.html";

/**
 * Wait until Firebase restores any existing session.
 * @returns {Promise<import("firebase/auth").User | null>}
 */
export function waitForAuth() {
  return persistenceReady.then(
    () =>
      new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
          unsub();
          resolve(user);
        });
      })
  );
}

/**
 * Protect authenticated pages. Redirects guests to Login.
 * @returns {Promise<import("firebase/auth").User>}
 */
export async function requireAuth() {
  const user = await waitForAuth();
  if (!user) {
    const next = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.replace(`${LOGIN_PATH}?next=${next}`);
    return new Promise(() => {});
  }
  return user;
}

/**
 * Keep authenticated users out of public auth/landing pages.
 * @param {string} [redirectTo]
 */
export async function redirectIfAuthenticated(redirectTo = DASHBOARD_PATH) {
  const user = await waitForAuth();
  if (user) {
    window.location.replace(redirectTo);
    return new Promise(() => {});
  }
  return null;
}

/**
 * Subscribe to auth changes (e.g. multi-tab sign-out).
 * @param {(user: import("firebase/auth").User | null) => void} cb
 */
export function onAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function signUp({ name, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const displayName = (name || "").trim();
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

export async function signIn({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logOut() {
  await signOut(auth);
  window.location.replace(LOGIN_PATH);
}

export function getAuthErrorMessage(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/operation-not-allowed": "Email/password sign-in is not enabled.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/unauthorized-domain":
      "This domain is not authorized for Firebase Auth. Add it in Firebase Console → Authentication → Settings → Authorized domains.",
  };
  return map[code] || error?.message || "Something went wrong. Please try again.";
}

export function getUserInitials(user) {
  const name = user?.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const email = user?.email || "?";
  return email.slice(0, 2).toUpperCase();
}

export { auth, DASHBOARD_PATH, LOGIN_PATH };
