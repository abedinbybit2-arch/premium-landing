/**
 * AndroGRAM — Shared authenticated shell (sidebar, user chip, logout)
 */
import {
  requireAuth,
  logOut,
  getUserInitials,
  onAuth,
  LOGIN_PATH,
} from "./auth.js";

/**
 * Bootstrap a protected page.
 * @param {(user: import("firebase/auth").User) => void} [onReady]
 */
export async function initProtectedPage(onReady) {
  const user = await requireAuth();

  const gate = document.getElementById("app-gate");
  const shell = document.getElementById("app-shell");

  fillUserChrome(user);
  wireSidebar();
  wireLogout();

  // If session ends in another tab, leave protected pages.
  onAuth((u) => {
    if (!u) {
      window.location.replace(LOGIN_PATH);
    }
  });

  if (typeof onReady === "function") {
    onReady(user);
  }

  if (shell) shell.classList.add("ready");
  if (gate) gate.classList.add("hidden");

  return user;
}

function fillUserChrome(user) {
  const initials = getUserInitials(user);
  const name = user.displayName?.trim() || "AndroGRAM User";
  const email = user.email || "";

  const avatar = document.getElementById("user-avatar");
  const nameEl = document.getElementById("user-name");
  const emailEl = document.getElementById("user-email");

  if (avatar) avatar.textContent = initials;
  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = email;
}

function wireSidebar() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("menu-toggle");
  const overlay = document.getElementById("sidebar-overlay");

  const open = () => {
    sidebar?.classList.add("open");
    if (overlay) {
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add("show"));
    }
  };

  const close = () => {
    sidebar?.classList.remove("open");
    if (overlay) {
      overlay.classList.remove("show");
      setTimeout(() => {
        overlay.hidden = true;
      }, 250);
    }
  };

  toggle?.addEventListener("click", () => {
    if (sidebar?.classList.contains("open")) close();
    else open();
  });

  overlay?.addEventListener("click", close);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) close();
  });
}

function wireLogout() {
  const btn = document.getElementById("logout-btn");
  btn?.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await logOut();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      alert("Could not log out. Please try again.");
    }
  });
}

export function formatDate(value) {
  if (!value) return "—";
  try {
    const d = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}
