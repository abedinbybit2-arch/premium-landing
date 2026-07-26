/**
 * AndroGRAM — Client wrapper for /api/mtproto (user account, server-side api_id/hash)
 */

const API_PATH = "/api/mtproto";
const SESSION_KEY = "androgram_mtproto_session";
const META_KEY = "androgram_mtproto_meta";

export function getStoredSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredSession(session) {
  try {
    if (session) {
      sessionStorage.setItem(SESSION_KEY, session);
      localStorage.setItem(SESSION_KEY, session);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function getStoredMeta() {
  try {
    const raw = sessionStorage.getItem(META_KEY) || localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredMeta(meta) {
  try {
    if (meta) {
      const s = JSON.stringify(meta);
      sessionStorage.setItem(META_KEY, s);
      localStorage.setItem(META_KEY, s);
    } else {
      sessionStorage.removeItem(META_KEY);
      localStorage.removeItem(META_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function clearMtprotoStorage() {
  setStoredSession("");
  setStoredMeta(null);
}

async function callMtproto(payload) {
  const res = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Invalid response from MTProto API");
  }

  if (data.session) {
    setStoredSession(data.session);
  }

  if (!data.ok && data.error) {
    const err = new Error(data.error);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

export async function sendCode(phone) {
  return callMtproto({ action: "sendCode", phone });
}

export async function signIn({ phone, code, phoneCodeHash, session }) {
  return callMtproto({
    action: "signIn",
    phone,
    code,
    phoneCodeHash,
    session: session || getStoredSession(),
  });
}

export async function checkPassword({ password, session }) {
  return callMtproto({
    action: "checkPassword",
    password,
    session: session || getStoredSession(),
  });
}

export async function getMe(session) {
  return callMtproto({
    action: "getMe",
    session: session || getStoredSession(),
  });
}

export async function getOwnedGroups(session) {
  return callMtproto({
    action: "getOwnedGroups",
    session: session || getStoredSession(),
  });
}

/**
 * Add bot to a batch of groups (server max ~12). Frontend chunks for 100.
 */
export async function addBotToGroups({ botUsername, groups, session }) {
  return callMtproto({
    action: "addBotToGroups",
    botUsername,
    groups,
    session: session || getStoredSession(),
  });
}

export async function logoutMtproto(session) {
  try {
    await callMtproto({
      action: "logout",
      session: session || getStoredSession(),
    });
  } catch {
    /* ignore network on logout */
  } finally {
    clearMtprotoStorage();
  }
}

export function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
