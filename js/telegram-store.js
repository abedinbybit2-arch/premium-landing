/**
 * AndroGRAM — Firestore helpers for Telegram Automation
 *
 * Global (shared by bot token / botId — any AndroGRAM account loading same token gets all groups):
 *   bots/{botId}
 *   bots/{botId}/groups/{chatId}
 *
 * Per-user connection:
 *   users/{uid}/telegramBots/{botId}
 *   users/{uid}.activeTelegramBotId
 */
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

export function userRef(uid) {
  return doc(db, "users", uid);
}

export function userBotRef(uid, botId) {
  return doc(db, "users", uid, "telegramBots", String(botId));
}

export function globalBotRef(botId) {
  return doc(db, "bots", String(botId));
}

export function globalGroupsCol(botId) {
  return collection(db, "bots", String(botId), "groups");
}

export function globalGroupRef(botId, chatId) {
  return doc(db, "bots", String(botId), "groups", String(chatId));
}

/**
 * Save bot under global + user scopes (token bound to botId).
 */
export async function saveBot(uid, bot) {
  const id = String(bot.id);
  const payload = {
    botId: id,
    token: bot.token,
    username: bot.username || "",
    firstName: bot.first_name || bot.firstName || "",
    canJoinGroups: !!bot.can_join_groups,
    canReadAllGroupMessages: !!bot.can_read_all_group_messages,
    updatedAt: serverTimestamp(),
  };

  await setDoc(
    globalBotRef(id),
    {
      ...payload,
      connectedAt: bot.connectedAt || serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    userBotRef(uid, id),
    {
      ...payload,
      connectedAt: bot.connectedAt || serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    userRef(uid),
    {
      activeTelegramBotId: id,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return id;
}

export async function getActiveBotId(uid) {
  const snap = await getDoc(userRef(uid));
  if (!snap.exists()) return null;
  return snap.data().activeTelegramBotId || null;
}

export async function getBot(uid, botId) {
  if (!botId) return null;
  // Prefer user doc, fall back to global
  const userSnap = await getDoc(userBotRef(uid, botId));
  if (userSnap.exists()) return { id: userSnap.id, ...userSnap.data() };
  const globalSnap = await getDoc(globalBotRef(botId));
  if (globalSnap.exists()) return { id: globalSnap.id, ...globalSnap.data() };
  return null;
}

export async function getGlobalBot(botId) {
  if (!botId) return null;
  const snap = await getDoc(globalBotRef(botId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listBots(uid) {
  const snap = await getDocs(collection(db, "users", uid, "telegramBots"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Upsert groups for a bot globally (shared across all AndroGRAM accounts using this bot).
 * Returns { saved, newCount, totalKnown }.
 */
export async function saveGroups(botId, groups) {
  const bid = String(botId);
  const list = Array.isArray(groups) ? groups : [];
  if (!list.length) return { saved: 0, newCount: 0 };

  let saved = 0;
  let newCount = 0;
  let batch = writeBatch(db);
  let n = 0;

  for (const g of list) {
    const chatId = String(g.id ?? g.chatId ?? "");
    if (!chatId) continue;

    const ref = globalGroupRef(bid, chatId);
    const existing = await getDoc(ref);
    const isNew = !existing.exists();

    batch.set(
      ref,
      {
        chatId,
        title: g.title || g.username || `Chat ${chatId}`,
        type: g.type || "group",
        username: g.username || null,
        botId: bid,
        updatedAt: serverTimestamp(),
        ...(isNew ? { firstSeenAt: serverTimestamp() } : {}),
      },
      { merge: true }
    );
    saved += 1;
    if (isNew) newCount += 1;
    n += 1;

    if (n >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      n = 0;
    }
  }

  if (n > 0) await batch.commit();

  if (saved > 0) {
    await setDoc(
      globalBotRef(bid),
      {
        lastGroupSyncAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  return { saved, newCount };
}

/**
 * Fast upsert without per-doc getDoc (for live track). Always merge.
 * Returns number of groups written.
 */
export async function saveGroupsFast(botId, groups) {
  const bid = String(botId);
  const list = Array.isArray(groups) ? groups : [];
  if (!list.length) return 0;

  let batch = writeBatch(db);
  let n = 0;
  let saved = 0;

  for (const g of list) {
    const chatId = String(g.id ?? g.chatId ?? "");
    if (!chatId) continue;
    batch.set(
      globalGroupRef(bid, chatId),
      {
        chatId,
        title: g.title || g.username || `Chat ${chatId}`,
        type: g.type || "group",
        username: g.username || null,
        botId: bid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    saved += 1;
    n += 1;
    if (n >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      n = 0;
    }
  }
  if (n > 0) await batch.commit();

  if (saved > 0) {
    await setDoc(
      globalBotRef(bid),
      { lastGroupSyncAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  return saved;
}

export async function listGroups(botId) {
  if (!botId) return [];
  const snap = await getDocs(globalGroupsCol(botId));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
}

export async function countGroups(botId) {
  if (!botId) return 0;
  const snap = await getDocs(globalGroupsCol(botId));
  return snap.size;
}

export async function deleteGroup(botId, chatId) {
  await deleteDoc(globalGroupRef(botId, chatId));
}

export async function setActiveBot(uid, botId) {
  await setDoc(
    userRef(uid),
    { activeTelegramBotId: String(botId), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * Migrate legacy per-user groups into global bots/{botId}/groups once.
 */
export async function migrateUserGroupsToGlobal(uid, botId) {
  try {
    const legacy = collection(db, "users", uid, "telegramBots", String(botId), "groups");
    const snap = await getDocs(legacy);
    if (snap.empty) return 0;
    const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await saveGroupsFast(botId, groups);
    return groups.length;
  } catch {
    return 0;
  }
}
