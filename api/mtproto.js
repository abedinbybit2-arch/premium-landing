/**
 * AndroGRAM — MTProto user-account automation (Vercel Serverless + GramJS)
 *
 * api_id / api_hash stay server-side only. Client never receives them.
 *
 * POST JSON:
 * {
 *   action: "sendCode" | "signIn" | "checkPassword" | "getMe" | "getOwnedGroups" | "addBotToGroups" | "logout",
 *   session?: string,          // GramJS StringSession
 *   phone?: string,
 *   phoneCodeHash?: string,
 *   code?: string,
 *   password?: string,
 *   botUsername?: string,
 *   groups?: Array<{ peerId: string, title?: string, kind?: string }>
 * }
 */

const { TelegramClient, Api } = require("telegram");
const { StringSession } = require("telegram/sessions");
const bigInt = require("big-integer");

// Server-only credentials. Prefer Vercel env TG_API_ID / TG_API_HASH; fallbacks keep prod working.
// Never send these to the browser — only used inside this serverless function.
function resolveApiCredentials() {
  const apiId = Number(process.env.TG_API_ID || "36330622");
  const apiHash = String(process.env.TG_API_HASH || "a45d56067a256f31013c85c354760b3b").trim();
  if (!apiId || !apiHash) {
    return {
      ok: false,
      error:
        "Server missing TG_API_ID / TG_API_HASH. Set them in Vercel project env (from my.telegram.org).",
    };
  }
  return { ok: true, apiId, apiHash };
}

const MAX_BATCH = 12;
const CONCURRENCY = 4;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function errMsg(err) {
  if (!err) return "Unknown error";
  if (err.errorMessage) return err.errorMessage;
  if (err.message) return err.message;
  return String(err);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withFloodRetry(fn, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = errMsg(err);
      const waitMatch = msg.match(/FLOOD_WAIT_(\d+)/i) || msg.match(/wait of (\d+)/i);
      const seconds =
        err.seconds ||
        (waitMatch ? Number(waitMatch[1]) : null) ||
        (typeof err.wait === "number" ? err.wait : null);
      if (seconds && seconds <= 45) {
        await sleep((seconds + 1) * 1000);
        continue;
      }
      // mild backoff for transient network
      if (/TIMEOUT|CONNECTION|NETWORK|ECONNRESET/i.test(msg) && i < tries - 1) {
        await sleep(800 * (i + 1));
        continue;
      }
      throw err;
    }
  }
  throw last;
}

function createClient(sessionStr = "", apiId, apiHash) {
  const stringSession = new StringSession(sessionStr || "");
  return new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: true,
    timeout: 20000,
    requestRetries: 3,
    autoReconnect: false,
    deviceModel: "AndroGRAM Web",
    systemVersion: "Web",
    appVersion: "1.2.0",
    langCode: "en",
  });
}

async function connectClient(sessionStr = "") {
  const creds = resolveApiCredentials();
  if (!creds.ok) {
    const err = new Error(creds.error);
    err.code = "MISSING_API_CREDS";
    throw err;
  }
  const client = createClient(sessionStr, creds.apiId, creds.apiHash);
  await client.connect();
  return client;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "").trim();
}

function normalizeBotUsername(u) {
  return String(u || "")
    .trim()
    .replace(/^@/, "")
    .replace(/\s+/g, "");
}

function entityKind(entity) {
  if (!entity) return "unknown";
  const cn = entity.className || entity.constructor?.name || "";
  if (cn === "Channel") {
    if (entity.megagroup || entity.gigagroup) return "supergroup";
    if (entity.broadcast) return "channel";
    return "channel";
  }
  if (cn === "Chat") return "group";
  return "unknown";
}

function serializeUser(user) {
  if (!user) return null;
  return {
    id: String(user.id),
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    username: user.username || null,
    phone: user.phone || null,
  };
}

async function actionSendCode(body) {
  const phone = normalizePhone(body.phone);
  if (!phone || phone.length < 8) {
    return { ok: false, status: 400, error: "Enter a valid phone number with country code (e.g. +8801…)" };
  }

  const creds = resolveApiCredentials();
  if (!creds.ok) {
    return { ok: false, status: 500, error: creds.error };
  }

  const client = await connectClient("");
  try {
    const result = await withFloodRetry(() =>
      client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phone,
          apiId: creds.apiId,
          apiHash: creds.apiHash,
          settings: new Api.CodeSettings({
            allowFlashcall: false,
            currentNumber: false,
            allowAppHash: true,
          }),
        })
      )
    );

    const session = client.session.save();
    return {
      ok: true,
      status: 200,
      data: {
        phone,
        phoneCodeHash: result.phoneCodeHash,
        session,
        isCodeViaApp: Boolean(result.type && /app/i.test(result.type.className || "")),
        timeout: result.timeout || null,
      },
    };
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function actionSignIn(body) {
  const phone = normalizePhone(body.phone);
  const code = String(body.code || "").trim();
  const phoneCodeHash = String(body.phoneCodeHash || "").trim();
  const sessionIn = String(body.session || "");

  if (!phone || !code || !phoneCodeHash || !sessionIn) {
    return { ok: false, status: 400, error: "phone, code, phoneCodeHash and session are required" };
  }

  const client = await connectClient(sessionIn);
  try {
    try {
      await withFloodRetry(() =>
        client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash,
            phoneCode: code,
          })
        )
      );
    } catch (err) {
      const msg = errMsg(err);
      if (msg.includes("SESSION_PASSWORD_NEEDED") || err.errorMessage === "SESSION_PASSWORD_NEEDED") {
        return {
          ok: true,
          status: 200,
          data: {
            needPassword: true,
            session: client.session.save(),
            phone,
          },
        };
      }
      if (msg.includes("PHONE_CODE_INVALID")) {
        return { ok: false, status: 400, error: "Invalid code. Check the Telegram code and try again." };
      }
      if (msg.includes("PHONE_CODE_EXPIRED")) {
        return { ok: false, status: 400, error: "Code expired. Request a new code." };
      }
      throw err;
    }

    const me = await client.getMe();
    return {
      ok: true,
      status: 200,
      data: {
        needPassword: false,
        session: client.session.save(),
        user: serializeUser(me),
      },
    };
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function actionCheckPassword(body) {
  const password = String(body.password || "");
  const sessionIn = String(body.session || "");
  if (!password || !sessionIn) {
    return { ok: false, status: 400, error: "password and session are required" };
  }

  const client = await connectClient(sessionIn);
  try {
    const { computeCheck } = require("telegram/Password");
    const pwd = await client.invoke(new Api.account.GetPassword());
    const passwordCheck = await computeCheck(pwd, password);
    await withFloodRetry(() => client.invoke(new Api.auth.CheckPassword({ password: passwordCheck })));

    const me = await client.getMe();
    return {
      ok: true,
      status: 200,
      data: {
        session: client.session.save(),
        user: serializeUser(me),
      },
    };
  } catch (err) {
    const msg = errMsg(err);
    if (/PASSWORD_HASH_INVALID|PASSWORD_INVALID/i.test(msg)) {
      return { ok: false, status: 400, error: "Wrong 2FA password." };
    }
    throw err;
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function actionGetMe(body) {
  const sessionIn = String(body.session || "");
  if (!sessionIn) return { ok: false, status: 401, error: "Not logged in" };

  const client = await connectClient(sessionIn);
  try {
    if (!(await client.checkAuthorization())) {
      return { ok: false, status: 401, error: "Session expired. Log in again." };
    }
    const me = await client.getMe();
    return {
      ok: true,
      status: 200,
      data: {
        session: client.session.save(),
        user: serializeUser(me),
      },
    };
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function actionGetOwnedGroups(body) {
  const sessionIn = String(body.session || "");
  if (!sessionIn) return { ok: false, status: 401, error: "Not logged in" };

  const client = await connectClient(sessionIn);
  try {
    if (!(await client.checkAuthorization())) {
      return { ok: false, status: 401, error: "Session expired. Log in again." };
    }

    const dialogs = await client.getDialogs({ limit: 500 });
    const groups = [];
    const seen = new Set();

    for (const d of dialogs) {
      const entity = d.entity;
      if (!entity) continue;
      const cn = entity.className || entity.constructor?.name || "";
      const isGroupLike = cn === "Channel" || cn === "Chat";
      if (!isGroupLike) continue;
      // Only groups/channels the account owns (creator)
      if (!entity.creator) continue;

      const peerId = String(d.id);
      if (seen.has(peerId)) continue;
      seen.add(peerId);

      groups.push({
        peerId,
        title: d.title || entity.title || `Chat ${peerId}`,
        kind: entityKind(entity),
        username: entity.username || null,
        participantsCount: entity.participantsCount || d.entity?.participantsCount || null,
        rawId: String(entity.id),
        accessHash: entity.accessHash != null ? String(entity.accessHash) : "0",
        isChannel: cn === "Channel",
      });
    }

    groups.sort((a, b) => String(a.title).localeCompare(String(b.title)));

    return {
      ok: true,
      status: 200,
      data: {
        session: client.session.save(),
        count: groups.length,
        groups,
      },
    };
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function isMember(client, entity, bot) {
  const cn = entity.className || entity.constructor?.name || "";
  try {
    if (cn === "Channel") {
      await client.invoke(
        new Api.channels.GetParticipant({
          channel: entity,
          participant: bot,
        })
      );
      return true;
    }
    const full = await client.invoke(new Api.messages.GetFullChat({ chatId: entity.id }));
    const participants = full.fullChat?.participants?.participants || [];
    const botId = String(bot.id);
    return participants.some((p) => String(p.userId) === botId);
  } catch (err) {
    const msg = errMsg(err);
    if (/USER_NOT_PARTICIPANT|PARTICIPANT_ID_INVALID/i.test(msg)) return false;
    return false;
  }
}

/** Invite bot as member only — never promote to admin. */
async function inviteBot(client, entity, bot) {
  const cn = entity.className || entity.constructor?.name || "";
  if (cn === "Channel") {
    await withFloodRetry(() =>
      client.invoke(
        new Api.channels.InviteToChannel({
          channel: entity,
          users: [bot],
        })
      )
    );
    return;
  }
  await withFloodRetry(() =>
    client.invoke(
      new Api.messages.AddChatUser({
        chatId: entity.id,
        userId: bot,
        fwdLimit: 0,
      })
    )
  );
}

async function resolveGroupEntity(client, group) {
  const attempts = [];
  if (group.peerId != null && group.peerId !== "") {
    attempts.push(group.peerId);
    try {
      attempts.push(bigInt(String(group.peerId)));
    } catch {
      /* ignore */
    }
  }
  if (group.rawId && group.accessHash != null && String(group.accessHash) !== "") {
    attempts.push(
      new Api.InputPeerChannel({
        channelId: bigInt(group.rawId),
        accessHash: bigInt(group.accessHash),
      })
    );
  }
  if (group.rawId) {
    try {
      attempts.push(bigInt(group.rawId));
    } catch {
      /* ignore */
    }
  }

  let lastErr;
  for (const a of attempts) {
    try {
      return await client.getEntity(a);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Could not resolve group");
}

/**
 * Add bot as member only.
 * - Already joined → skip
 * - Not joined → invite (no admin promote)
 */
async function processOneGroup(client, bot, group) {
  const title = group.title || group.peerId || "group";
  try {
    let entity;
    try {
      entity = await resolveGroupEntity(client, group);
    } catch (err) {
      return {
        peerId: group.peerId,
        title,
        status: "error",
        detail: `Could not resolve group: ${errMsg(err)}`,
      };
    }

    if (await isMember(client, entity, bot)) {
      return {
        peerId: group.peerId,
        title,
        status: "skipped",
        detail: "Bot already in group — skipped",
      };
    }

    try {
      await inviteBot(client, entity, bot);
      return {
        peerId: group.peerId,
        title,
        status: "added",
        detail: "Bot added (member only, not admin)",
      };
    } catch (err) {
      const msg = errMsg(err);
      if (/USER_ALREADY_PARTICIPANT/i.test(msg)) {
        return {
          peerId: group.peerId,
          title,
          status: "skipped",
          detail: "Bot already in group — skipped",
        };
      }
      return { peerId: group.peerId, title, status: "error", detail: msg };
    }
  } catch (err) {
    return { peerId: group.peerId, title, status: "error", detail: errMsg(err) };
  }
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function run() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i], i);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

async function actionAddBotToGroups(body) {
  const sessionIn = String(body.session || "");
  const botUsername = normalizeBotUsername(body.botUsername);
  const groups = Array.isArray(body.groups) ? body.groups : [];

  if (!sessionIn) return { ok: false, status: 401, error: "Not logged in" };
  if (!botUsername) return { ok: false, status: 400, error: "Bot username is required (e.g. MyBot)" };
  if (!groups.length) return { ok: false, status: 400, error: "No groups provided" };
  if (groups.length > MAX_BATCH) {
    return {
      ok: false,
      status: 400,
      error: `Max ${MAX_BATCH} groups per request. Client should batch.`,
    };
  }

  const client = await connectClient(sessionIn);
  try {
    if (!(await client.checkAuthorization())) {
      return { ok: false, status: 401, error: "Session expired. Log in again." };
    }

    let bot;
    try {
      bot = await client.getEntity(botUsername);
    } catch {
      return { ok: false, status: 400, error: `Could not find bot @${botUsername}` };
    }

    // GramJS User has bot?: boolean — reject plain users
    if ((bot.className === "User" || bot.className === "UserEmpty") && bot.bot !== true) {
      return { ok: false, status: 400, error: `@${botUsername} is not a bot` };
    }

    const results = await mapPool(groups, CONCURRENCY, (g) => processOneGroup(client, bot, g));

    const summary = {
      total: results.length,
      added: results.filter((r) => r.status === "added").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      error: results.filter((r) => r.status === "error").length,
    };

    return {
      ok: true,
      status: 200,
      data: {
        session: client.session.save(),
        bot: {
          id: String(bot.id),
          username: bot.username || botUsername,
          firstName: bot.firstName || "",
        },
        summary,
        results,
      },
    };
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

async function actionLogout(body) {
  const sessionIn = String(body.session || "");
  if (!sessionIn) return { ok: true, status: 200, data: { loggedOut: true } };

  const client = await connectClient(sessionIn);
  try {
    try {
      await client.invoke(new Api.auth.LogOut());
    } catch {
      /* ignore */
    }
    return { ok: true, status: 200, data: { loggedOut: true } };
  } finally {
    try {
      await client.disconnect();
    } catch {
      /* ignore */
    }
  }
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = parseBody(req);
    const action = String(body.action || "").trim();

    let result;
    switch (action) {
      case "sendCode":
        result = await actionSendCode(body);
        break;
      case "signIn":
        result = await actionSignIn(body);
        break;
      case "checkPassword":
        result = await actionCheckPassword(body);
        break;
      case "getMe":
        result = await actionGetMe(body);
        break;
      case "getOwnedGroups":
        result = await actionGetOwnedGroups(body);
        break;
      case "addBotToGroups":
        result = await actionAddBotToGroups(body);
        break;
      case "logout":
        result = await actionLogout(body);
        break;
      default:
        result = {
          ok: false,
          status: 400,
          error: "Unknown action. Use sendCode, signIn, checkPassword, getMe, getOwnedGroups, addBotToGroups, logout",
        };
    }

    if (!result.ok) {
      return res.status(result.status || 400).json({ ok: false, error: result.error });
    }
    return res.status(result.status || 200).json({ ok: true, ...result.data });
  } catch (err) {
    console.error("mtproto error", err);
    if (err && err.code === "MISSING_API_CREDS") {
      return res.status(500).json({ ok: false, error: err.message });
    }
    return res.status(500).json({
      ok: false,
      error: errMsg(err) || "MTProto server error",
    });
  }
};
