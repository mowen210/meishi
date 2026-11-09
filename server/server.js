/**
 * 餐饮图鉴 · 后端服务（零依赖，Node 14+ 直接跑）
 *
 *   node server.js                 # 默认 3000 端口，口令 change-me
 *   PORT=8080 ADMIN_TOKEN=xxx node server.js
 *
 * 数据：data/db.json      图片：uploads/（原图原样保存，不压缩、不限张数）
 * 接口：
 *   GET    /api/shops?q=&category=     列表（精简字段，含封面）
 *   GET    /api/shops/:id              详情（含全部图片）
 *   POST   /api/shops                  新增    [需口令]
 *   PUT    /api/shops/:id              修改    [需口令]
 *   DELETE /api/shops/:id              删除    [需口令]
 *   POST   /api/upload  (multipart file)  上传原图 [需口令]  -> {url}
 *   DELETE /api/upload?url=/files/xx   删除图片 [需口令]
 *   GET    /files/<name>               图片
 *   GET    /api/health                 健康检查
 *   GET    /                           网页管理端
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me";
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, "uploads");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_BODY = 64 * 1024 * 1024; // 单次请求上限 64MB（足够放原图）

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------------- 存储 ---------------- */
function loadDB() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw);
    if (!Array.isArray(db.shops)) db.shops = [];
    return db;
  } catch (e) {
    return { shops: [] };
  }
}
let db = loadDB();

function saveDB() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1), "utf8");
  fs.renameSync(tmp, DB_FILE); // 原子替换，避免写一半断电损坏
}

/* ---------------- 工具 ---------------- */
const MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic",
  ".mp4": "video/mp4", ".html": "text/html; charset=utf-8"
};

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type,x-admin-token",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
  });
  res.end(body);
}

function fail(res, code, msg) { json(res, code, { error: msg }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    req.on("data", c => {
      len += c.length;
      if (len > MAX_BODY) {
        reject(new Error("内容过大（单次上限 64MB）"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function authed(req, url) {
  const h = req.headers["x-admin-token"] || url.searchParams.get("token") || "";
  return h && h === ADMIN_TOKEN;
}

/* ---------------- multipart/form-data 解析（内存版，够用） ---------------- */
function parseMultipart(buf, boundary) {
  const delim = Buffer.from("--" + boundary);
  const parts = [];
  let pos = buf.indexOf(delim);
  if (pos < 0) return parts;
  pos += delim.length;
  for (;;) {
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break; // 结束标记 --
    if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2; else break;
    const next = buf.indexOf(delim, pos);
    if (next < 0) break;
    const chunk = buf.slice(pos, next - 2); // 去掉尾部 \r\n
    const hEnd = chunk.indexOf("\r\n\r\n");
    if (hEnd >= 0) {
      const head = chunk.slice(0, hEnd).toString("utf8");
      const body = chunk.slice(hEnd + 4);
      const name = /name="([^"]*)"/i.exec(head);
      const filename = /filename="([^"]*)"/i.exec(head);
      const ct = /content-type:\s*([^\r\n]+)/i.exec(head);
      parts.push({
        name: name ? name[1] : "",
        filename: filename ? filename[1] : null,
        contentType: ct ? ct[1].trim() : "",
        data: body
      });
    }
    pos = next + delim.length;
  }
  return parts;
}

/* ---------------- 字段清洗 ---------------- */
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};

function cleanShop(input, old) {
  const o = old || {};
  const dishes = Array.isArray(input.dishes)
    ? input.dishes
        .map(d => ({ name: str(d && d.name, 40), price: str(d && d.price, 20) }))
        .filter(d => d.name)
        .slice(0, 40)
    : o.dishes || [];
  const images = Array.isArray(input.images)
    ? input.images.filter(u => typeof u === "string" && /^\/files\/[A-Za-z0-9._-]+$/.test(u)).slice(0, 200)
    : o.images || [];
  return {
    id: o.id || crypto.randomUUID(),
    name: str(input.name, 60) || o.name || "未命名",
    category: str(input.category, 20) || o.category || "",
    address: str(input.address, 200) || o.address || "",
    phone: str(input.phone, 40) || o.phone || "",
    hours: str(input.hours, 60) || o.hours || "",
    note: str(input.note, 1000) || o.note || "",
    lat: String(input.lat || o.lat || ""),
    lng: String(input.lng || o.lng || ""),
    rating: input.rating === undefined ? (o.rating || 0) : num(input.rating, 0, 5),
    recommend: input.recommend === undefined ? (o.recommend || 0) : Math.round(num(input.recommend, 0, 5)),
    dishes,
    images,
    cover: images[0] || "",
    createdAt: o.createdAt || Date.now(),
    updatedAt: Date.now()
  };
}

function brief(s) {
  return {
    id: s.id, name: s.name, category: s.category, address: s.address, phone: s.phone,
    hours: s.hours, rating: s.rating, recommend: s.recommend, dishes: s.dishes,
    cover: s.cover, imageCount: (s.images || []).length, note: s.note,
    lat: s.lat, lng: s.lng, updatedAt: s.updatedAt
  };
}

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const p = decodeURIComponent(url.pathname);
  const method = (req.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-admin-token",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
    });
    return res.end();
  }

  try {
    /* ---- 健康检查 ---- */
    if (p === "/api/health") {
      return json(res, 200, { ok: true, shops: db.shops.length, version: 1, time: Date.now() });
    }

    /* ---- 列表 ---- */
    if (p === "/api/shops" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const cat = (url.searchParams.get("category") || "").trim();
      let list = db.shops.slice();
      if (cat && cat !== "全部") list = list.filter(s => s.category === cat);
      if (q) {
        list = list.filter(s => {
          const hay = [s.name, s.address, s.note, s.category, (s.dishes || []).map(d => d.name).join(" ")]
            .join(" ").toLowerCase();
          return hay.indexOf(q) >= 0;
        });
      }
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const cats = [];
      db.shops.forEach(s => { if (s.category && cats.indexOf(s.category) < 0) cats.push(s.category); });
      return json(res, 200, { total: list.length, categories: cats, shops: list.map(brief) });
    }

    /* ---- 详情 ---- */
    const mDetail = /^\/api\/shops\/([\w-]+)$/.exec(p);
    if (mDetail && method === "GET") {
      const s = db.shops.find(x => x.id === mDetail[1]);
      if (!s) return fail(res, 404, "商家不存在");
      return json(res, 200, s);
    }

    /* ---- 新增 ---- */
    if (p === "/api/shops" && method === "POST") {
      if (!authed(req, url)) return fail(res, 401, "缺少管理口令");
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const shop = cleanShop(body, null);
      db.shops.push(shop);
      saveDB();
      return json(res, 201, { id: shop.id, shop });
    }

    /* ---- 修改 ---- */
    if (mDetail && (method === "PUT" || method === "PATCH")) {
      if (!authed(req, url)) return fail(res, 401, "缺少管理口令");
      const idx = db.shops.findIndex(x => x.id === mDetail[1]);
      if (idx < 0) return fail(res, 404, "商家不存在");
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      db.shops[idx] = cleanShop(body, db.shops[idx]);
      saveDB();
      return json(res, 200, { shop: db.shops[idx] });
    }

    /* ---- 删除 ---- */
    if (mDetail && method === "DELETE") {
      if (!authed(req, url)) return fail(res, 401, "缺少管理口令");
      const idx = db.shops.findIndex(x => x.id === mDetail[1]);
      if (idx < 0) return fail(res, 404, "商家不存在");
      const [gone] = db.shops.splice(idx, 1);
      saveDB();
      // 顺手清理该商家独占的图片
      (gone.images || []).forEach(u => {
        const used = db.shops.some(s => (s.images || []).indexOf(u) >= 0);
        if (!used) removeFile(u);
      });
      return json(res, 200, { ok: true });
    }

    /* ---- 上传（原图不压缩） ---- */
    if (p === "/api/upload" && method === "POST") {
      if (!authed(req, url)) return fail(res, 401, "缺少管理口令");
      const ct = req.headers["content-type"] || "";
      const m = /boundary=([^;]+)/i.exec(ct);
      if (!m) return fail(res, 400, "需要 multipart/form-data");
      const buf = await readBody(req);
      const parts = parseMultipart(buf, m[1].trim());
      const file = parts.find(x => x.data && x.data.length);
      if (!file) return fail(res, 400, "没有收到文件");
      const ext = (path.extname(file.filename || "") || ".jpg").toLowerCase();
      if (!MIME[ext]) return fail(res, 400, "不支持的图片格式：" + ext);
      const name = crypto.randomUUID().replace(/-/g, "") + ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), file.data);
      return json(res, 200, { url: "/files/" + name, size: file.data.length, name: file.filename || name });
    }

    /* ---- 删除图片 ---- */
    if (p === "/api/upload" && method === "DELETE") {
      if (!authed(req, url)) return fail(res, 401, "缺少管理口令");
      const u = url.searchParams.get("url") || "";
      if (!/^\/files\/[A-Za-z0-9._-]+$/.test(u)) return fail(res, 400, "参数不合法");
      removeFile(u);
      db.shops.forEach(s => {
        s.images = (s.images || []).filter(x => x !== u);
        s.cover = s.images[0] || "";
      });
      saveDB();
      return json(res, 200, { ok: true });
    }

    /* ---- 图片 / 静态 ---- */
    if (p.startsWith("/files/")) {
      const name = p.slice("/files/".length);
      if (!/^[A-Za-z0-9._-]+$/.test(name)) return fail(res, 400, "参数不合法");
      const file = path.join(UPLOAD_DIR, name);
      if (!file.startsWith(UPLOAD_DIR) || !fs.existsSync(file)) return fail(res, 404, "文件不存在");
      const stat = fs.statSync(file);
      res.writeHead(200, {
        "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "content-length": stat.size,
        "cache-control": "public, max-age=31536000, immutable",
        "access-control-allow-origin": "*"
      });
      return fs.createReadStream(file).pipe(res);
    }

    /* ---- 网页管理端 ---- */
    if (p === "/" || p === "/admin") {
      const body = Buffer.from(ADMIN_HTML, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": body.length });
      return res.end(body);
    }

    return fail(res, 404, "接口不存在");
  } catch (e) {
    console.error("[ERR]", req.method, p, e.message);
    return fail(res, 500, e.message || "服务器内部错误");
  }
});

function removeFile(url) {
  const name = String(url || "").replace("/files/", "");
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return;
  const f = path.join(UPLOAD_DIR, name);
  if (f.startsWith(UPLOAD_DIR)) fs.promises.unlink(f).catch(() => {});
}

const ADMIN_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>餐饮图鉴 · 管理端</title>
<style>
:root{--red:#7A1024;--edge:#E6DDD2;--cream:#FCFAF7}
*{box-sizing:border-box}
body{margin:0;font:15px/1.6 "微软雅黑",sans-serif;background:#F6F2EC;color:#1F1F1F}
header{background:linear-gradient(135deg,#7A1024,#8E1B30);color:#fff;padding:16px 18px}
header h1{margin:0;font-size:18px}
header div{font-size:12.5px;opacity:.8;margin-top:3px}
.wrap{max-width:1000px;margin:0 auto;padding:16px}
.bar{display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
input{border:1px solid var(--edge);border-radius:10px;padding:9px 12px;background:#fff;font:inherit;min-width:180px}
button{border:1px solid var(--edge);background:#fff;border-radius:10px;padding:9px 14px;font:inherit;cursor:pointer}
button.primary{background:var(--red);color:#fff;border-color:var(--red)}
.list{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.card{background:#fff;border:1px solid var(--edge);border-radius:14px;overflow:hidden}
.card .cov{height:140px;background:#EEE8E0 center/cover no-repeat}
.card .b{padding:11px 13px}
.card h3{margin:0 0 4px;font-size:16px}
.meta{font-size:12.5px;color:#7A7A7A}
.dish{font-size:12.5px;color:#4A4A4A;margin-top:4px}
.acts{display:flex;gap:8px;margin-top:9px}
.note{font-size:12px;color:#8C8C8C;margin:0 0 10px}
</style></head><body>
<header><h1>餐饮图鉴 · 管理端</h1><div id="stat">加载中…</div></header>
<div class="wrap">
  <div class="bar">
    <input id="token" placeholder="管理口令（ADMIN_TOKEN）" type="password">
    <button class="primary" id="reload">刷新列表</button>
    <input id="q" placeholder="搜索名称 / 地址 / 招牌菜">
  </div>
  <p class="note">新增和编辑请在小程序里操作；这里用于查看、搜索和删除。图片为服务器上的原图。</p>
  <div class="list" id="list"></div>
</div>
<script>
var $ = function(s){ return document.querySelector(s); };
function getToken(){ return localStorage.getItem("admin_token") || ""; }
$("#token").value = getToken();
$("#token").onchange = function(){ localStorage.setItem("admin_token", this.value.trim()); };
$("#reload").onclick = load;
$("#q").oninput = function(){ load(); };
function stars(n){ n = Math.round(n||0); return "★★★★★".slice(0,n) + "☆☆☆☆☆".slice(0,5-n); }
async function load(){
  var q = encodeURIComponent($("#q").value.trim());
  var r = await fetch("/api/shops?q=" + q);
  var d = await r.json();
  $("#stat").textContent = "共 " + d.total + " 家商家";
  $("#list").innerHTML = d.shops.map(function(s){
    return '<div class="card">' +
      (s.cover ? '<div class="cov" style="background-image:url(' + s.cover + ')"></div>' : "") +
      '<div class="b"><h3>' + esc(s.name) + '</h3>' +
      '<div class="meta">' + esc(s.category||"未分类") + ' · ' + (s.rating||0) + '分 ' + stars(s.recommend) + '</div>' +
      '<div class="meta">' + esc(s.phone||"") + '</div>' +
      '<div class="meta">' + esc(s.address||"") + '</div>' +
      (s.dishes&&s.dishes.length ? '<div class="dish">招牌：' + s.dishes.map(function(x){return esc(x.name)}).join("、") + '</div>' : "") +
      '<div class="meta">图片 ' + s.imageCount + ' 张</div>' +
      '<div class="acts"><button onclick="del(\\'' + s.id + '\\')">删除</button></div>' +
      '</div></div>';
  }).join("") || '<p class="note">还没有商家</p>';
}
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]; }); }
async function del(id){
  if (!confirm("确定删除这家商家？")) return;
  var r = await fetch("/api/shops/" + id, { method: "DELETE", headers: { "x-admin-token": getToken() } });
  if (!r.ok) { var d = await r.json(); return alert(d.error || ("删除失败 " + r.status)); }
  load();
}
load();
</script></body></html>`;

server.listen(PORT, () => {
  console.log("餐饮图鉴 后端已启动  http://127.0.0.1:" + PORT + "/");
  console.log("管理口令：" + (ADMIN_TOKEN === "change-me" ? "change-me（上线前务必改！）" : ADMIN_TOKEN));
  console.log("图片目录：" + UPLOAD_DIR);
  console.log("数据文件：" + DB_FILE);
});
