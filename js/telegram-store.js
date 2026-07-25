/**
 * AndroGRAM — Firestore helpers for Telegram Automation
 * Data is scoped to the signed-in user AND botId (token-bound).
 *
 * Path:
 *   users/{uid}/telegramBots/{botId}
 *   users/{uid}/telegramBots/{botId}/groups/{chatId}
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

export function botRef(uid, botId) {
  return doc(db, "users", uid, "telegramBots", String(botId));
}

export function groupsCol(uid, botId) {
  return collection(db, "users", uid, "telegramBots", String(botId), "groups");
}

export function groupRef(uid, botId, chatId) {
  return doc(db, "users", uid, "telegramBots", String(botId), "groups", String(chatId));
}

export function userRef(uid) {
  return doc(db, "users", uid);
}

/**
 * Save / update bot document for this user (token tied to botId).
 */
export async function saveBot(uid, bot) {
  const id = String(bot.id);
  const ref = botRef(uid, id);
  await setDoc(
    ref,
    {
      botId: id,
      token: bot.token,
      username: bot.username || "",
      firstName: bot.first_name || bot.firstName || "",
      canJoinGroups: !!bot.can_join_groups,
      canReadAllGroupMessages: !!bot.can_read_all_group_messages,
      updatedAt: serverTimestamp(),
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
  const snap = await getDoc(botRef(uid, botId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listBots(uid) {
  const snap = await getDocs(collection(db, "users", uid, "telegramBots"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Upsert groups for a specific bot only (never mixes other bots).
 */
export async function saveGroups(uid, botId, groups) {
  const batch = writeBatch(db);
  const bid = String(botId);
  let n = 0;

  for (const g of groups) {
    const chatId = String(g.id ?? g.chatId);
    if (!chatId) continue;
    const ref = groupRef(uid, bid, chatId);
    batch.set(
      ref,
      {
        chatId,
        title: g.title || g.username || `Chat ${chatId}`,
        type: g.type || "group",
        username: g.username || null,
        updatedAt: serverTimestamp(),
        botId: bid,
      },
      { merge: true }
    );
    n += 1;
    if (n >= 400) {
      await batch.commit();
      n = 0;
    }
  }

  if (n > 0) await batch.commit();
}

export async function listGroups(uid, botId) {
  if (!botId) return [];
  const snap = await getDocs(groupsCol(uid, botId));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
}

export async function deleteGroup(uid, botId, chatId) {
  await deleteDoc(groupRef(uid, botId, chatId));
}

export async function setActiveBot(uid, botId) {
  await setDoc(
    userRef(uid),
    { activeTelegramBotId: String(botId), updatedAt: serverTimestamp() },
    { merge: true }
  );
}
