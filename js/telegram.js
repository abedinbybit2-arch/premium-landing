/**
 * AndroGRAM — Telegram Automation page controller
 * Live group track (1s) + Firebase bot-scoped group registry
 */
import { initProtectedPage } from "./app-shell.js";
import {
  getMe,
  pollUpdates,
  getChat,
  sendMessage,
  sendPhoto,
  fileToDataUrl,
} from "./telegram-api.js";
import {
  saveBot,
  getBot,
  listBots,
  listGroups,
  saveGroups,
  saveGroupsFast,
  getActiveBotId,
  setActiveBot,
  countGroups,
  migrateUserGroupsToGlobal,
} from "./telegram-store.js";

const LIVE_INTERVAL_MS = 1000;

let currentUser = null;
let activeBot = null;
let groups = [];
let groupMap = new Map(); // chatId -> group
let photoDataUrl = null;
let photoName = null;

let liveTimer = null;
let liveBusy = false;
let updatesOffset = 0;
let livePulse = 0;
let lastLiveOkAt = 0;

const els = {};

function $(id) {
  return document.getElementById(id);
}

function cacheEls() {
  [
    "bot-token",
    "btn-connect",
    "setup-alert",
    "bot-info-card",
    "bot-display-name",
    "bot-display-user",
    "bot-display-id",
    "bot-status-pill",
    "saved-bots-wrap",
    "saved-bots",
    "groups-list",
    "groups-empty",
    "btn-refresh-groups",
    "btn-select-all",
    "manual-chat-id",
    "btn-add-chat",
    "msg-text",
    "msg-photo",
    "photo-preview",
    "photo-preview-img",
    "btn-clear-photo",
    "btn-send-selected",
    "btn-send-all",
    "send-alert",
    "send-progress",
    "send-progress-bar",
    "send-progress-label",
    "firebase-count",
    "live-status",
    "live-dot",
    "live-meta",
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
  const text = btn.querySelector(".btn-text") || btn;
  if (busy) {
    btn.dataset.prev = text.textContent;
    text.textContent = label || "Working…";
  } else if (btn.dataset.prev) {
    text.textContent = btn.dataset.prev;
    delete btn.dataset.prev;
  }
}

function setComposerEnabled(on) {
  [
    "msg-text",
    "msg-photo",
    "btn-send-selected",
    "btn-send-all",
    "btn-refresh-groups",
    "btn-select-all",
    "manual-chat-id",
    "btn-add-chat",
  ].forEach((id) => {
    if (els[id]) els[id].disabled = !on;
  });
}

function updateBotCard(bot) {
  if (!bot) {
    if (els["bot-info-card"]) els["bot-info-card"].hidden = true;
    if (els["bot-status-pill"]) els["bot-status-pill"].textContent = "No bot connected";
    return;
  }
  if (els["bot-info-card"]) els["bot-info-card"].hidden = false;
  if (els["bot-display-name"]) {
    els["bot-display-name"].textContent = bot.firstName || bot.first_name || "Bot";
  }
  if (els["bot-display-user"]) {
    els["bot-display-user"].textContent = bot.username ? `@${bot.username}` : "—";
  }
  if (els["bot-display-id"]) {
    els["bot-display-id"].textContent = bot.id || bot.botId || "—";
  }
  if (els["bot-status-pill"]) {
    els["bot-status-pill"].textContent = bot.username
      ? `@${bot.username} connected`
      : "Bot connected";
  }
}

function updateFirebaseCount(n) {
  if (els["firebase-count"]) {
    els["firebase-count"].textContent = String(n);
  }
}

function updateLiveUi(state, detail) {
  if (els["live-status"]) {
    els["live-status"].dataset.state = state || "off";
  }
  if (els["live-dot"]) {
    els["live-dot"].dataset.state = state || "off";
  }
  if (els["live-meta"]) {
    els["live-meta"].textContent = detail || "Live track off";
  }
}

function syncGroupMap(list) {
  groupMap = new Map();
  for (const g of list || []) {
    const id = String(g.chatId || g.id);
    groupMap.set(id, {
      id,
      chatId: id,
      title: g.title || `Chat ${id}`,
      type: g.type || "group",
      username: g.username || null,
    });
  }
  groups = Array.from(groupMap.values()).sort((a, b) =>
    String(a.title).localeCompare(String(b.title))
  );
}

function mergeGroupsLocal(incoming) {
  let added = 0;
  for (const g of incoming || []) {
    const id = String(g.chatId || g.id);
    if (!id) continue;
    if (!groupMap.has(id)) added += 1;
    groupMap.set(id, {
      id,
      chatId: id,
      title: g.title || groupMap.get(id)?.title || `Chat ${id}`,
      type: g.type || groupMap.get(id)?.type || "group",
      username: g.username ?? groupMap.get(id)?.username ?? null,
    });
  }
  groups = Array.from(groupMap.values()).sort((a, b) =>
    String(a.title).localeCompare(String(b.title))
  );
  return added;
}

function renderSavedBots(bots, activeId) {
  const wrap = els["saved-bots-wrap"];
  const box = els["saved-bots"];
  if (!wrap || !box) return;
  if (!bots.length) {
    wrap.hidden = true;
    box.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  box.innerHTML = "";
  bots.forEach((b) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tg-chip" + (String(b.id) === String(activeId) ? " active" : "");
    chip.textContent = b.username ? `@${b.username}` : `Bot ${b.id}`;
    chip.title = `Switch to this bot (ID ${b.id})`;
    chip.addEventListener("click", () => switchBot(b.id));
    box.appendChild(chip);
  });
}

function renderGroups() {
  const list = els["groups-list"];
  if (!list) return;

  const selected = new Set(
    Array.from(document.querySelectorAll(".group-check:checked")).map((el) => el.value)
  );

  list.innerHTML = "";

  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "tg-empty";
    empty.id = "groups-empty";
    empty.textContent = activeBot
      ? "No groups in Firebase yet. Add the bot to groups — live track will auto-save every 1s."
      : "Connect a bot to load groups.";
    list.appendChild(empty);
    updateFirebaseCount(0);
    return;
  }

  updateFirebaseCount(groups.length);

  groups.forEach((g) => {
    const id = String(g.chatId || g.id);
    const row = document.createElement("label");
    row.className = "tg-group";
    row.dataset.chatId = id;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = id;
    cb.className = "group-check";
    if (selected.has(id)) {
      cb.checked = true;
      row.classList.add("selected");
    }
    cb.addEventListener("change", () => {
      row.classList.toggle("selected", cb.checked);
    });

    const body = document.createElement("div");
    body.className = "tg-group-body";
    body.innerHTML = `
      <div class="tg-group-title"></div>
      <div class="tg-group-meta">
        <span class="tg-badge"></span>
        <span class="chat-id"></span>
        <span class="chat-user"></span>
      </div>
    `;
    body.querySelector(".tg-group-title").textContent = g.title || "Untitled";
    body.querySelector(".tg-badge").textContent = g.type || "group";
    body.querySelector(".chat-id").textContent = `ID ${id}`;
    body.querySelector(".chat-user").textContent = g.username ? `@${g.username}` : "";

    row.appendChild(cb);
    row.appendChild(body);
    list.appendChild(row);
  });
}

function selectedChatIds() {
  return Array.from(document.querySelectorAll(".group-check:checked")).map((el) => el.value);
}

/* ── Live track (1 second) ───────────────────────────────── */

function stopLiveTrack() {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
  liveBusy = false;
  updatesOffset = 0;
  updateLiveUi("off", "Live track off");
}

function startLiveTrack() {
  stopLiveTrack();
  if (!activeBot?.token) return;
  updateLiveUi("on", "Live track · every 1s · waiting…");
  liveTimer = setInterval(() => {
    liveTick().catch(() => {});
  }, LIVE_INTERVAL_MS);
  // immediate first tick
  liveTick().catch(() => {});
}

async function liveTick() {
  if (!activeBot?.token || liveBusy) return;
  liveBusy = true;
  livePulse += 1;
  try {
    const { groups: found, nextOffset } = await pollUpdates(activeBot.token, {
      offset: updatesOffset || undefined,
    });

    if (nextOffset) updatesOffset = nextOffset;

    let newCount = 0;
    if (found.length) {
      // Only persist groups we didn't already know (still merge titles for known)
      const fresh = found.filter((g) => !groupMap.has(String(g.id || g.chatId)));
      await saveGroupsFast(activeBot.id, found);
      newCount = mergeGroupsLocal(found);
      if (newCount > 0) {
        renderGroups();
      } else {
        updateFirebaseCount(groups.length);
      }
    }

    lastLiveOkAt = Date.now();
    const detail =
      newCount > 0
        ? `Live · +${newCount} new group(s) auto-saved · Firebase ${groups.length}`
        : `Live · 1s refresh · Firebase ${groups.length} group(s) · #${livePulse}`;
    updateLiveUi("on", detail);
  } catch (err) {
    updateLiveUi("warn", `Live track: ${err.message || "error"} — retrying…`);
  } finally {
    liveBusy = false;
  }
}

async function loadGroupsFromFirebase(botId) {
  const list = await listGroups(botId);
  syncGroupMap(list);
  renderGroups();
  return list.length;
}

async function loadAccountState() {
  const bots = await listBots(currentUser.uid);
  let activeId = await getActiveBotId(currentUser.uid);

  if (!activeId && bots.length) {
    activeId = bots[0].id;
    await setActiveBot(currentUser.uid, activeId);
  }

  renderSavedBots(bots, activeId);

  if (activeId) {
    const bot = await getBot(currentUser.uid, activeId);
    if (bot?.token) {
      activeBot = {
        id: bot.botId || bot.id,
        token: bot.token,
        username: bot.username,
        firstName: bot.firstName || bot.first_name,
      };
      if (els["bot-token"]) els["bot-token"].value = bot.token;
      updateBotCard(activeBot);
      setComposerEnabled(true);

      // Migrate legacy per-user groups → global bot registry
      await migrateUserGroupsToGlobal(currentUser.uid, activeBot.id);
      await loadGroupsFromFirebase(activeBot.id);
      startLiveTrack();
      return;
    }
  }

  activeBot = null;
  syncGroupMap([]);
  updateBotCard(null);
  setComposerEnabled(false);
  renderGroups();
  stopLiveTrack();
}

async function switchBot(botId) {
  const bot = await getBot(currentUser.uid, botId);
  if (!bot?.token) return;
  await setActiveBot(currentUser.uid, botId);
  activeBot = {
    id: bot.botId || bot.id,
    token: bot.token,
    username: bot.username,
    firstName: bot.firstName,
  };
  if (els["bot-token"]) els["bot-token"].value = bot.token;
  updateBotCard(activeBot);
  setComposerEnabled(true);
  await migrateUserGroupsToGlobal(currentUser.uid, activeBot.id);
  const n = await loadGroupsFromFirebase(activeBot.id);
  startLiveTrack();
  const bots = await listBots(currentUser.uid);
  renderSavedBots(bots, activeBot.id);
  hideAlert(els["setup-alert"]);
  showAlert(
    els["setup-alert"],
    "info",
    `Switched to @${bot.username || bot.id}. Loaded ${n} group(s) from Firebase for this bot.`
  );
}

async function connectBot() {
  hideAlert(els["setup-alert"]);
  const token = (els["bot-token"]?.value || "").trim();
  if (!token) {
    showAlert(els["setup-alert"], "error", "Enter a bot token first.");
    return;
  }

  setBusy(els["btn-connect"], true, "Connecting…");
  try {
    const me = await getMe(token);
    const botId = String(me.id);

    await saveBot(currentUser.uid, {
      id: botId,
      token,
      username: me.username,
      first_name: me.first_name,
      can_join_groups: me.can_join_groups,
      can_read_all_group_messages: me.can_read_all_group_messages,
    });

    activeBot = {
      id: botId,
      token,
      username: me.username,
      firstName: me.first_name,
    };
    updateBotCard(activeBot);
    setComposerEnabled(true);

    // Load ALL groups already saved in Firebase for this bot (any previous account)
    await migrateUserGroupsToGlobal(currentUser.uid, botId);
    let n = await loadGroupsFromFirebase(botId);

    // One-shot discover + save, then start live track
    try {
      const { groups: found, nextOffset } = await pollUpdates(token, {});
      if (nextOffset) updatesOffset = nextOffset;
      if (found.length) {
        await saveGroupsFast(botId, found);
        mergeGroupsLocal(found);
        renderGroups();
        n = groups.length;
      }
    } catch (e) {
      console.warn("discover", e);
    }

    startLiveTrack();

    const bots = await listBots(currentUser.uid);
    renderSavedBots(bots, botId);

    const totalFb = await countGroups(botId);
    showAlert(
      els["setup-alert"],
      "success",
      `Connected @${me.username || me.id}. Firebase has ${totalFb} group(s) for this bot. Live track ON (every 1s) — new groups auto-save.`
    );
  } catch (err) {
    console.error(err);
    showAlert(
      els["setup-alert"],
      "error",
      err.message || "Could not connect. Check the token and try again."
    );
  } finally {
    setBusy(els["btn-connect"], false);
  }
}

async function refreshGroups() {
  if (!activeBot?.token) return;
  hideAlert(els["setup-alert"]);
  setBusy(els["btn-refresh-groups"], true, "Refreshing…");
  try {
    const { groups: found, nextOffset } = await pollUpdates(activeBot.token, {
      offset: updatesOffset || undefined,
    });
    if (nextOffset) updatesOffset = nextOffset;
    if (found.length) {
      await saveGroupsFast(activeBot.id, found);
      mergeGroupsLocal(found);
    }
    // Always re-sync list from Firebase
    await loadGroupsFromFirebase(activeBot.id);
    showAlert(
      els["setup-alert"],
      found.length ? "success" : "info",
      found.length
        ? `Found ${found.length} chat(s) from Telegram — saved to Firebase. Total: ${groups.length}.`
        : `Firebase still has ${groups.length} group(s). Live track keeps watching every 1s.`
    );
  } catch (err) {
    showAlert(els["setup-alert"], "error", err.message || "Refresh failed");
  } finally {
    setBusy(els["btn-refresh-groups"], false);
  }
}

async function addManualChat() {
  if (!activeBot?.token) return;
  const chatId = (els["manual-chat-id"]?.value || "").trim();
  if (!chatId) {
    showAlert(els["setup-alert"], "error", "Enter a chat ID.");
    return;
  }

  setBusy(els["btn-add-chat"], true, "Adding…");
  try {
    const chat = await getChat(activeBot.token, chatId);
    const g = {
      id: String(chat.id),
      chatId: String(chat.id),
      title: chat.title || chat.username || `Chat ${chat.id}`,
      type: chat.type || "group",
      username: chat.username || null,
    };
    await saveGroups(activeBot.id, [g]);
    mergeGroupsLocal([g]);
    renderGroups();
    if (els["manual-chat-id"]) els["manual-chat-id"].value = "";
    showAlert(els["setup-alert"], "success", `Saved “${g.title}” to Firebase for this bot.`);
  } catch (err) {
    showAlert(
      els["setup-alert"],
      "error",
      err.message || "Could not add chat. Is the bot a member of that group?"
    );
  } finally {
    setBusy(els["btn-add-chat"], false);
  }
}

function toggleSelectAll() {
  const checks = document.querySelectorAll(".group-check");
  if (!checks.length) return;
  const allOn = Array.from(checks).every((c) => c.checked);
  checks.forEach((c) => {
    c.checked = !allOn;
    c.closest(".tg-group")?.classList.toggle("selected", c.checked);
  });
}

async function sendToChats(chatIds) {
  hideAlert(els["send-alert"]);
  if (!activeBot?.token) {
    showAlert(els["send-alert"], "error", "Connect a bot first.");
    return;
  }
  if (!chatIds.length) {
    showAlert(els["send-alert"], "error", "Select at least one group.");
    return;
  }

  const text = (els["msg-text"]?.value || "").trim();
  if (!text && !photoDataUrl) {
    showAlert(els["send-alert"], "error", "Write a message or attach a photo.");
    return;
  }

  if (els["btn-send-selected"]) els["btn-send-selected"].disabled = true;
  if (els["btn-send-all"]) els["btn-send-all"].disabled = true;
  if (els["send-progress"]) els["send-progress"].hidden = false;

  let ok = 0;
  let fail = 0;
  const errors = [];

  for (let i = 0; i < chatIds.length; i++) {
    const chatId = chatIds[i];
    const pct = Math.round(((i + 1) / chatIds.length) * 100);
    if (els["send-progress-bar"]) els["send-progress-bar"].style.width = pct + "%";
    if (els["send-progress-label"]) {
      els["send-progress-label"].textContent = `Sending ${i + 1} / ${chatIds.length}…`;
    }

    try {
      if (photoDataUrl) {
        await sendPhoto(activeBot.token, chatId, {
          caption: text || undefined,
          photoBase64: photoDataUrl,
          filename: photoName || "photo.jpg",
        });
      } else {
        await sendMessage(activeBot.token, chatId, text);
      }
      ok += 1;
    } catch (err) {
      fail += 1;
      errors.push(`${chatId}: ${err.message}`);
    }

    await new Promise((r) => setTimeout(r, 350));
  }

  if (els["send-progress"]) els["send-progress"].hidden = true;
  if (els["btn-send-selected"]) els["btn-send-selected"].disabled = false;
  if (els["btn-send-all"]) els["btn-send-all"].disabled = false;

  if (fail === 0) {
    showAlert(els["send-alert"], "success", `Sent successfully to ${ok} group(s).`);
  } else {
    showAlert(
      els["send-alert"],
      "error",
      `Done: ${ok} ok, ${fail} failed. ${errors.slice(0, 3).join(" · ")}`
    );
  }
}

function wirePhoto() {
  els["msg-photo"]?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4.5 * 1024 * 1024) {
      showAlert(els["send-alert"], "error", "Photo must be under ~4.5 MB.");
      e.target.value = "";
      return;
    }
    photoDataUrl = await fileToDataUrl(file);
    photoName = file.name || "photo.jpg";
    if (els["photo-preview"]) els["photo-preview"].hidden = false;
    if (els["photo-preview-img"]) els["photo-preview-img"].src = photoDataUrl;
  });

  els["btn-clear-photo"]?.addEventListener("click", () => {
    photoDataUrl = null;
    photoName = null;
    if (els["msg-photo"]) els["msg-photo"].value = "";
    if (els["photo-preview"]) els["photo-preview"].hidden = true;
    if (els["photo-preview-img"]) els["photo-preview-img"].src = "";
  });
}

function wireEvents() {
  els["btn-connect"]?.addEventListener("click", connectBot);
  els["btn-refresh-groups"]?.addEventListener("click", refreshGroups);
  els["btn-add-chat"]?.addEventListener("click", addManualChat);
  els["btn-select-all"]?.addEventListener("click", toggleSelectAll);
  els["btn-send-selected"]?.addEventListener("click", () => sendToChats(selectedChatIds()));
  els["btn-send-all"]?.addEventListener("click", () =>
    sendToChats(groups.map((g) => String(g.chatId || g.id)))
  );
  wirePhoto();

  els["bot-token"]?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") connectBot();
  });

  window.addEventListener("beforeunload", () => stopLiveTrack());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (activeBot?.token && !liveTimer) startLiveTrack();
  });
}

initProtectedPage(async (user) => {
  currentUser = user;
  cacheEls();
  wireEvents();
  setComposerEnabled(false);
  updateLiveUi("off", "Connect a bot to start live track");
  try {
    await loadAccountState();
  } catch (err) {
    console.error(err);
    showAlert(
      els["setup-alert"],
      "error",
      "Could not load saved bots from Firebase. Check Firestore rules / network."
    );
  }
});
