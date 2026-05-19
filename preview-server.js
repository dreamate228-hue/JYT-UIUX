const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const defaultCanvasPath = path.join(root, "data", "default-canvas.json");
const likesPath = path.join(root, "data", "likes.json");
const messagesPath = path.join(root, "data", "messages.json");
const htmlPagesPath = path.join(root, "data", "html-assets.json");
const htmlPagesDir = path.join(root, "data", "html-pages");
const uploadsDir = path.join(root, "assets", "uploads");
const adminPassword = process.env.ADMIN_PASSWORD || "yitao@xiaohu";
const sessionSecret = process.env.ADMIN_SESSION_SECRET || "dreamate-local-session-secret";
const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
const types = {
  ".html": "text/html;charset=utf-8",
  ".htm": "text/html;charset=utf-8",
  ".css": "text/css;charset=utf-8",
  ".js": "application/javascript;charset=utf-8",
  ".mjs": "application/javascript;charset=utf-8",
  ".json": "application/json;charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".ttc": "font/collection"
};

function send(response, status, body, headers = {}) {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain;charset=utf-8" : "application/json;charset=utf-8",
    ...headers
  });
  response.end(data);
}

function readBody(request, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("payload too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function readJson(request) {
  const text = await readBody(request);
  return text ? JSON.parse(text) : {};
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({ role: "admin", exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

function isAdmin(request) {
  const token = parseCookies(request).dreamate_admin;
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

function collectUsedUploadFiles(payload) {
  const used = new Set();
  (payload.blocks || []).forEach((block) => {
    (block.elements || []).forEach((element) => {
      const src = element && typeof element.src === "string" ? element.src : "";
      if (!src.startsWith("uploads/")) return;
      const fileName = path.basename(src);
      if (fileName) used.add(fileName);
    });
  });
  return used;
}

function collectUsedHtmlPageIds(payload) {
  const used = new Set();
  (payload.blocks || []).forEach((block) => {
    (block.elements || []).forEach((element) => {
      const id = element && typeof element.htmlPageId === "string" ? element.htmlPageId : "";
      if (/^html-[\w-]+$/.test(id)) used.add(id);
    });
  });
  return used;
}

async function cleanupUnusedUploads(payload) {
  const used = collectUsedUploadFiles(payload);
  let entries = [];
  try {
    entries = await fs.promises.readdir(uploadsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  await Promise.all(entries
    .filter((entry) => entry.isFile() && !used.has(entry.name))
    .map((entry) => fs.promises.unlink(path.join(uploadsDir, entry.name))));
}

async function readHtmlPages() {
  try {
    const data = JSON.parse(await fs.promises.readFile(htmlPagesPath, "utf8"));
    return Array.isArray(data.pages) ? data.pages : [];
  } catch {
    return [];
  }
}

async function writeHtmlPages(pages) {
  await fs.promises.mkdir(path.dirname(htmlPagesPath), { recursive: true });
  await fs.promises.writeFile(htmlPagesPath, `${JSON.stringify({ pages, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

async function cleanupUnusedHtmlPages(payload) {
  const used = collectUsedHtmlPageIds(payload);
  const pages = await readHtmlPages();
  const kept = pages.filter((page) => used.has(page.id));
  const removed = pages.filter((page) => !used.has(page.id));
  await Promise.all(removed.map((page) => fs.promises.unlink(path.join(htmlPagesDir, path.basename(page.file || ""))).catch(() => null)));
  if (kept.length !== pages.length) await writeHtmlPages(kept);
}

async function readLikeCount() {
  try {
    const data = JSON.parse(await fs.promises.readFile(likesPath, "utf8"));
    return Math.max(0, Number(data.count) || 0);
  } catch {
    return 0;
  }
}

async function writeLikeCount(count) {
  await fs.promises.mkdir(path.dirname(likesPath), { recursive: true });
  await fs.promises.writeFile(likesPath, `${JSON.stringify({ count: Math.max(0, count), updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

async function readMessages() {
  try {
    const data = JSON.parse(await fs.promises.readFile(messagesPath, "utf8"));
    return Array.isArray(data.messages) ? data.messages : [];
  } catch {
    return [];
  }
}

async function writeMessages(messages) {
  await fs.promises.mkdir(path.dirname(messagesPath), { recursive: true });
  await fs.promises.writeFile(messagesPath, `${JSON.stringify({ messages, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

function cleanMessageText(value) {
  return String(value || "").trim().slice(0, 1000);
}

function safeUploadName(name, type) {
  const extFromName = path.extname(name || "").toLowerCase();
  const extFromType = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg"
  }[type];
  const ext = extFromType || ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(extFromName) ? extFromName : ".png");
  return `canvas-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
}

function safeHtmlTitle(name) {
  return path.basename(String(name || "HTML 页面"), path.extname(String(name || ""))).slice(0, 80) || "HTML 页面";
}

function pdfTargetPath(kind) {
  if (kind === "resume") return path.join(root, "assets", "获取PDF", "简历_UIUX_蒋翊涛_19357629233.pdf");
  if (kind === "portfolio") return path.join(root, "assets", "获取PDF", "作品集_UIUX_蒋翊涛_19357629233.pdf");
  return null;
}

async function handleApi(request, response, pathname) {
  try {
    if (request.method === "GET" && pathname === "/api/likes") {
      send(response, 200, { count: await readLikeCount() });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/likes") {
      const body = await readJson(request);
      const delta = body.delta === -1 ? -1 : 1;
      const next = Math.max(0, await readLikeCount() + delta);
      await writeLikeCount(next);
      send(response, 200, { count: next });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/messages") {
      const body = await readJson(request);
      const text = cleanMessageText(body.text);
      if (!text) {
        send(response, 400, { message: "empty message" });
        return true;
      }
      const messages = await readMessages();
      const item = {
        id: `msg-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        text,
        liked: false,
        createdAt: new Date().toISOString()
      };
      messages.unshift(item);
      await writeMessages(messages);
      send(response, 200, { saved: true });
      return true;
    }

    if (request.method === "GET" && pathname === "/api/messages/liked") {
      const messages = await readMessages();
      send(response, 200, { messages: messages.filter((item) => item.liked).map((item) => ({ id: item.id, text: item.text })) });
      return true;
    }

    if (request.method === "GET" && pathname === "/api/pdf") {
      const kind = new URL(request.url, "http://127.0.0.1").searchParams.get("kind");
      const target = pdfTargetPath(kind);
      if (!target) {
        send(response, 404, "not found");
        return true;
      }
      response.writeHead(200, { "Content-Type": "application/pdf", "Cache-Control": "no-store" });
      fs.createReadStream(target).pipe(response);
      return true;
    }

    if (request.method === "GET" && pathname.startsWith("/api/html-pages/")) {
      const id = decodeURIComponent(pathname.split("/").pop() || "");
      if (!/^html-[\w-]+$/.test(id)) {
        send(response, 404, "not found");
        return true;
      }
      const pages = await readHtmlPages();
      const item = pages.find((page) => page.id === id);
      if (!item) {
        send(response, 404, "not found");
        return true;
      }
      const file = path.join(htmlPagesDir, path.basename(item.file));
      response.writeHead(200, {
        "Content-Type": "text/html;charset=utf-8",
        "Cache-Control": "no-store"
      });
      fs.createReadStream(file).pipe(response);
      return true;
    }

    if (request.method === "GET" && pathname === "/api/canvas-default") {
      response.writeHead(200, { "Content-Type": "application/json;charset=utf-8", "Cache-Control": "no-store" });
      fs.createReadStream(defaultCanvasPath).pipe(response);
      return true;
    }

    if (request.method === "GET" && pathname === "/api/admin/session") {
      send(response, 200, { authenticated: isAdmin(request) });
      return true;
    }

    if (request.method === "GET" && pathname === "/api/admin/messages") {
      if (!isAdmin(request)) {
        send(response, 401, { message: "unauthorized" });
        return true;
      }
      send(response, 200, { messages: await readMessages() });
      return true;
    }

    if (request.method === "PATCH" && pathname.startsWith("/api/admin/messages/")) {
      if (!isAdmin(request)) {
        send(response, 401, { message: "unauthorized" });
        return true;
      }
      const id = decodeURIComponent(pathname.split("/").pop());
      const body = await readJson(request);
      const messages = await readMessages();
      const item = messages.find((message) => message.id === id);
      if (!item) {
        send(response, 404, { message: "not found" });
        return true;
      }
      item.liked = Boolean(body.liked);
      await writeMessages(messages);
      send(response, 200, { message: item });
      return true;
    }

    if (request.method === "DELETE" && pathname.startsWith("/api/admin/messages/")) {
      if (!isAdmin(request)) {
        send(response, 401, { message: "unauthorized" });
        return true;
      }
      const id = decodeURIComponent(pathname.split("/").pop());
      const messages = (await readMessages()).filter((message) => message.id !== id);
      await writeMessages(messages);
      send(response, 200, { deleted: true });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/admin/login") {
      const body = await readJson(request);
      if (body.password !== adminPassword) {
        send(response, 401, { message: "invalid password" });
        return true;
      }
      send(response, 200, { authenticated: true }, {
        "Set-Cookie": `dreamate_admin=${encodeURIComponent(createSessionToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureCookie}`
      });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/admin/logout") {
      send(response, 200, { authenticated: false }, {
        "Set-Cookie": `dreamate_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureCookie}`
      });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/admin/canvas-default") {
      if (!isAdmin(request)) {
        send(response, 401, { message: "unauthorized" });
        return true;
      }
      const body = await readJson(request);
      if (!validateCanvas(body)) {
        send(response, 400, { message: "invalid canvas payload" });
        return true;
      }
      await fs.promises.mkdir(path.dirname(defaultCanvasPath), { recursive: true });
      await fs.promises.writeFile(defaultCanvasPath, `${JSON.stringify({ ...body, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
      await cleanupUnusedUploads(body);
      await cleanupUnusedHtmlPages(body);
      send(response, 200, { saved: true });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/admin/assets") {
      if (!isAdmin(request)) {
        send(response, 401, { message: "unauthorized" });
        return true;
      }
      const body = await readJson(request);
      const match = /^data:([^;]+);base64,(.+)$/.exec(body.dataUrl || "");
      if (!match || !match[1].startsWith("image/")) {
        send(response, 400, { message: "invalid image" });
        return true;
      }
      const fileName = safeUploadName(body.name, match[1]);
      await fs.promises.mkdir(uploadsDir, { recursive: true });
      await fs.promises.writeFile(path.join(uploadsDir, fileName), Buffer.from(match[2], "base64"));
      send(response, 200, { src: `uploads/${fileName}` });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/admin/html-assets") {
      if (!isAdmin(request)) {
        send(response, 401, { message: "unauthorized" });
        return true;
      }
      const body = await readJson(request);
      const name = String(body.name || "");
      const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/.exec(body.dataUrl || "");
      if (!match || !/\.html?$/i.test(name)) {
        send(response, 400, { message: "invalid html" });
        return true;
      }
      const content = Buffer.from(match[2], "base64");
      if (content.length > 2 * 1024 * 1024) {
        send(response, 413, { message: "html too large" });
        return true;
      }
      const id = `html-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const fileName = `${id}.html`;
      await fs.promises.mkdir(htmlPagesDir, { recursive: true });
      await fs.promises.writeFile(path.join(htmlPagesDir, fileName), content);
      const pages = await readHtmlPages();
      const item = {
        id,
        title: safeHtmlTitle(name),
        file: fileName,
        originalName: path.basename(name),
        createdAt: new Date().toISOString()
      };
      pages.unshift(item);
      await writeHtmlPages(pages);
      send(response, 200, { id, url: `/api/html-pages/${id}`, title: item.title });
      return true;
    }

    if (request.method === "POST" && pathname === "/api/admin/pdf") {
      if (!isAdmin(request)) {
        send(response, 401, { message: "unauthorized" });
        return true;
      }
      const body = await readJson(request);
      const target = pdfTargetPath(body.kind);
      const match = /^data:application\/pdf;base64,(.+)$/.exec(body.dataUrl || "");
      if (!target || !match) {
        send(response, 400, { message: "invalid pdf" });
        return true;
      }
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, Buffer.from(match[1], "base64"));
      send(response, 200, { saved: true });
      return true;
    }
  } catch (error) {
    send(response, error.message === "payload too large" ? 413 : 500, { message: error.message || "server error" });
    return true;
  }

  return false;
}

http.createServer(async (request, response) => {
  let pathname = decodeURIComponent(request.url.split("?")[0]);
  if (await handleApi(request, response, pathname)) return;
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end("forbidden");
    return;
  }
  fs.readFile(file, (error, buffer) => {
    if (error) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    response.end(buffer);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Preview server: http://127.0.0.1:${port}/index.html`);
  if (!process.env.ADMIN_PASSWORD) console.log("ADMIN_PASSWORD not set; using local default password: yitao@xiaohu");
});
