/**
 * AndroGRAM — Profile (protected)
 */
import { getUserInitials } from "./auth.js";
import { initProtectedPage, formatDate } from "./app-shell.js";

initProtectedPage((user) => {
  const initials = getUserInitials(user);
  const name = user.displayName?.trim() || "AndroGRAM User";
  const email = user.email || "—";

  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  };

  set("profile-avatar", initials);
  set("profile-name", name);
  set("profile-email", email);
  set("detail-name", name);
  set("detail-email", email);
  set("detail-uid", user.uid || "—");
  set("detail-verified", user.emailVerified ? "Yes" : "No");
  set("detail-provider", "Email / Password");
  set("detail-created", formatDate(user.metadata?.creationTime));
  set("detail-last", formatDate(user.metadata?.lastSignInTime));
});
