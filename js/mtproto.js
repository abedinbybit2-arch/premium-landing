/**
 * AndroGRAM — MTProto Automation page controller
 */
import { initProtectedPage } from "./app-shell.js";
import {
  sendCode,
  signIn,
  checkPassword,
  getMe,
  getOwnedGroups,
  addBotToGroups,
  logoutMtproto,
  getStoredSession,
  setStoredSession,
  getStoredMeta,
  setStoredMeta,
  clearMtprotoStorage,
  chunkArray,
} from "./mtproto-api.js";

const BATCH_SIZE = 10;
const TARGET_GROUPS = 100;

let ownedGroups = [];
let authState = {
  step: "phone", // phone | code | password | ready
  phone: "",
  phoneCodeHash: "",
  session: "",
  user: null,
};

const els = {};

function $(id) {
  return document.getElementById(id);
}

function cacheEls() {
  [
    "login-panel",
    "phone-step",
    "code-step",
    "password-step",
    "phone-input",
    "code-input",
    "password-input",
    "btn-send-code",
    "btn-verify-code",
    "btn-verify-password",
    "btn-resend-code",
    "btn-back-phone",
    "btn-back-code",
    "login-alert",
    "account-card",
    "account-name",
    "account-user",
    "account-phone",
    "account-id",
    "btn-tg-logout",
    "status-pill",
    "workspace-panel",
    "groups-list",
    "groups-empty",
    "groups-count",
    "btn-load-groups",
    "btn-select-all",
    "btn-select-100",
    "bot-username",
    "btn-add-bot",
    "bot-alert",
    "bot-progress",
    "bot-progress-bar",
    "bot-progress-label",
    "bot-results",
  ].forEach((id) => {
    els[id] = $(id);
  });
}

function showAlert(el, type, message) {
  if (!el) return;
  el.hidden = false;
  el.className = `tg-alert ${type}`;
  el.textContent = message;
}

function hideAlert(el) {
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}

function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = busy;
  const text = btn.querySelector(".btn-text");
  if (text && label) text.textContent = label;
}

function showStep(step) {
  authState.step = step;
  if (els["phone-step"]) els["phone-step"].hidden = step !== "phone";
  if (els["code-step"]) els["code-step"].hidden = step !== "code";
  if (els["password-step"]) els["password-step"].hidden = step !== "password";
}

function setLoggedInUI(user) {
  authState.user = user;
  authState.step = "ready";

  if (els["login-panel"]) els["login-panel"].hidden = true;
  if (els["workspace-panel"]) els["workspace-panel"].hidden = false;
  if (els["account-card"]) els["account-card"].hidden = false;

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Telegram User";
  if (els["account-name"]) els["account-name"].textContent = name;
  if (els["account-user"]) {
    els["account-user"].textContent = user?.username ? `@${user.username}` : "No username";
  }
  if (els["account-phone"]) {
    els["account-phone"].textContent = user?.phone ? `+${String(user.phone).replace(/^\+/, "")}` : "—";
  }
  if (els["account-id"]) els["account-id"].textContent = user?.id || "—";
  if (els["status-pill"]) {
    els["status-pill"].textContent = user?.username
      ? `Connected @${user.username}`
      : "Telegram connected";
    els["status-pill"].classList.add("ok");
  }

  setStoredMeta({ user });
}

function setLoggedOutUI() {
  authState = {
    step: "phone",
    phone: "",
    phoneCodeHash: "",
    session: "",
    user: null,
  };
  ownedGroups = [];

  if (els["login-panel"]) els["login-panel"].hidden = false;
  if (els["workspace-panel"]) els["workspace-panel"].hidden = true;
  if (els["account-card"]) els["account-card"].hidden = true;
  showStep("phone");
  hideAlert(els["login-alert"]);
  hideAlert(els["bot-alert"]);

  if (els["status-pill"]) {
    els["status-pill"].textContent = "Not connected";
    els["status-pill"].classList.remove("ok");
  }
  if (els["groups-list"]) els["groups-list"].innerHTML = "";
  if (els["groups-empty"]) {
    els["groups-empty"].hidden = false;
    els["groups-empty"].textContent = "Load owned groups after Telegram login.";
  }
  if (els["groups-count"]) els["groups-count"].textContent = "0";
  if (els["bot-results"]) {
    els["bot-results"].hidden = true;
    els["bot-results"].innerHTML = "";
  }
  if (els["bot-progress"]) els["bot-progress"].hidden = true;
  if (els["phone-input"]) els["phone-input"].value = "";
  if (els["code-input"]) els["code-input"].value = "";
  if (els["password-input"]) els["password-input"].value = "";
}

function ensureEmptyEl() {
  let empty = els["groups-empty"];
  if (empty && empty.isConnected) return empty;
  empty = document.createElement("div");
  empty.className = "tg-empty";
  empty.id = "groups-empty";
  els["groups-empty"] = empty;
  return empty;
}

function renderGroups(groups) {
  ownedGroups = groups || [];
  const list = els["groups-list"];
  if (!list) return;

  list.innerHTML = "";
  if (els["groups-count"]) els["groups-count"].textContent = String(ownedGroups.length);

  if (!ownedGroups.length) {
    const empty = ensureEmptyEl();
    empty.hidden = false;
    empty.textContent = "No owned groups found for this account.";
    list.appendChild(empty);
    return;
  }

  for (const g of ownedGroups) {
    const row = document.createElement("label");
    row.className = "tg-group";
    row.dataset.peerId = g.peerId;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.dataset.peerId = g.peerId;

    const body = document.createElement("div");
    body.className = "tg-group-body";

    const title = document.createElement("div");
    title.className = "tg-group-title";
    title.textContent = g.title || g.peerId;

    const meta = document.createElement("div");
    meta.className = "tg-group-meta";

    const badge = document.createElement("span");
    badge.className = "tg-badge";
    badge.textContent = g.kind || "group";
    meta.appendChild(badge);

    if (g.username) {
      const u = document.createElement("span");
      u.textContent = `@${g.username}`;
      meta.appendChild(u);
    }

    const idSpan = document.createElement("span");
    idSpan.textContent = g.peerId;
    meta.appendChild(idSpan);

    if (g.participantsCount) {
      const pc = document.createElement("span");
      pc.textContent = `${g.participantsCount} members`;
      meta.appendChild(pc);
    }

    body.appendChild(title);
    body.appendChild(meta);
    row.appendChild(cb);
    row.appendChild(body);

    cb.addEventListener("change", () => {
      row.classList.toggle("selected", cb.checked);
    });
    row.classList.add("selected");

    list.appendChild(row);
  }
}

function getSelectedGroups() {
  const boxes = els["groups-list"]?.querySelectorAll('input[type="checkbox"]') || [];
  const selectedIds = new Set();
  boxes.forEach((cb) => {
    if (cb.checked) selectedIds.add(cb.dataset.peerId);
  });
  return ownedGroups.filter((g) => selectedIds.has(g.peerId));
}

function selectFirstN(n) {
  const boxes = [...(els["groups-list"]?.querySelectorAll('input[type="checkbox"]') || [])];
  boxes.forEach((cb, i) => {
    cb.checked = i < n;
    cb.closest(".tg-group")?.classList.toggle("selected", cb.checked);
  });
}

function selectAll(checked) {
  const boxes = els["groups-list"]?.querySelectorAll('input[type="checkbox"]') || [];
  boxes.forEach((cb) => {
    cb.checked = checked;
    cb.closest(".tg-group")?.classList.toggle("selected", checked);
  });
}

/* ── Auth actions ─────────────────────────────────────────── */

async function onSendCode() {
  hideAlert(els["login-alert"]);
  const phone = (els["phone-input"]?.value || "").trim();
  if (!phone) {
    showAlert(els["login-alert"], "error", "Enter your phone number with country code.");
    return;
  }

  setBusy(els["btn-send-code"], true, "Sending…");
  try {
    const data = await sendCode(phone);
    authState.phone = data.phone || phone;
    authState.phoneCodeHash = data.phoneCodeHash;
    authState.session = data.session;
    setStoredSession(data.session);
    showStep("code");
    if (els["code-input"]) {
      els["code-input"].value = "";
      els["code-input"].focus();
    }
    showAlert(
      els["login-alert"],
      "info",
      data.isCodeViaApp
        ? "Code sent to your Telegram app. Enter it below."
        : "Login code sent. Check Telegram / SMS and enter it below."
    );
  } catch (err) {
    showAlert(els["login-alert"], "error", err.message || "Failed to send code");
  } finally {
    setBusy(els["btn-send-code"], false, "Send code");
  }
}

async function onVerifyCode() {
  hideAlert(els["login-alert"]);
  const code = (els["code-input"]?.value || "").trim();
  if (!code) {
    showAlert(els["login-alert"], "error", "Enter the login code.");
    return;
  }

  setBusy(els["btn-verify-code"], true, "Verifying…");
  try {
    const data = await signIn({
      phone: authState.phone,
      code,
      phoneCodeHash: authState.phoneCodeHash,
      session: authState.session || getStoredSession(),
    });

    if (data.needPassword) {
      authState.session = data.session;
      setStoredSession(data.session);
      showStep("password");
      if (els["password-input"]) {
        els["password-input"].value = "";
        els["password-input"].focus();
      }
      showAlert(els["login-alert"], "info", "Two-step verification enabled. Enter your cloud password.");
      return;
    }

    authState.session = data.session;
    setStoredSession(data.session);
    setLoggedInUI(data.user);
    showAlert(els["login-alert"], "success", "Logged in successfully.");
  } catch (err) {
    showAlert(els["login-alert"], "error", err.message || "Sign-in failed");
  } finally {
    setBusy(els["btn-verify-code"], false, "Verify code");
  }
}

async function onVerifyPassword() {
  hideAlert(els["login-alert"]);
  const password = els["password-input"]?.value || "";
  if (!password) {
    showAlert(els["login-alert"], "error", "Enter your 2FA password.");
    return;
  }

  setBusy(els["btn-verify-password"], true, "Checking…");
  try {
    const data = await checkPassword({
      password,
      session: authState.session || getStoredSession(),
    });
    authState.session = data.session;
    setStoredSession(data.session);
    setLoggedInUI(data.user);
    showAlert(els["login-alert"], "success", "Logged in successfully.");
  } catch (err) {
    showAlert(els["login-alert"], "error", err.message || "Password check failed");
  } finally {
    setBusy(els["btn-verify-password"], false, "Confirm password");
  }
}

async function onLogout() {
  setBusy(els["btn-tg-logout"], true, "Logging out…");
  try {
    await logoutMtproto(getStoredSession());
  } finally {
    clearMtprotoStorage();
    setLoggedOutUI();
    setBusy(els["btn-tg-logout"], false, "Disconnect");
  }
}

/* ── Groups + bot ─────────────────────────────────────────── */

async function onLoadGroups() {
  hideAlert(els["bot-alert"]);
  setBusy(els["btn-load-groups"], true, "Loading…");
  try {
    const data = await getOwnedGroups(getStoredSession());
    if (data.session) setStoredSession(data.session);
    renderGroups(data.groups || []);
    showAlert(
      els["bot-alert"],
      "success",
      `Loaded ${data.count || 0} owned group(s). Select up to ${TARGET_GROUPS} for bot add.`
    );
  } catch (err) {
    if (err.status === 401) {
      clearMtprotoStorage();
      setLoggedOutUI();
    }
    showAlert(els["bot-alert"], "error", err.message || "Failed to load groups");
  } finally {
    setBusy(els["btn-load-groups"], false, "Load owned groups");
  }
}

function renderResults(allResults, summary) {
  const box = els["bot-results"];
  if (!box) return;
  box.hidden = false;

  const lines = [
    `<div class="mtp-summary">Done — added/admin: <strong>${summary.added_admin || 0}</strong>, promoted: <strong>${summary.promoted || 0}</strong>, skipped: <strong>${summary.skipped || 0}</strong>, errors: <strong>${summary.error || 0}</strong></div>`,
  ];

  for (const r of allResults) {
    const cls =
      r.status === "error" ? "err" : r.status === "skipped" ? "skip" : "ok";
    lines.push(
      `<div class="mtp-result-row ${cls}"><span class="mtp-r-status">${r.status}</span><span class="mtp-r-title">${escapeHtml(
        r.title || r.peerId
      )}</span><span class="mtp-r-detail">${escapeHtml(r.detail || "")}</span></div>`
    );
  }
  box.innerHTML = lines.join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function onAddBot() {
  hideAlert(els["bot-alert"]);
  const botUsername = (els["bot-username"]?.value || "").trim().replace(/^@/, "");
  if (!botUsername) {
    showAlert(els["bot-alert"], "error", "Enter the bot username (from @BotFather).");
    return;
  }

  let selected = getSelectedGroups();
  if (!selected.length) {
    showAlert(els["bot-alert"], "error", "Select at least one owned group (or Load groups first).");
    return;
  }

  if (selected.length > TARGET_GROUPS) {
    selected = selected.slice(0, TARGET_GROUPS);
  }

  const chunks = chunkArray(selected, BATCH_SIZE);
  const allResults = [];
  const summary = { added_admin: 0, promoted: 0, skipped: 0, error: 0, total: 0 };

  if (els["bot-progress"]) els["bot-progress"].hidden = false;
  if (els["bot-results"]) {
    els["bot-results"].hidden = true;
    els["bot-results"].innerHTML = "";
  }

  setBusy(els["btn-add-bot"], true, "Adding…");
  els["btn-load-groups"] && (els["btn-load-groups"].disabled = true);

  let done = 0;
  const total = selected.length;

  try {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (els["bot-progress-label"]) {
        els["bot-progress-label"].textContent = `Processing batch ${i + 1}/${chunks.length} (${done}/${total})…`;
      }
      if (els["bot-progress-bar"]) {
        els["bot-progress-bar"].style.width = `${Math.round((done / total) * 100)}%`;
      }

      const data = await addBotToGroups({
        botUsername,
        groups: chunk,
        session: getStoredSession(),
      });

      if (data.session) setStoredSession(data.session);

      const results = data.results || [];
      allResults.push(...results);
      for (const r of results) {
        summary.total++;
        if (r.status === "added_admin") summary.added_admin++;
        else if (r.status === "promoted") summary.promoted++;
        else if (r.status === "skipped") summary.skipped++;
        else if (r.status === "error") summary.error++;
      }

      done += chunk.length;
      if (els["bot-progress-bar"]) {
        els["bot-progress-bar"].style.width = `${Math.round((done / total) * 100)}%`;
      }
      if (els["bot-progress-label"]) {
        els["bot-progress-label"].textContent = `Processed ${done}/${total} groups…`;
      }
    }

    renderResults(allResults, summary);
    showAlert(
      els["bot-alert"],
      summary.error && !summary.added_admin && !summary.promoted && !summary.skipped
        ? "error"
        : "success",
      `Finished for @${botUsername}: ${summary.added_admin} added+admin, ${summary.promoted} promoted, ${summary.skipped} skipped, ${summary.error} errors.`
    );
  } catch (err) {
    if (err.status === 401) {
      clearMtprotoStorage();
      setLoggedOutUI();
    }
    showAlert(els["bot-alert"], "error", err.message || "Bot add failed");
    if (allResults.length) renderResults(allResults, summary);
  } finally {
    setBusy(els["btn-add-bot"], false, "Add bot to 100 groups (1 click)");
    if (els["btn-load-groups"]) els["btn-load-groups"].disabled = false;
    if (els["bot-progress-label"]) {
      els["bot-progress-label"].textContent = `Done ${done}/${total}`;
    }
  }
}

/* ── Bootstrap ────────────────────────────────────────────── */

function wireEvents() {
  els["btn-send-code"]?.addEventListener("click", onSendCode);
  els["btn-verify-code"]?.addEventListener("click", onVerifyCode);
  els["btn-verify-password"]?.addEventListener("click", onVerifyPassword);
  els["btn-resend-code"]?.addEventListener("click", onSendCode);
  els["btn-back-phone"]?.addEventListener("click", () => {
    showStep("phone");
    hideAlert(els["login-alert"]);
  });
  els["btn-back-code"]?.addEventListener("click", () => {
    showStep("code");
    hideAlert(els["login-alert"]);
  });
  els["btn-tg-logout"]?.addEventListener("click", onLogout);
  els["btn-load-groups"]?.addEventListener("click", onLoadGroups);
  els["btn-select-all"]?.addEventListener("click", () => selectAll(true));
  els["btn-select-100"]?.addEventListener("click", () => selectFirstN(TARGET_GROUPS));
  els["btn-add-bot"]?.addEventListener("click", onAddBot);

  els["phone-input"]?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onSendCode();
  });
  els["code-input"]?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onVerifyCode();
  });
  els["password-input"]?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onVerifyPassword();
  });
}

async function tryRestoreSession() {
  const session = getStoredSession();
  if (!session) {
    setLoggedOutUI();
    return;
  }

  const meta = getStoredMeta();
  if (meta?.user) {
    // optimistic UI while verifying
    setLoggedInUI(meta.user);
  }

  try {
    const data = await getMe(session);
    if (data.session) setStoredSession(data.session);
    setLoggedInUI(data.user);
  } catch {
    clearMtprotoStorage();
    setLoggedOutUI();
  }
}

initProtectedPage(async () => {
  cacheEls();
  wireEvents();
  await tryRestoreSession();
});
