/**
 * AndroGRAM — Login page
 */
import {
  redirectIfAuthenticated,
  signIn,
  getAuthErrorMessage,
  DASHBOARD_PATH,
} from "./auth.js";

const loader = document.getElementById("page-loader");
const form = document.getElementById("login-form");
const errorEl = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");

function hideLoader() {
  loader?.classList.add("hidden");
}

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg;
  errorEl.classList.add("show");
}

function clearError() {
  if (!errorEl) return;
  errorEl.textContent = "";
  errorEl.classList.remove("show");
}

function safeNextPath() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return DASHBOARD_PATH;
  }
  // Only allow same-origin relative app paths
  if (!/\.html(\?|$)/.test(next) && next !== "/") return DASHBOARD_PATH;
  return next;
}

redirectIfAuthenticated(safeNextPath()).then(() => {
  hideLoader();
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = form.email.value.trim();
  const password = form.password.value;

  if (!email || !password) {
    showError("Please enter your email and password.");
    return;
  }

  submitBtn.disabled = true;
  const label = submitBtn.querySelector(".btn-label");
  const prev = label?.textContent;
  if (label) label.textContent = "Signing in…";

  try {
    await signIn({ email, password });
    window.location.replace(safeNextPath());
  } catch (err) {
    showError(getAuthErrorMessage(err));
    submitBtn.disabled = false;
    if (label) label.textContent = prev || "Log In";
  }
});
