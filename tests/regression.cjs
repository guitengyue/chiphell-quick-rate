const { JSDOM } = require(process.env.CHH_JSDOM || "jsdom");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const scripts = JSON.parse(read("manifest.json")).content_scripts[0].js.map(read).join("\n");
const header = '<div id="um"><strong><a href="space-uid-7.html">me</a></strong></div>';
const pages = '<div class="pg"><a href="thread-99-2-1.html">2</a></div>';
const date = "2026-11-17";
const serverDate = "Wed, 18 Nov 2026 04:00:00 GMT";

function post(pid, uid, posted = date, time = "42 小时", eligible = true) {
  const info = time ? '<dl><dt>在线时间</dt><dd>' + time + '</dd></dl>' : "";
  const link = eligible ? '<a onclick="showWindow(\'rate\', \'forum.php?mod=misc&action=rate&tid=99&pid=' + pid + '\')">评分</a>' : "";
  return '<table id="pid' + pid + '"><tr><td class="pls"><div class="authi"><a href="home.php?mod=space&uid=' + uid + '">user' + uid + '</a></div>' + info + '</td><td><em id="authorposton' + pid + '"><span title="' + posted + '">发表于</span></em>' + link + '</td></tr></table>';
}
function logs(uid) {
  return '<table class="list"><tr><th>积分</th><th>时间</th><th>评分人</th></tr><tr><td>+5</td><td>today</td><td><a href="home.php?mod=space&uid=' + uid + '">user</a></td></tr></table>';
}
function pager(pid, page, targetPid = pid) {
  return '<div class="pg"><strong>' + page + '</strong><a href="forum.php?mod=misc&action=viewratings&tid=99&pid=' + targetPid + '&page=' + (page === 1 ? 2 : 1) + '">翻页</a></div>';
}
const empty = '<div class="alert_info"><p>抱歉，指定帖子在近一年内没有评分记录</p></div>';
function rateForm(pid, remaining = 100) {
  return '<form id="rateform" action="forum.php?mod=misc&action=rate&ratesubmit=yes"><input name="pid" value="' + pid + '"><input name="tid" value="99"><input name="formhash" value="test"><table><tr><th>积分</th><th>分数</th><th>范围</th><th>今日剩余</th></tr><tr><td>邪恶指数</td><td><input name="score1"></td><td>1 ~ 10</td><td>' + remaining + '</td></tr></table><input name="reason"><input type="checkbox" name="sendreasonpm"><div class="o pns"></div></form>';
}
function response(html, ajax = false) {
  return new Response(ajax ? '<?xml version="1.0"?><root><![CDATA[' + html + ']]></root>' : html,
    { headers: { "content-type": "text/html; charset=UTF-8", date: serverDate } });
}

// Run the actual service worker in its own context so its claim and storage operations are tested.
function extension() {
  const db = {};
  const local = {
    get: async key => ({ [key]: db[key] }),
    set: async value => Object.assign(db, value)
  };
  let worker;
  const locks = new Map();
  const runtime = { id: "test-ext", onMessage: { addListener(fn) { worker = fn; } } };
  vm.runInNewContext(read("background.js"), { chrome: { runtime, storage: { local } }, navigator: { locks: {
    request(key, fn) {
      const next = (locks.get(key) || Promise.resolve()).then(fn);
      locks.set(key, next);
      return next;
    }
  } } });
  function claim(msg, host = "www.chiphell.com") {
    return new Promise(resolve => worker(msg, { id: "test-ext", url: "https://" + host + "/" }, resolve));
  }
  return { local, db, claim };
}
async function waitFor(test) {
  for (let i = 0; i < 450; i++) {
    if (test()) return;
    await new Promise(resolve => setTimeout(resolve, 4));
  }
  throw Error("timeout waiting for test result");
}

function setup(html, page, fetch, options = {}) {
  const dom = new JSDOM(html, { url: "https://www.chiphell.com/thread-99-" + page + "-1.html", runScripts: "outside-only" });
  const w = dom.window;
  const ext = extension();
  let message, changed;
  w.TextDecoder = TextDecoder;
  w.fetch = fetch;
  w.AbortSignal = AbortSignal;
  const timer = w.setTimeout.bind(w);
  w.requestAnimationFrame = fn => timer(fn, 0);
  w.setTimeout = fn => timer(fn, 0);
  w.CSS = { escape: String };
  w.navigator.locks = { request: (_name, _options, fn) => fn({}) };
  w.chrome = { storage: { local: ext.local, sync: { get: (d, cb) => cb({ ...d, ...options }) },
    onChanged: { addListener(fn) { changed = fn; } } },
    runtime: { sendMessage: ext.claim, onMessage: { addListener(fn) { message = fn; } } } };
  w.confirm = () => true;
  w.eval(scripts);
  return { w, ext, message, changed, close: () => w.close() };
}

async function scenario(mode) {
  const old = ["old", "month"].includes(mode);
  const mixed = ["old", "month", "malformed", "wrongpager", "badxml", "nodate", "conflict"].includes(mode);
  const startPage = mode === "page2" ? 2 : 1;
  const pid = "60690508";
  let first = header + pages + post(1, 7) + post(pid, 8, mode === "nodate" ? "" : old ? (mode === "month" ? "2026-08-01" : "2024-01-01") : date);
  if (mode === "conflict") first = first.replace(/(<\/td><\/tr><\/table>)$/, '<div id="post_rate_div_60690508"><a href="space-uid-44.html">user44</a></div>$1');
  const second = header + pages + post(3, 8, date, "4 小时", mode !== "hidden") + (mixed ? post(4, 9) : "");
  const submits = [], checked = [], bodies = [];
  const committed = new Set();
  const app = setup(startPage === 2 ? second : first, startPage, async (input, opts = {}) => {
    const url = new URL(input);
    if (url.searchParams.has("authorid")) {
      const uid = url.searchParams.get("authorid");
      const doc = new JSDOM(first + second).window.document;
      return response(header + [...doc.querySelectorAll('table[id^="pid"]')].filter(p =>
        p.querySelector(".authi a")?.getAttribute("href").endsWith("uid=" + uid)).map(p => p.outerHTML).join(""));
    }
    if (url.pathname.includes("thread-")) return response(url.pathname.includes("-2-1") ? second : first);
    const id = url.searchParams.get("pid");
    if (url.searchParams.get("action") === "viewratings") {
      checked.push(id);
      if (mode === "network") throw Error("timeout");
      if (committed.has(id)) return response(logs(7), true);
      if (id === pid) {
        if (mode === "malformed") return response("<p>无法识别的页面</p>", true);
        if (mode === "badxml") return response("<root><![CDATA[");
        if (mode === "month") return response(empty.replace("一年", "一个月"), true);
        if (mode === "challenge") return response("<p>请先登录</p>", true);
        if (mode === "wrongpager") return response(logs(77) + pager(id, 1, "999"), true);
        if (mode === "pagination" || mode === "allpages") {
          const page = Number(url.searchParams.get("page") || 1);
          return response(logs(page === 2 && mode === "pagination" ? 7 : 77) + pager(id, page), true);
        }
      }
      if (mode === "hidden" && id === "3") return response(logs(7), true);
      return response(empty, true);
    }
    if (opts.method === "POST") {
      const body = new URLSearchParams(opts.body);
      const target = body.get("pid");
      submits.push(target);
      bodies.push(body);
      assert.equal(app.ext.db["chh-rated:7:99:" + (target === "4" ? 9 : 8)].state, "pending");
      committed.add(target);
      if (mode === "lost-post") throw Error("connection lost");
      return response("<p>操作成功</p>", true);
    }
    return response(rateForm(id), true);
  }, { blessingsEnabled: mode !== "off" });
  async function run() {
    app.message({ type: "CHH_BULK_RATE", scope: mode === "page2" ? "page" : "thread" }, {}, () => {});
    await new Promise(r => setTimeout(r, 8));
    await waitFor(() => app.w.document.querySelector(".chh-bulk-cancel")?.hidden);
  }
  try {
    await run();
    const doc = app.w.document;
    const result = doc.querySelector(".chh-bulk-status").textContent;
    if (["hidden", "pagination", "network", "challenge"].includes(mode)) assert.deepEqual(submits, []);
    else if (mixed) {
      assert.deepEqual(submits, ["4"], "only the unrelated, verified author may be rated");
      assert.match(doc.querySelector(".chh-review").textContent, /UID 8.*60690508/);
      assert.match(doc.querySelector(".chh-bulk-counts").textContent, /成功 1 · 跳过 1/);
    } else assert.deepEqual(submits, [mode === "page2" ? "3" : pid]);
    if (["network", "lost-post", "challenge"].includes(mode)) assert.match(result, /停止/);
    else assert.equal(result, "批量评分完成");
    if (mode === "hidden") assert.ok(checked.includes("3"), "must check the other-page floor without a rate button");
    if (mode === "pagination") assert.equal(checked.filter(i => i === pid).length, 2);
    for (const body of bodies) {
      assert.equal(body.get("score1"), "5");
      assert.equal(body.get("sendreasonpm"), "on");
      if (mode === "off") assert.equal(body.get("reason"), "");
      else assert.ok(body.get("reason").length > 0);
    }
    const count = submits.length;
    await run();
    assert.equal(submits.length, count, "repeat must not submit again");
  } finally { app.close(); }
  console.log("PASS", mode);
}

async function quotaScenario(total, score, expected, opts = {}) {
  const ids = Array.from({ length: 80 }, (_, index) => 100 + index);
  const pageVisits = [], submitted = new Set(), checked = new Set(), confirms = [];
  let quoteCount = 0;
  const pageHtml = page => header +
    '<div class="pg"><strong>' + page + '</strong><a href="thread-99-4-1.html">4</a></div>' +
    ids.slice((page - 1) * 20, page * 20).map(id => post(id, id)).join("");
  const app = setup(pageHtml(1), 1, async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.includes("thread-")) {
      const page = Number(url.pathname.split("-")[2]);
      pageVisits.push(page);
      return response(pageHtml(page));
    }
    if (url.searchParams.has("authorid")) {
      const id = Number(url.searchParams.get("authorid"));
      return response(header + post(id, id));
    }
    const id = url.searchParams.get("pid");
    if (url.searchParams.get("action") === "viewratings") {
      checked.add(id);
      if (submitted.has(id) || (opts.skipFirst && id === "100")) return response(logs(7), true);
      if (opts.noSession) return response('<form name="login" id="loginform_example"></form>', true);
      if (opts.unreadable) return response("<div>无法获取明细</div>", true);
      if (opts.fullPage && url.searchParams.has("inajax")) return response("<div>未知格式</div>", true);
      if (opts.fullPage) return response('<div id="messagetext"><p>抱歉，指定帖子在近一年内没有评分记录</p><p>返回上一页</p></div>');
      return response('抱歉，指定帖子在近一年内没有评分记录<script>void(0)</script>', true);
    }
    if (options.method === "POST") {
      const data = new URLSearchParams(options.body);
      assert.ok(!submitted.has(data.get("pid")));
      assert.equal(data.get("score1"), String(score));
      submitted.add(data.get("pid"));
      return response("<p>成功</p>", true);
    }
    quoteCount++;
    const remaining = opts.drop && quoteCount > 1 ? 1 : total - submitted.size * score;
    return response(rateForm(id, opts.manual ? "—" : remaining), true);
  }, { score });
  app.w.confirm = message => { confirms.push(message); return !opts.cancel; };
  app.w.prompt = () => String(total);
  try {
    app.message({ type: "CHH_BULK_RATE", scope: "thread" }, {}, () => {});
    await waitFor(() => app.w.document.querySelector(".chh-bulk-cancel")?.hidden);
    const status = app.w.document.querySelector(".chh-bulk-status").textContent;
    assert.equal(submitted.size, expected, status);
    assert.deepEqual(pageVisits, opts.pages ?? (total < score || opts.cancel ? [] : [1]));
    if (!total || total < score || opts.cancel) assert.equal(checked.size, 0);
    if (opts.noSession) assert.match(status, /登录或验证/);
    else if (opts.unreadable) {
      assert.match(status, /核查人数上限/);
      assert.equal(checked.size, Math.floor(total / score));
    }
    else if (!opts.cancel) assert.match(status, /额度不足/);
    if (total >= score) assert.match(confirms[0], new RegExp("最多可加 " + Math.floor(Math.min(100,total)/score) + " 人"));
  } finally { app.close(); }
  console.log("PASS quota", total, score, expected, JSON.stringify(opts));
}


async function ui() {
  const lookups = [];
  const html = header + post(1, 8, date, "0 小时") + post(2, 9, date, "") + post(3, 9, date, "") + post(4, 10, date, "") + rateForm(2);
  const app = setup(html, 1, async input => {
    const uid = new URL(input).searchParams.get("uid");
    lookups.push(uid);
    return response('<div class="u_profile"><h2>user (UID: 9)</h2><ul><li><em>在线时间</em>753 小时</li></ul></div>');
  });
  try {
    const doc = app.w.document;
    const reasons = doc.querySelector("[name=reason]");
    assert.ok(reasons.value);
    app.changed({ blessingsEnabled: { newValue: false } }, "sync");
    assert.equal(reasons.value, "");
    assert.ok([...doc.querySelectorAll(".chh-quick-rate-button")].every(el => el.textContent === "+5 加分"));
    reasons.value = "我手写的理由";
    app.message({ type: "CHH_QUICK_RATE_APPLY" }, {}, () => {});
    assert.equal(reasons.value, "我手写的理由");
    await waitFor(() => doc.querySelector("#pid4 .chh-online-time")?.textContent === "在线时间未知");
    assert.deepEqual([...doc.querySelectorAll(".chh-online-time")].map(el => el.textContent),
      ["在线 0 小时", "在线 753 小时", "在线 753 小时", "在线时间未知"]);
    assert.deepEqual(lookups, ["9", "10"]);
    const later = doc.createElement("div");
    later.innerHTML = post(5, 9, date, "");
    doc.body.append(later);
    await waitFor(() => later.querySelector(".chh-online-time")?.textContent === "在线 753 小时");
    assert.deepEqual(lookups, ["9", "10"]);
  } finally { app.close(); }
  console.log("PASS single-rating toggle, online hours, profile UID, cache and dynamic floors");
}

async function popup() {
  const dom = new JSDOM(read("popup.html"), { runScripts: "outside-only" });
  const w = dom.window;
  let saved;
  w.chrome = { storage: { sync: { get: (defaults, cb) => cb(defaults), set: (values, cb) => { saved = values; cb(); } } } };
  w.eval(read("popup.js"));
  const toggle = w.document.querySelector("#blessingsEnabled");
  assert.equal(toggle.checked, true);
  toggle.click();
  assert.equal(saved.blessingsEnabled, false);
  assert.equal(w.document.querySelector("#apply").textContent, "重新填写分数");
  dom.window.close();
  console.log("PASS popup setting and label");
}

(async () => {
  for (const mode of ["success", "off", "page2", "hidden", "pagination", "allpages", "old", "month", "malformed", "wrongpager", "badxml", "nodate", "conflict", "network", "challenge", "lost-post"]) await scenario(mode);
  await quotaScenario(100, 5, 20);
  await quotaScenario(100, 5, 20, { skipFirst: true, pages: [1,2] });
  await quotaScenario(23, 5, 4, { skipFirst: true, fullPage: true });
  await quotaScenario(23, 10, 2);
  await quotaScenario(4, 5, 0);
  await quotaScenario(0, 5, 0);
  await quotaScenario(23, 5, 0, { drop: true });
  await quotaScenario(23, 5, 0, { cancel: true });
  await quotaScenario(8, 5, 1, { manual: true });
  await quotaScenario(23, 5, 0, { noSession: true });
  await quotaScenario(100, 5, 0, { unreadable: true });
  await ui();
  await popup();
  const ext = extension();
  const msg = { type: "CHH_RESERVE_RATING", me: "7", uid: "8", tid: "99", pid: "2" };
  const results = await Promise.all([ext.claim(msg), ext.claim({ ...msg, pid: "3" }, "chiphell.com")]);
  assert.equal(results.filter(result => result.reserved).length, 1);
  assert.equal((await ext.claim({ ...msg, me: "11" })).reserved, true);
  assert.equal((await ext.claim({ ...msg, tid: "100" })).reserved, true);
  console.log("PASS concurrent reservations and independent account/thread keys");
})().catch(error => { console.error(error); process.exitCode = 1; });
