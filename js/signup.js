/**
 * AndroGRAM — Sign up page
 */
import {
  redirectIfAuthenticated,
  signUp,
  getAuthErrorMessage,
  DASHBOARD_PATH,
} from "./auth.js";

const loader = document.getElementById("page-loader");
const form = document.getElementById("signup-form");
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

redirectIfAuthenticated(DASHBOARD_PATH).then(() => {
  hideLoader();
});

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!name) {
    showError("Please enter your full name.");
    return;
  }
  if (!email) {
    showError("Please enter a valid email address.");
    return;
  }
  if (!password || password.length < 6) {
    showError("Password must be at least 6 characters.");
    return;
  }

  submitBtn.disabled = true;
  const label = submitBtn.querySelector(".btn-label");
  const prev = label?.textContent;
  if (label) label.textContent = "Creating account…";

  try {
    await signUp({ name, email, password });
    window.location.replace(DASHBOARD_PATH);
  } catch (err) {
    showError(getAuthErrorMessage(err));
    submitBtn.disabled = false;
    if (label) label.textContent = prev || "Sign Up";
  }
});
