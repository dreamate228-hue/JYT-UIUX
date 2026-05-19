const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = process.cwd();
const blobPrefix = process.env.BLOB_PREFIX || "dreamate";
const defaultCanvasPath = path.join(root, "data", "default-canvas.json");
const likesPath = path.join(root, "data", "likes.json");
const messagesPath = path.join(root, "data", "messages.json");
const htmlAssetsPath = path.join(root, "data", "html-assets.json");
const htmlPagesDir = path.join(root, "data", "html-pages");
const adminPassword = process.env.ADMIN_PASSWORD || "yitao@xiaohu";
const sessionSecret = process.env.ADMIN_SESSION_SECRET || "dreamate-local-session-secret";
const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";

let blobSdkPromise = null;

function send(res, status, body, headers = {}) {
  if (Buffer.isBuffer(body)) {
    res.writeHead(status, headers);
    res.end(body);
    return;
  }
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain;charset=utf-8" : "application/json;charset=utf-8",
    ...headers
  });
  res.end(data);
}

function readBody(req, limit = 18 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const text = await readBody(req);
  return text ? JSON.parse(text) : {};
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

function isAdmin(req) {
  const token = parseCookies(req).dreamate_admin;
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.role === "admin" && data.exp > Date.now();
  } catch {
    return false;
  }
}

async function blobSdk() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  if (!blobSdkPromise) blobSdkPromise = import("@vercel/blob");
  return blobSdkPromise;
}

function key(name) {
  return `${blobPrefix}/${name}`.replace(/\/+/g, "/");
}

async function readBlobText(name) {
  const sdk = await blobSdk();
  if (!sdk) return null;
  try {
    const item = await sdk.head(key(name));
    if (!item?.url) return null;
    const response = await fetch(item.url, { cache: "no-store" });
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}

async function putBlob(name, body, contentType) {
  const sdk = await blobSdk();
  if (!sdk) throw new Error("BLOB_READ_WRITE_TOKEN is not configured");
  const options = {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60
  };
  try {
    return await sdk.put(key(name), body, options);
  } catch {
    delete options.allowOverwrite;
    return sdk.put(key(name), body, options);
  }
}

async function readJsonStore(name, fallbackPath, fallbackValue) {
  const text = await readBlobText(name);
  if (text) return JSON.parse(text);
  try {
    return JSON.parse(await fs.promises.readFile(fallbackPath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

async function writeJsonStore(name, value) {
  await putBlob(name, `${JSON.stringify(value, null, 2)}\n`, "application/json;charset=utf-8");
}

function validateCanvas(payload) {
  return payload
    && Array.isArray(payload.pages)
    && Array.isArray(payload.blocks)
    && Array.isArray(payload.connections)
    && payload.view
    && Number.isFinite(Number(payload.view.panX))
    && Number.isFinite(Number(payload.view.panY))
    && Number.isFinite(Number(payload.view.scale));
}

function cleanMessageText(value) {
  return String(value || "").trim().slice(0, 1000);
}

function safeName(name, fallbackExt) {
  const ext = path.extname(name || "").toLowerCase() || fallbackExt;
  return `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
}

function pdfFallback(kind) {
  if (kind === "resume") return path.join(root, "assets", "获取PDF", "简历_UIUX_蒋翊涛_19357629233.pdf");
  if (kind === "portfolio") return path.join(root, "assets", "获取PDF", "作品集_UIUX_蒋翊涛_19357629233.pdf");
  return null;
}

async function readPdfMeta() {
  return readJsonStore("data/pdf-assets.json", path.join(root, "data", "pdf-assets.json"), { files: {} });
}

async function readHtmlAssets() {
  return readJsonStore("data/html-assets.json", htmlAssetsPath, { pages: [] });
}

async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const routedPath = url.searchParams.get("path");
  const pathname = routedPath ? `/api/${routedPath.replace(/^\/+/, "")}` : url.pathname;
  try {
    if (req.method === "GET" && pathname === "/api/canvas-default") {
      const data = await readJsonStore("data/default-canvas.json", defaultCanvasPath, null);
      if (!data) return send(res, 404, { message: "not found" });
      return send(res, 200, data, { "Cache-Control": "no-store" });
    }

    if (req.method === "GET" && pathname === "/api/likes") {
      const data = await readJsonStore("data/likes.json", likesPath, { count: 0 });
      return send(res, 200, { count: Math.max(0, Number(data.count) || 0) });
    }

    if (req.method === "POST" && pathname === "/api/likes") {
      const body = await readJsonBody(req);
      const current = await readJsonStore("data/likes.json", likesPath, { count: 0 });
      const next = Math.max(0, (Number(current.count) || 0) + (body.delta === -1 ? -1 : 1));
      await writeJsonStore("data/likes.json", { count: next, updatedAt: new Date().toISOString() });
      return send(res, 200, { count: next });
    }

    if (req.method === "POST" && pathname === "/api/messages") {
      const body = await readJsonBody(req);
      const text = cleanMessageText(body.text);
      if (!text) return send(res, 400, { message: "empty message" });
      const data = await readJsonStore("data/messages.json", messagesPath, { messages: [] });
      const messages = Array.isArray(data.messages) ? data.messages : [];
      messages.unshift({
        id: `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        text,
        liked: false,
        createdAt: new Date().toISOString()
      });
      await writeJsonStore("data/messages.json", { messages, updatedAt: new Date().toISOString() });
      return send(res, 200, { saved: true });
    }

    if (req.method === "GET" && pathname === "/api/messages/liked") {
      const data = await readJsonStore("data/messages.json", messagesPath, { messages: [] });
      const messages = Array.isArray(data.messages) ? data.messages : [];
      return send(res, 200, { messages: messages.filter((item) => item.liked).map((item) => ({ id: item.id, text: item.text })) });
    }

    if (req.method === "GET" && pathname === "/api/admin/session") {
      return send(res, 200, { authenticated: isAdmin(req) });
    }

    if (req.method === "POST" && pathname === "/api/admin/login") {
      const body = await readJsonBody(req);
      if (body.password !== adminPassword) return send(res, 401, { message: "invalid password" });
      return send(res, 200, { authenticated: true }, {
        "Set-Cookie": `dreamate_admin=${encodeURIComponent(createSessionToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureCookie}`
      });
    }

    if (req.method === "POST" && pathname === "/api/admin/logout") {
      return send(res, 200, { authenticated: false }, {
        "Set-Cookie": `dreamate_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie}`
      });
    }

    if (pathname.startsWith("/api/admin/") && !isAdmin(req)) {
      return send(res, 401, { message: "unauthorized" });
    }

    if (req.method === "GET" && pathname === "/api/admin/messages") {
      const data = await readJsonStore("data/messages.json", messagesPath, { messages: [] });
      return send(res, 200, { messages: Array.isArray(data.messages) ? data.messages : [] });
    }

    if ((req.method === "PATCH" || req.method === "DELETE") && pathname.startsWith("/api/admin/messages/")) {
      const id = decodeURIComponent(pathname.split("/").pop());
      const data = await readJsonStore("data/messages.json", messagesPath, { messages: [] });
      let messages = Array.isArray(data.messages) ? data.messages : [];
      if (req.method === "DELETE") {
        messages = messages.filter((message) => message.id !== id);
        await writeJsonStore("data/messages.json", { messages, updatedAt: new Date().toISOString() });
        return send(res, 200, { deleted: true });
      }
      const body = await readJsonBody(req);
      const item = messages.find((message) => message.id === id);
      if (!item) return send(res, 404, { message: "not found" });
      item.liked = Boolean(body.liked);
      await writeJsonStore("data/messages.json", { messages, updatedAt: new Date().toISOString() });
      return send(res, 200, { message: item });
    }

    if (req.method === "POST" && pathname === "/api/admin/canvas-default") {
      const body = await readJsonBody(req);
      if (!validateCanvas(body)) return send(res, 400, { message: "invalid canvas payload" });
      await writeJsonStore("data/default-canvas.json", { ...body, updatedAt: new Date().toISOString() });
      return send(res, 200, { saved: true });
    }

    if (req.method === "POST" && pathname === "/api/admin/assets") {
      const body = await readJsonBody(req);
      const match = /^data:([^;]+);base64,(.+)$/.exec(body.dataUrl || "");
      if (!match || !match[1].startsWith("image/")) return send(res, 400, { message: "invalid image" });
      const file = safeName(body.name, ".png");
      const blob = await putBlob(`uploads/${file}`, Buffer.from(match[2], "base64"), match[1]);
      return send(res, 200, { src: blob.url });
    }

    if (req.method === "POST" && pathname === "/api/admin/html-assets") {
      const body = await readJsonBody(req);
      const name = String(body.name || "");
      const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/.exec(body.dataUrl || "");
      if (!match || !/\.html?$/i.test(name)) return send(res, 400, { message: "invalid html" });
      const id = `html-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const blob = await putBlob(`html-pages/${id}.html`, Buffer.from(match[2], "base64"), "text/html;charset=utf-8");
      const data = await readHtmlAssets();
      const pages = Array.isArray(data.pages) ? data.pages : [];
      const item = {
        id,
        title: path.basename(name, path.extname(name)).slice(0, 80) || "HTML 页面",
        file: `${id}.html`,
        url: blob.url,
        originalName: path.basename(name),
        createdAt: new Date().toISOString()
      };
      pages.unshift(item);
      await writeJsonStore("data/html-assets.json", { pages, updatedAt: new Date().toISOString() });
      return send(res, 200, { id, url: `/api/html-pages/${id}`, title: item.title });
    }

    if (req.method === "GET" && pathname.startsWith("/api/html-pages/")) {
      const id = decodeURIComponent(pathname.split("/").pop() || "");
      const data = await readHtmlAssets();
      const item = (Array.isArray(data.pages) ? data.pages : []).find((page) => page.id === id);
      if (item?.url) {
        res.writeHead(302, { Location: item.url });
        res.end();
        return;
      }
      const localFile = path.join(htmlPagesDir, `${id}.html`);
      if (fs.existsSync(localFile)) return send(res, 200, await fs.promises.readFile(localFile), { "Content-Type": "text/html;charset=utf-8" });
      return send(res, 404, "not found");
    }

    if (req.method === "POST" && pathname === "/api/admin/pdf") {
      const body = await readJsonBody(req);
      if (!["resume", "portfolio"].includes(body.kind)) return send(res, 400, { message: "invalid pdf" });
      const match = /^data:application\/pdf;base64,(.+)$/.exec(body.dataUrl || "");
      if (!match) return send(res, 400, { message: "invalid pdf" });
      const blob = await putBlob(`pdf/${body.kind}.pdf`, Buffer.from(match[1], "base64"), "application/pdf");
      const meta = await readPdfMeta();
      meta.files = { ...(meta.files || {}), [body.kind]: blob.url };
      meta.updatedAt = new Date().toISOString();
      await writeJsonStore("data/pdf-assets.json", meta);
      return send(res, 200, { saved: true, url: blob.url });
    }

    if (req.method === "GET" && pathname === "/api/pdf") {
      const kind = url.searchParams.get("kind");
      const meta = await readPdfMeta();
      if (meta.files?.[kind]) {
        res.writeHead(302, { Location: meta.files[kind] });
        res.end();
        return;
      }
      const fallback = pdfFallback(kind);
      if (!fallback || !fs.existsSync(fallback)) return send(res, 404, "not found");
      return send(res, 200, await fs.promises.readFile(fallback), { "Content-Type": "application/pdf", "Cache-Control": "no-store" });
    }

    return send(res, 404, { message: "not found" });
  } catch (error) {
    return send(res, error.message === "payload too large" ? 413 : 500, { message: error.message || "server error" });
  }
}

module.exports = handler;
