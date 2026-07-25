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

/**
 * Collect chats from bot updates (groups / supergroups / channels).
 * Note: Telegram has no "list all groups" API — we discover chats from getUpdates.
 */
export async function discoverGroups(token) {
  const result = await callTelegram({
    token,
    method: "getUpdates",
    params: {
      offset: -100,
      limit: 100,
      timeout: 0,
      allowed_updates: [
        "message",
        "edited_message",
        "channel_post",
        "my_chat_member",
        "chat_member",
      ],
    },
  });

  const map = new Map();

  const accept = (chat) => {
    if (!chat || chat.id == null) return;
    const type = chat.type;
    if (type !== "group" && type !== "supergroup" && type !== "channel") return;
    const id = String(chat.id);
    map.set(id, {
      id,
      title: chat.title || chat.username || `Chat ${id}`,
      type,
      username: chat.username || null,
    });
  };

  for (const u of result || []) {
    accept(u.message?.chat);
    accept(u.edited_message?.chat);
    accept(u.channel_post?.chat);
    accept(u.my_chat_member?.chat);
    accept(u.chat_member?.chat);
  }

  return Array.from(map.values());
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
