/* 餐饮图鉴 · 前台 */
"use strict";

const $ = s => document.querySelector(s);
const state = { q: "", category: "", sort: "updated", shops: [], categories: [], total: 0 };

/* ---------- 小工具 ---------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function stars(n) {
  const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return '<span class="stars">' + "★".repeat(k) + '<span class="off">' + "★".repeat(5 - k) + "</span></span>";
}
function timeAgo(ms) {
  if (!ms) return "";
  const d = Math.floor((Date.now() - ms) / 1000);
  if (d < 60) return "刚刚";
  if (d < 3600) return Math.floor(d / 60) + " 分钟前";
  if (d < 86400) return Math.floor(d / 3600) + " 小时前";
  if (d < 86400 * 30) return Math.floor(d / 86400) + " 天前";
  return new Date(ms).toLocaleDateString("zh-CN");
}
function coverTag(url, name, cls) {
  const ch = esc((name || "食").slice(0, 1));
  return '<div class="' + (cls || "cover") + '">' +
    '<div class="ph">' + ch + "</div>" +
    (url ? '<img src="' + esc(url) + '" alt="' + esc(name) + '" loading="lazy" onerror="this.remove()">' : "") +
    "</div>";
}

/* ---------- 渲染 ---------- */
function renderStats(s) {
  $("#stats").innerHTML =
    '<div class="stat"><b>' + s.shops + '</b><span>家商家</span></div>' +
    '<div class="stat"><b>' + s.images + '</b><span>张实拍</span></div>' +
    '<div class="stat"><b>' + s.dishes + '</b><span>道招牌菜</span></div>' +
    '<div class="stat"><b>' + (s.avgRating || 0).toFixed(1) + '</b><span>平均分 / 5</span></div>';
}

function renderChips() {
  const all = ["全部"].concat(state.categories);
  $("#chips").innerHTML = all.map(c =>
    '<button class="chip' + ((state.category === c || (c === "全部" && !state.category)) ? " on" : "") +
    '" data-cat="' + esc(c) + '">' + esc(c) + "</button>"
  ).join("");
}

function renderList() {
  const grid = $("#grid");
  if (!state.shops.length) {
    grid.innerHTML = '<div class="empty"><div class="big">🥢</div>' +
      (state.q || state.category
        ? "<b>没找到符合条件的小店</b><p>换个关键词，或点「全部」看看别的。</p>"
        : "<b>册子还是空的</b><p>去「管理端」登记第一家店吧。</p>") + "</div>";
    return;
  }
  grid.innerHTML = state.shops.map(s => {
    const dishes = (s.dishes || []).slice(0, 3).map(d =>
      '<span class="dish">' + esc(d.name) + (d.price ? " ¥" + esc(d.price) : "") + "</span>"
    ).join("");
    return '<button class="card" data-id="' + esc(s.id) + '" aria-label="查看 ' + esc(s.name) + '">' +
      coverTag(s.cover, s.name) +
      (s.category ? '<span class="badge-cat">' + esc(s.category) + "</span>" : "") +
      (s.imageCount ? '<span class="badge-img">图 ' + s.imageCount + "</span>" : "") +
      '<div class="body">' +
        "<h3>" + esc(s.name) + "</h3>" +
        '<div class="rate"><b>' + (s.rating || 0).toFixed(1) + "</b>" + stars(s.rating) +
          '<span style="color:var(--ink-3);font-size:12px">推荐 ' + (s.recommend || 0) + "/5</span></div>" +
        '<div class="addr">' + esc(s.address || "地址待补") + "</div>" +
        (dishes ? '<div class="dishes">' + dishes + "</div>" : "") +
        '<div class="foot"><span>' + esc(s.phone || "无电话") + "</span><span>" + timeAgo(s.updatedAt) + "</span></div>" +
      "</div></button>";
  }).join("");
}

/* ---------- 取数 ---------- */
async function load() {
  $("#count").textContent = "正在翻册子…";
  const qs = new URLSearchParams({ q: state.q, category: state.category, sort: state.sort, pageSize: "200" });
  try {
    const r = await fetch("/api/shops?" + qs);
    const d = await r.json();
    if (!r.ok) throw Object.assign(new Error(d.error || "加载失败"), { payload: d, status: r.status });
    state.shops = d.shops || [];
    state.categories = d.categories || [];
    state.total = d.total || 0;
    renderChips();
    renderList();
    $("#count").textContent = state.total
      ? "共 " + state.total + " 家" + (state.q || state.category ? "（已筛选）" : "") + " · 点卡片看详情"
      : "还没有记录";
  } catch (e) {
    $("#grid").innerHTML =
      '<div class="errorbox"><h3>没能连上数据库</h3>' +
      "<div>" + esc(e.message) + "</div>" +
      (e.payload && e.payload.hint ? '<div class="hint">' + esc(e.payload.hint) + "</div>" : "") +
      '<pre>1) 启动 MySQL：net start mysql（Windows）/ systemctl start mysql（Linux）\n' +
      "2) 建库导入：mysql -u root -p &lt; sql/schema.sql\n" +
      "3) 配好 .env 后重启：npm start</pre></div>";
    $("#count").textContent = "加载失败";
  }
}

async function loadStats() {
  try {
    const r = await fetch("/api/stats");
    if (r.ok) renderStats(await r.json());
  } catch (_) { /* 统计失败不影响列表 */ }
}

/* ---------- 详情 ---------- */
async function openDetail(id) {
  const overlay = $("#overlay");
  const sheet = $("#sheet");
  sheet.innerHTML = '<div style="padding:40px;text-align:center;color:var(--ink-3)">正在打开…</div>';
  overlay.classList.add("on");
  document.body.style.overflow = "hidden";
  try {
    const r = await fetch("/api/shops/" + encodeURIComponent(id));
    const s = await r.json();
    if (!r.ok) throw new Error(s.error || "打不开");
    sheet.innerHTML = detailHTML(s);
    if (location.hash !== "#" + s.id) history.replaceState(null, "", "#" + s.id);
  } catch (e) {
    sheet.innerHTML = '<div style="padding:40px;text-align:center">' +
      '<p style="color:var(--wine)">' + esc(e.message) + "</p>" +
      '<button class="btn" onclick="closeDetail()">关闭</button></div>';
  }
}

function detailHTML(s) {
  const imgs = s.images || [];
  const main = '<div class="gal-main">' +
    '<div class="ph-main">' + esc((s.name || "食").slice(0, 1)) + "</div>" +
    (imgs.length
      ? '<img class="main" id="mainImg" src="' + esc(imgs[0]) + '" alt="' + esc(s.name) + '" onerror="this.remove()">'
      : "") +
    "</div>";
  const thumbs = imgs.length > 1
    ? '<div class="thumbs">' + imgs.map((u, i) =>
        '<img src="' + esc(u) + '" alt="图 ' + (i + 1) + '" class="' + (i === 0 ? "on" : "") +
        '" data-src="' + esc(u) + '" onerror="this.remove()">').join("") + "</div>"
    : "";

  const dishes = (s.dishes || []).length
    ? '<div class="sect"><h4>招牌菜</h4><div class="dishgrid">' +
      s.dishes.map(d => '<div class="dishcard"><span>' + esc(d.name) + "</span><span>" +
        (d.price ? "¥" + esc(d.price) : "") + "</span></div>").join("") + "</div></div>"
    : "";

  const kv = [];
  if (s.address) kv.push("<dt>地址</dt><dd>" + esc(s.address) + "</dd>");
  if (s.phone) kv.push("<dt>电话</dt><dd><a href=\"tel:" + esc(s.phone.replace(/\s/g, "")) + "\">" + esc(s.phone) + "</a></dd>");
  if (s.hours) kv.push("<dt>营业</dt><dd>" + esc(s.hours) + "</dd>");
  kv.push("<dt>评分</dt><dd>" + (s.rating || 0).toFixed(1) + " / 5 " + stars(s.rating) + "</dd>");
  kv.push("<dt>推荐</dt><dd>" + "★".repeat(s.recommend || 0) + '<span style="color:#e2d6c6">' +
    "★".repeat(5 - (s.recommend || 0)) + "</span> " + (s.recommend || 0) + " / 5</dd>");
  if (s.lat && s.lng) {
    kv.push("<dt>坐标</dt><dd>" + esc(s.lat) + ", " + esc(s.lng) +
      ' <a class="linkbtn" target="_blank" rel="noopener" href="https://uri.amap.com/marker?position=' +
      esc(s.lng) + "," + esc(s.lat) + "&name=" + encodeURIComponent(s.name) + '">高德地图打开</a></dd>');
  }

  return '<div class="gallery">' + main + thumbs +
    '<button class="close-x" onclick="closeDetail()" aria-label="关闭">×</button></div>' +
    '<div class="detail">' +
      '<div class="top"><h2>' + esc(s.name) + "</h2>" +
        (s.category ? '<span class="tag">' + esc(s.category) + "</span>" : "") + "</div>" +
      '<dl class="kv">' + kv.join("") + "</dl>" +
      (s.note ? '<div class="note">' + esc(s.note) + "</div>" : "") +
      dishes +
      '<div class="sect" style="color:var(--ink-3);font-size:12.5px">更新于 ' +
        new Date(s.updatedAt || Date.now()).toLocaleString("zh-CN") + " · 共 " + imgs.length + " 张图</div>" +
    "</div>";
}

function closeDetail() {
  $("#overlay").classList.remove("on");
  document.body.style.overflow = "";
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
}

/* ---------- 事件 ---------- */
let timer;
$("#q").addEventListener("input", e => {
  clearTimeout(timer);
  const v = e.target.value.trim();
  timer = setTimeout(() => { state.q = v; load(); }, 240);
});
$("#sort").addEventListener("change", e => { state.sort = e.target.value; load(); });
$("#chips").addEventListener("click", e => {
  const b = e.target.closest(".chip");
  if (!b) return;
  const c = b.dataset.cat;
  state.category = c === "全部" ? "" : c;
  load();
});
$("#grid").addEventListener("click", e => {
  const card = e.target.closest(".card");
  if (card) openDetail(card.dataset.id);
});
$("#overlay").addEventListener("click", e => {
  if (e.target.id === "overlay") closeDetail();
  const t = e.target.closest(".thumbs img");
  if (t) {
    const img = $("#mainImg");
    if (img) img.src = t.dataset.src;
    document.querySelectorAll(".thumbs img").forEach(x => x.classList.toggle("on", x === t));
  }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeDetail(); });

/* ---------- 启动 ---------- */
loadStats();
load();
if (/^#[0-9a-f-]{8,}$/i.test(location.hash)) openDetail(location.hash.slice(1));
