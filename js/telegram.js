/**
 * AndroGRAM — Telegram Automation page controller
 */
import { initProtectedPage } from "./app-shell.js";
import {
  getMe,
  discoverGroups,
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
  getActiveBotId,
  setActiveBot,
} from "./telegram-store.js";

let currentUser = null;
let activeBot = null; // { id, token, username, firstName, ... }
let groups = []; // current bot groups
let photoDataUrl = null;
let photoName = null;

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
  const ids = [
    "msg-text",
    "msg-photo",
    "btn-send-selected",
    "btn-send-all",
    "btn-refresh-groups",
    "btn-select-all",
    "manual-chat-id",
    "btn-add-chat",
  ];
  ids.forEach((id) => {
    if (els[id]) els[id].disabled = !on;
  });
}

function updateBotCard(bot) {
  if (!bot) {
    els["bot-info-card"].hidden = true;
    els["bot-status-pill"].textContent = "No bot connected";
    return;
  }
  els["bot-info-card"].hidden = false;
  els["bot-display-name"].textContent = bot.firstName || bot.first_name || "Bot";
  els["bot-display-user"].textContent = bot.username ? `@${bot.username}` : "—";
  els["bot-display-id"].textContent = bot.id || bot.botId || "—";
  els["bot-status-pill"].textContent = bot.username
    ? `@${bot.username} connected`
    : "Bot connected";
}

function renderSavedBots(bots, activeId) {
  const wrap = els["saved-bots-wrap"];
  const box = els["saved-bots"];
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
  list.innerHTML = "";

  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "tg-empty";
    empty.id = "groups-empty";
    empty.textContent = activeBot
      ? "No groups found for this bot yet. Add the bot to groups, send a message there, then refresh — or add a chat ID manually."
      : "Connect a bot to load groups.";
    list.appendChild(empty);
    return;
  }

  groups.forEach((g) => {
    const row = document.createElement("label");
    row.className = "tg-group";
    row.dataset.chatId = String(g.chatId || g.id);

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(g.chatId || g.id);
    cb.className = "group-check";
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
    body.querySelector(".chat-id").textContent = `ID ${g.chatId || g.id}`;
    body.querySelector(".chat-user").textContent = g.username ? `@${g.username}` : "";

    row.appendChild(cb);
    row.appendChild(body);
    list.appendChild(row);
  });
}

function selectedChatIds() {
  return Array.from(document.querySelectorAll(".group-check:checked")).map((el) => el.value);
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
      els["bot-token"].value = bot.token;
      updateBotCard(activeBot);
      setComposerEnabled(true);
      groups = await listGroups(currentUser.uid, activeBot.id);
      renderGroups();
      return;
    }
  }

  activeBot = null;
  groups = [];
  updateBotCard(null);
  setComposerEnabled(false);
  renderGroups();
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
  els["bot-token"].value = bot.token;
  updateBotCard(activeBot);
  setComposerEnabled(true);
  groups = await listGroups(currentUser.uid, activeBot.id);
  renderGroups();
  const bots = await listBots(currentUser.uid);
  renderSavedBots(bots, activeBot.id);
  hideAlert(els["setup-alert"]);
  showAlert(
    els["setup-alert"],
    "info",
    `Switched to @${bot.username || bot.id}. Showing only this bot’s groups.`
  );
}

async function connectBot() {
  hideAlert(els["setup-alert"]);
  const token = els["bot-token"].value.trim();
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

    // Discover groups from Telegram updates + merge with saved
    let discovered = [];
    try {
      discovered = await discoverGroups(token);
    } catch (e) {
      console.warn("discoverGroups", e);
    }

    const existing = await listGroups(currentUser.uid, botId);
    const mergedMap = new Map();
    existing.forEach((g) => mergedMap.set(String(g.chatId || g.id), g));
    discovered.forEach((g) => {
      mergedMap.set(String(g.id), {
        id: String(g.id),
        chatId: String(g.id),
        title: g.title,
        type: g.type,
        username: g.username,
      });
    });

    const merged = Array.from(mergedMap.values());
    if (discovered.length) {
      await saveGroups(currentUser.uid, botId, discovered);
    }

    groups = await listGroups(currentUser.uid, botId);
    if (!groups.length && merged.length) {
      groups = merged;
    }
    renderGroups();

    const bots = await listBots(currentUser.uid);
    renderSavedBots(bots, botId);

    showAlert(
      els["setup-alert"],
      "success",
      `Connected @${me.username || me.id}. ${groups.length} group(s) loaded for this bot and saved to your account.`
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
    const discovered = await discoverGroups(activeBot.token);
    if (discovered.length) {
      await saveGroups(currentUser.uid, activeBot.id, discovered);
    }
    groups = await listGroups(currentUser.uid, activeBot.id);
    renderGroups();
    showAlert(
      els["setup-alert"],
      discovered.length ? "success" : "info",
      discovered.length
        ? `Found ${discovered.length} chat(s) from Telegram updates and saved them.`
        : "No new groups in recent updates. Add the bot to a group and send a message, or add chat ID manually."
    );
  } catch (err) {
    showAlert(els["setup-alert"], "error", err.message || "Refresh failed");
  } finally {
    setBusy(els["btn-refresh-groups"], false);
  }
}

async function addManualChat() {
  if (!activeBot?.token) return;
  const chatId = els["manual-chat-id"].value.trim();
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
    await saveGroups(currentUser.uid, activeBot.id, [g]);
    groups = await listGroups(currentUser.uid, activeBot.id);
    renderGroups();
    els["manual-chat-id"].value = "";
    showAlert(els["setup-alert"], "success", `Added “${g.title}” for this bot.`);
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

  const text = els["msg-text"].value.trim();
  if (!text && !photoDataUrl) {
    showAlert(els["send-alert"], "error", "Write a message or attach a photo.");
    return;
  }

  els["btn-send-selected"].disabled = true;
  els["btn-send-all"].disabled = true;
  els["send-progress"].hidden = false;

  let ok = 0;
  let fail = 0;
  const errors = [];

  for (let i = 0; i < chatIds.length; i++) {
    const chatId = chatIds[i];
    const pct = Math.round(((i + 1) / chatIds.length) * 100);
    if (els["send-progress-bar"]) els["send-progress-bar"].style.width = pct + "%";
    els["send-progress-label"].textContent = `Sending ${i + 1} / ${chatIds.length}…`;

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

    // mild rate-limit cushion
    await new Promise((r) => setTimeout(r, 350));
  }

  els["send-progress"].hidden = true;
  els["btn-send-selected"].disabled = false;
  els["btn-send-all"].disabled = false;

  if (fail === 0) {
    showAlert(
      els["send-alert"],
      "success",
      `Sent successfully to ${ok} group(s).`
    );
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
    els["photo-preview"].hidden = false;
    els["photo-preview-img"].src = photoDataUrl;
  });

  els["btn-clear-photo"]?.addEventListener("click", () => {
    photoDataUrl = null;
    photoName = null;
    els["msg-photo"].value = "";
    els["photo-preview"].hidden = true;
    els["photo-preview-img"].src = "";
  });
}

function wireEvents() {
  els["btn-connect"]?.addEventListener("click", connectBot);
  els["btn-refresh-groups"]?.addEventListener("click", refreshGroups);
  els["btn-add-chat"]?.addEventListener("click", addManualChat);
  els["btn-select-all"]?.addEventListener("click", toggleSelectAll);
  els["btn-send-selected"]?.addEventListener("click", () =>
    sendToChats(selectedChatIds())
  );
  els["btn-send-all"]?.addEventListener("click", () =>
    sendToChats(groups.map((g) => String(g.chatId || g.id)))
  );
  wirePhoto();

  els["bot-token"]?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") connectBot();
  });
}

initProtectedPage(async (user) => {
  currentUser = user;
  cacheEls();
  wireEvents();
  setComposerEnabled(false);
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
