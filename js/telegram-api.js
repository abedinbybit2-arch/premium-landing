/**
 * AndroGRAM — Client wrapper for Telegram via Vercel /api/telegram proxy
 */

const API_PATH = "/api/telegram";

async function callTelegram({ token, method, params = {}, photoBase64, photoFilename }) {
  const res = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      method,
      params,
      photoBase64,
      photoFilename,
    }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Invalid response from Telegram proxy");
  }

  if (!data.ok) {
    const msg = data.description || "Telegram API error";
    const err = new Error(msg);
    err.code = data.error_code;
    err.telegram = data;
    throw err;
  }

  return data.result;
}

export async function getMe(token) {
  return callTelegram({ token, method: "getMe" });
}

const GROUP_TYPES = new Set(["group", "supergroup", "channel"]);

export function extractGroupsFromUpdates(updates) {
  const map = new Map();

  const accept = (chat) => {
    if (!chat || chat.id == null) return;
    if (!GROUP_TYPES.has(chat.type)) return;
    const id = String(chat.id);
    map.set(id, {
      id,
      chatId: id,
      title: chat.title || chat.username || `Chat ${id}`,
      type: chat.type,
      username: chat.username || null,
    });
  };

  for (const u of updates || []) {
    accept(u.message?.chat);
    accept(u.edited_message?.chat);
    accept(u.channel_post?.chat);
    accept(u.my_chat_member?.chat);
    accept(u.chat_member?.chat);
    // bot added/removed events
    if (u.my_chat_member?.chat) accept(u.my_chat_member.chat);
  }

  return Array.from(map.values());
}

/**
 * Live getUpdates poll.
 * @param {string} token
 * @param {{ offset?: number, limit?: number }} opts
 * @returns {{ updates: any[], groups: any[], nextOffset: number }}
 */
export async function pollUpdates(token, opts = {}) {
  const offset = opts.offset;
  const params = {
    limit: opts.limit || 100,
    timeout: 0,
    allowed_updates: [
      "message",
      "edited_message",
      "channel_post",
      "my_chat_member",
      "chat_member",
    ],
  };
  // First poll: negative offset to read recent buffer; then sequential offsets
  if (offset != null && offset > 0) {
    params.offset = offset;
  } else {
    params.offset = -100;
  }

  const updates = (await callTelegram({
    token,
    method: "getUpdates",
    params,
  })) || [];

  let nextOffset = offset > 0 ? offset : 0;
  if (updates.length) {
    nextOffset = Math.max(...updates.map((u) => Number(u.update_id) || 0)) + 1;
  }

  return {
    updates,
    groups: extractGroupsFromUpdates(updates),
    nextOffset,
  };
}

/**
 * Collect chats from bot updates (groups / supergroups / channels).
 */
export async function discoverGroups(token) {
  const { groups } = await pollUpdates(token, {});
  return groups;
}

export async function getChat(token, chatId) {
  return callTelegram({
    token,
    method: "getChat",
    params: { chat_id: chatId },
  });
}

export async function sendMessage(token, chatId, text) {
  return callTelegram({
    token,
    method: "sendMessage",
    params: {
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
    },
  });
}

/**
 * @param {string} token
 * @param {string} chatId
 * @param {{ caption?: string, photoBase64?: string, photoUrl?: string, filename?: string }} opts
 */
export async function sendPhoto(token, chatId, opts = {}) {
  if (opts.photoBase64) {
    return callTelegram({
      token,
      method: "sendPhoto",
      params: {
        chat_id: chatId,
        caption: opts.caption || undefined,
      },
      photoBase64: opts.photoBase64,
      photoFilename: opts.filename || "photo.jpg",
    });
  }

  if (opts.photoUrl) {
    return callTelegram({
      token,
      method: "sendPhoto",
      params: {
        chat_id: chatId,
        photo: opts.photoUrl,
        caption: opts.caption || undefined,
      },
    });
  }

  throw new Error("Photo file or URL is required");
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
