/**
 * AndroGRAM — Dashboard (protected)
 */
import { initProtectedPage } from "./app-shell.js";

initProtectedPage((user) => {
  const welcome = document.getElementById("welcome-name");
  if (welcome) {
    const first =
      user.displayName?.trim()?.split(/\s+/)[0] ||
      user.email?.split("@")[0] ||
      "there";
    welcome.textContent = first;
  }
});
