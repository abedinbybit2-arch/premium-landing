/**
 * AndroGRAM — Telegram Bot API proxy (Vercel Serverless)
 * Avoids browser CORS when calling api.telegram.org
 *
 * POST body:
 * {
 *   token: string,
 *   method: string,          // getMe | getUpdates | sendMessage | sendPhoto | getChat
 *   params?: object,         // method params (except photo binary)
 *   photoBase64?: string,    // optional data URL or raw base64 for sendPhoto
 *   photoFilename?: string
 * }
 */

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

function parseDataUrl(input) {
  if (!input || typeof input !== "string") return null;
  const m = input.match(/^data:([^;]+);base64,(.+)$/);
  if (m) {
    return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
  }
  return { mime: "image/jpeg", buffer: Buffer.from(input, "base64") };
}

function buildMultipart(fields, fileField) {
  const boundary = "----AndroGRAM" + Date.now().toString(16);
  const chunks = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${String(
          value
        )}\r\n`
      )
    );
  }

  if (fileField) {
    const { name, filename, mime, buffer } = fileField;
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
      )
    );
    chunks.push(buffer);
    chunks.push(Buffer.from("\r\n"));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, description: "Method not allowed" });
  }

  try {
    const body = parseBody(req);
    const token = String(body.token || "").trim();
    const method = String(body.method || "").trim();
    const params = body.params && typeof body.params === "object" ? body.params : {};

    if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
      return res.status(400).json({
        ok: false,
        description: "Invalid bot token format",
      });
    }

    const allowed = new Set([
      "getMe",
      "getUpdates",
      "sendMessage",
      "sendPhoto",
      "getChat",
      "getChatMember",
    ]);

    if (!allowed.has(method)) {
      return res.status(400).json({
        ok: false,
        description: "Method not allowed",
      });
    }

    const apiUrl = `https://api.telegram.org/bot${token}/${method}`;

    let tgRes;

    if (method === "sendPhoto" && body.photoBase64) {
      const parsed = parseDataUrl(body.photoBase64);
      if (!parsed) {
        return res.status(400).json({ ok: false, description: "Invalid photo data" });
      }
      const fields = { ...params };
      delete fields.photo;
      const mp = buildMultipart(fields, {
        name: "photo",
        filename: body.photoFilename || "photo.jpg",
        mime: parsed.mime || "image/jpeg",
        buffer: parsed.buffer,
      });
      tgRes = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": mp.contentType },
        body: mp.body,
      });
    } else {
      tgRes = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    }

    const data = await tgRes.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("telegram proxy error", err);
    return res.status(500).json({
      ok: false,
      description: err?.message || "Proxy error",
    });
  }
};
