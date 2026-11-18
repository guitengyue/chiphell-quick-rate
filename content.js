(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    blessingsEnabled: true,
    score: 5,
    notifyAuthor: true,
    autoSubmit: false,
    bulkDelay: 1500
  };

  const BLESSINGS = [
    "愿你所行皆坦途，所遇皆美好！", "祝你每天都有新惊喜，事事皆顺心！",
    "愿好运常伴，快乐常在！", "祝生活明朗，万事可期！", "愿所有美好都如约而至！",
    "祝你一路有花开，处处有好景！", "愿你心有暖阳，日日欢喜！", "祝平安喜乐，好运连连！",
    "愿忙有所获，闲有所乐！", "祝你所愿皆所得，所盼皆所期！", "愿每一份努力都有温柔的回响！",
    "祝新的一天元气满满，诸事顺遂！", "愿日子常新，未来不远！", "祝你眼里有光，心中有梦！",
    "愿生活有趣，岁月静好！", "祝你一路向前，收获满满！", "愿好心情每天准时营业！",
    "祝所念之人平安，所想之事顺遂！", "愿快乐不止今天，好运不止此刻！", "祝你前路明亮，万事胜意！",
    "愿每个平凡的日子都闪闪发光！", "祝你有盼头、有收获，也有好心情！", "愿清风常伴，好事常来！",
    "祝你一切尽意，百事从欢！", "愿今天的好心情延续到很久以后！", "祝你常有小确幸，偶遇大惊喜！",
    "愿你一路从容，万事皆有回音！", "祝日常有趣，未来值得期待！", "愿每次出发都有新的收获！",
    "祝你心之所向，行之所往！"
  ];

  let settings = { ...DEFAULTS };
  let lastBlessing = "";
  let mutationQueued = false;
  let bulkJob = null;
  let pausedThread = null;
  const ratedAuthors = new Set();

  function currentUid(doc = document) {
    return uidFromLink(doc.querySelector('#um strong a[href*="uid"], #um a[href*="space-uid-"]'));
  }
  const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  function dispatchFieldEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function randomBlessing() {
    const choices = BLESSINGS.filter((item) => item !== lastBlessing);
    const blessing = choices[Math.floor(Math.random() * choices.length)] || BLESSINGS[0];
    lastBlessing = blessing;
    return blessing;
  }

  function normalizeScore(value) {
    const score = Number.parseInt(value, 10);
    return Number.isFinite(score) ? Math.min(10, Math.max(1, score)) : DEFAULTS.score;
  }

  function normalizeDelay(value) {
    const delay = Number.parseInt(value, 10);
    return Number.isFinite(delay) ? Math.min(10000, Math.max(800, delay)) : DEFAULTS.bulkDelay;
  }

  function fillRateForm(form, force = false) {
    if (!settings.enabled || (!force && form.dataset.chhQuickRateFilled === "true")) return false;
    const scoreInput = form.querySelector('input[name="score1"], #score1');
    const reasonInput = form.querySelector('input[name="reason"], #reason');
    const notifyInput = form.querySelector('input[name="sendreasonpm"], #sendreasonpm');
    if (!scoreInput || !reasonInput) return false;

    const score = normalizeScore(settings.score);
    const blessing = settings.blessingsEnabled ? randomBlessing() : "";
    scoreInput.value = String(score);
    dispatchFieldEvents(scoreInput);
    if (blessing || (form.dataset.chhBlessing && reasonInput.value === form.dataset.chhBlessing)) {
      reasonInput.value = blessing;
      dispatchFieldEvents(reasonInput);
    }
    form.dataset.chhBlessing = blessing;
    if (notifyInput) {
      notifyInput.checked = Boolean(settings.notifyAuthor);
      dispatchFieldEvents(notifyInput);
    }

    form.dataset.chhQuickRateFilled = "true";
    showFilledStatus(form, score, blessing);
    // Automatic submissions only run through the checked batch path.
    return true;
  }

  function showFilledStatus(form, score, blessing) {
    let status = form.querySelector(".chh-quick-rate-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "chh-quick-rate-status";
      const footer = form.querySelector(".o.pns") || form.lastElementChild;
      footer?.before(status);
    }
    status.textContent = `已自动填写 +${score}${blessing ? "：" + blessing : ""}`;
  }

  const rateLinkSelector = 'a[onclick*="action=rate"], a[onclick*="showWindow"][href*="action=rate"]';

  function extractRateUrl(link) {
    const onclick = link.getAttribute("onclick") || "";
    const match = onclick.match(/showWindow\(\s*['"]rate['"]\s*,\s*(?:['"]([^'"]+)['"]|this\.href)/i);
    if (!match) return "";
    const value = (match[1] || link.getAttribute("href") || "").replaceAll("&amp;", "&");
    try {
      const url = new URL(value, location.origin);
      return url.origin === location.origin && url.searchParams.get("action") === "rate" ? url.href : "";
    } catch { return ""; }
  }

  function authorLinkIn(sidebar) {
    return sidebar?.querySelector('.authi a[href*="uid"], a.xw1[href*="uid"]') ||
      sidebar?.querySelector('a[href*="space-uid-"], a[href*="uid="]');
  }

  function updateButton(button, link) {
    if (button.disabled) return;
    const score = normalizeScore(settings.score);
    button.textContent = `+${score} ${settings.blessingsEnabled ? "祝福" : "加分"}`;
    if (link) link.title = `评分（自动填写 +${score}${settings.blessingsEnabled ? " 和随机祝福语" : ""}）`;
  }

  function decorateRateLinks(root = document) {
    const links = root.querySelectorAll(rateLinkSelector);
    links.forEach((link) => {
      if (link.dataset.chhQuickRateReady === "true" || !extractRateUrl(link)) return;
      link.dataset.chhQuickRateReady = "true";
      const quickButton = document.createElement("button");
      quickButton.type = "button";
      quickButton.className = "chh-quick-rate-button";
      quickButton.title = "打开评分框并自动填写";
      quickButton.setAttribute("aria-label", "快速评分");
      updateButton(quickButton, link);
      quickButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        link.click();
      });
      link.insertAdjacentElement("afterend", quickButton);
      const sidebar = link.closest('table[id^="pid"]')?.querySelector(".pls");
      chhOnlineTime.attach(quickButton, sidebar, uidFromLink(authorLinkIn(sidebar)));
    });
  }

  function refreshQuickButtonLabels() {
    document.querySelectorAll(".chh-quick-rate-button").forEach((button) => {
      updateButton(button, button.previousElementSibling);
    });
  }

  function getThreadId(doc = document) {
    const url = new URL(doc === document ? window.location.href : doc.baseURI || window.location.href);
    return url.searchParams.get("tid") || url.pathname.match(/thread-(\d+)-/i)?.[1] ||
      doc.querySelector('input[name="tid"]')?.value || "";
  }

  function getPageCount(doc, threadId) {
    let maxPage = 1;
    doc.querySelectorAll(".pg a, .pg strong, .pg label span").forEach((element) => {
      const textNumber = Number.parseInt(element.textContent.trim(), 10);
      if (Number.isFinite(textNumber)) maxPage = Math.max(maxPage, textNumber);
      const titleNumber = (element.getAttribute("title") || "").match(/(\d+)/)?.[1];
      if (titleNumber) maxPage = Math.max(maxPage, Number.parseInt(titleNumber, 10));
      const href = element.getAttribute("href") || "";
      const prettyPage = href.match(new RegExp(`thread-${threadId}-(\\d+)-`, "i"))?.[1];
      const queryPage = href.match(/[?&]page=(\d+)/i)?.[1];
      if (prettyPage || queryPage) maxPage = Math.max(maxPage, Number.parseInt(prettyPage || queryPage, 10));
    });
    return maxPage;
  }

  function collectCandidatesFromDocument(doc, pageNumber) {
    return Array.from(doc.querySelectorAll('table[id^="pid"]')).flatMap((post) => {
      const pid = post.id.match(/^pid(\d+)$/)?.[1];
      if (!pid) return [];
      const rateUrl = Array.from(post.querySelectorAll(rateLinkSelector), extractRateUrl).find(value => {
        if (!value) return false;
        const params = new URL(value).searchParams;
        return params.get("pid") === pid && params.get("tid") === bulkJob.tid;
      }) || "";
      const authorLink = authorLinkIn(post.querySelector(".pls"));
      const uid = uidFromLink(authorLink);
      const name = authorLink?.textContent.trim() || `楼层 ${pid}`;
      const me = currentUid();
      if (!me) throw new Error('无法识别当前登录账号，请刷新并确认已经登录');
      if (!uid) throw new Error(`无法识别楼层 ${pid} 的作者，停止扫描`);
      const ratings = post.querySelector('[id="post_rate_div_' + pid + '"], [id="ratelog_' + pid + '"]');
      const visibleRaters = Array.from(ratings?.querySelectorAll('a[href]') || [], uidFromLink).filter(Boolean);
      if (visibleRaters.includes(me)) ratedAuthors.add(uid);
      const byline = post.querySelector('[id="authorposton' + pid + '"]') ||
        post.querySelector(".plc .pi .authi, .plc .pti .authi");
      const dates = byline ? [byline.getAttribute("datetime"), byline.title, ...Array.from(
        byline.querySelectorAll("time[datetime], [title]"), el => el.getAttribute("datetime") || el.title
      ), byline.textContent] : [];
      const date = dates.find(value => value && /\d{4}[-年/.]\d{1,2}[-月/.]\d{1,2}/.test(value)) ||
        dates.find(value => value && /刚刚|今天|昨天|前天|\d+\s*(分钟|小时|天)前/.test(value)) || "";
      const floorLabel = post.querySelector('[id="postnum' + pid + '"]')?.textContent.trim();
      if (date && /^(?:楼主|樓主|1\s*#)$/.test(floorLabel || "")) bulkJob.threadDate = date;
      if (uid === me) return [];
      const countLink = ratings?.querySelector('strong a[href*="action=viewratings"]');
      const totalText = countLink?.textContent.trim() || "";
      const inlineCount = /^\d+$/.test(totalText) ? Number(totalText) : null;
      return [{ pid, uid, name, rateUrl, pageNumber, date, visibleRaters, inlineCount }];
    });
  }

  function getCurrentPageNumber(threadId) {
    const url = new URL(window.location.href);
    return Number.parseInt(url.pathname.match(new RegExp(`thread-${threadId}-(\\d+)-`, "i"))?.[1] ||
      url.searchParams.get("page") || "1", 10);
  }

  // Discovery walks the thread lazily. The author-only view independently covers all
  // of the selected author's replies, including later pages and unrateable floors.
  async function* threadPages(first, last, author = "") {
    const { tid, me } = bulkJob;
    for (let page = first; page <= last; page++) {
      assertRunning();
      const url = author ? new URL("forum.php", location.origin) :
        new URL(`thread-${tid}-${page}-1.html`, location.origin);
      if (author) url.search = new URLSearchParams({ mod: "viewthread", tid, authorid: author, page });
      const response = await fetch(url, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`读取帖子失败（HTTP ${response.status}）`);
      const doc = new DOMParser().parseFromString(await readForumResponse(response), "text/html");
      if (currentUid(doc) !== me || !doc.querySelector('table[id^="pid"]')) throw new Error("未能读取已登录的帖子页，请刷新帖子后重试");
      const count = getPageCount(doc, tid);
      const active = doc.querySelector(".pg strong")?.textContent.trim();
      if (active && Number(active) !== page) throw new Error("帖子分页无法核对");
      if (author && (count > 500 || (count > 1 && !active))) { yield { posts: [], page, count, incomplete: true }; return; }
      if (author && doc.querySelector(".pg a[href]") && Array.from(doc.querySelectorAll(".pg a[href]")).some(a => {
        const dest = new URL(a.getAttribute("href"), url);
        return dest.searchParams.get("authorid") !== author || dest.searchParams.get("tid") !== tid;
      })) { yield { posts: [], page, count, incomplete: true }; return; }
      const posts = collectCandidatesFromDocument(doc, page);
      yield { posts, page, count };
      if (author || bulkJob.scope === "thread") last = Math.max(last, count);
      if (page < last) await sleep(350);
    }
  }

  async function* discover(scope, cursor) {
    const start = scope === "page" ? getCurrentPageNumber(bulkJob.tid) : cursor.page;
    for await (const { posts, page, count } of threadPages(start, start)) {
      cursor.page = page;
      for (const target of posts) {
        if (!target.rateUrl || cursor.seen.has(target.uid)) continue;
        cursor.seen.add(target.uid);
        yield { ...target, posts: page === 1 && count === 1 ? posts.filter(p => p.uid === target.uid) : null };
      }
    }
  }

  async function authorPosts(candidate) {
    if (candidate.posts) return candidate.posts;
    const posts = new Map();
    for await (const part of threadPages(1, 1, candidate.uid)) {
      if (part.incomplete || part.posts.some(p => p.uid !== candidate.uid)) return [];
      for (const post of part.posts) posts.set(post.pid, post);
    }
    return posts.has(candidate.pid) ? Array.from(posts.values()) : [];
  }

  function uidFromLink(link) {
    return (link?.getAttribute('href') || '').match(/(?:space-uid-|[?&]uid=)(\d+)/)?.[1] || '';
  }

  function assertRunning() {
    if (!bulkJob || bulkJob.cancelled || !settings.enabled) throw new Error('已停止');
    if (currentUid() !== bulkJob.me) throw new Error('登录账号发生变化，已停止');
    if (getThreadId() !== bulkJob.tid) throw new Error("当前主题发生变化，已停止");
  }

  function historyCoversPost(date, days, now) {
    const match = date.match(/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
    if (!match) {
      const relative = date.match(/(\d+)\s*(分钟|小时|天)前/);
      if (relative) {
        const unitsPerDay = { "分钟": 1440, "小时": 24, "天": 1 };
        return Number(relative[1]) / unitsPerDay[relative[2]] < days - 1;
      }
      return /刚刚|今天|昨天|前天/.test(date) && days > 3;
    }
    const posted = Date.UTC(+match[1], +match[2] - 1, +match[3]);
    const age = (now - posted) / 86400000;
    // Allow for the forum's display timezone, and skip the retention boundary.
    return age >= -1 && age < days - 1;
  }

  function retentionDays(message) {
    const period = message.match(/(?:最近|近|过去)(一|1|30|365)(个?月|年|天)/);
    if (!period) return 0;
    if (period[2] === "天") return Number(period[1]) || 1;
    if (!["一", "1"].includes(period[1])) return 0;
    return period[2] === "年" ? 365 : 28;
  }

  function readRatingRows(doc, me, missingRaters) {
    for (const table of doc.querySelectorAll("table")) {
      const [head, ...rows] = Array.from(table.rows);
      if (!head) continue;
      const titles = Array.from(head.cells, cell => cell.textContent.trim());
      const col = titles.findIndex(title => /^(用户名|评分者|评分人|用户|用戶名)$/.test(title));
      if (col < 0 || !titles.some(title => /时间|時間/.test(title)) ||
          !titles.some(title => /积分|積分|分数|分值|邪恶|理由|原因/.test(title))) continue;
      const uids = rows.map(row => uidFromLink(row.cells[col]?.querySelector('a[href*="uid"]')));
      if (uids.includes(me)) return "rated";
      if (!uids.length || uids.some(uid => !uid)) return "unknown";
      for (const uid of uids) missingRaters.delete(uid);
      return "clear";
    }
    return "unknown";
  }

  function ratingPageCount(doc, url, page) {
    const pager = doc.querySelector(".pg");
    if (!pager) return page === 1 ? 1 : 0;
    const current = Number(pager.querySelector("strong")?.textContent);
    if (current !== page) return 0;
    let last = page;
    for (const link of pager.querySelectorAll("a")) {
      const href = link.getAttribute("href");
      if (!href) return 0;
      if (!URL.canParse(href, url)) return 0;
      const target = new URL(href, url);
      if (target.origin !== url.origin || target.pathname !== url.pathname ||
          ["action", "pid", "tid", "mod"].some(key => target.searchParams.get(key) !== url.searchParams.get(key))) return 0;
      const number = Number(target.searchParams.get("page") || 1);
      if (!Number.isSafeInteger(number) || number < 1) return 0;
      last = Math.max(last, number);
    }
    const label = pager.querySelector("label span");
    if (label) {
      const total = Number((label.title || label.textContent).match(/\d+/)?.[0]);
      if (!total) return 0;
      last = Math.max(last, total);
    }
    return last <= 500 ? last : 0;
  }

  async function readRatings(post, ajax = true) {
    const url = new URL('forum.php', location.origin);
    url.search = new URLSearchParams({ mod: 'misc', action: 'viewratings', tid: bulkJob.tid, pid: post.pid,
      inajax: '1', infloat: 'yes', handlekey: 'viewratings' }).toString();
    if (!ajax) for (const key of ["inajax", "infloat", "handlekey"]) url.searchParams.delete(key);
    let last = 1;
    let covered = true;
    const missingRaters = new Set(post.visibleRaters);
    for (let page = 1; page <= last; page++) {
      assertRunning();
      if (page > 1) url.searchParams.set("page", String(page));
      const response = await fetch(url, { credentials: 'include', cache: 'no-store',
        headers: ajax ? { 'X-Requested-With': 'XMLHttpRequest' } : {}, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`评分记录读取失败：HTTP ${response.status}`);
      const raw = await readForumResponse(response);
      let html;
      try { html = unwrapAjaxResponse(raw); } catch { return ajax ? readRatings(post, false) : "评分记录响应不完整"; }
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script, style, noscript").forEach(node => node.remove());
      const notice = doc.querySelector("#messagetext p, .alert_error p, .alert_info p, .alert_right p") ||
        doc.querySelector(".altw [class^='alert_'], #messagetext, .alert_error, .alert_info, .alert_right") ||
        doc.querySelector("#return_viewratings");
      const bare = !doc.querySelector("table, form, .pg, #hd") ? doc.body : null;
      const message = (notice?.textContent || bare?.textContent || "").replace(/\s/g, "");
      if (doc.querySelector('form[name="login"], form[id^="loginform"], form[action*="mod=logging"]') ||
          /请先登录|需要先登录|尚未登录|重新登录|没有权限|无权访问|验证码|安全验证|访问过于频繁/.test(message)) {
        throw new Error("论坛要求登录或验证，请刷新帖子并确认能打开评分记录");
      }
      const now = Date.parse(response.headers?.get("date")) || Date.now();
      const state = readRatingRows(doc, bulkJob.me, missingRaters);
      if (state === "rated") return state;
      // Only a recognized server notice can establish an empty history.
      const empty = /^(?:(?:抱歉|对不起)[，,！!：:]?)?(?:(?:指定的?|该|本)(?:帖子|主题|楼层))?(?:(?:在)?(?:最近|近|过去)(?:一|1|30|365)(?:个?月|年|天)(?:内)?)?(?:没有|暂无|无)(?:任何)?评分记录[。！!.]?$/.test(message);
      if (state === "unknown" && !(empty && page === 1 && !doc.querySelector("table.list, .pg"))) return ajax ? readRatings(post, false) : "无法识别论坛返回的评分记录格式";
      covered = covered && historyCoversPost(post.date || bulkJob.threadDate || "", retentionDays(message) || 365, now);
      const count = ratingPageCount(doc, url, page);
      if (!count) return "评分记录分页不完整";
      last = Math.max(count, last);
    }
    if (missingRaters.size) return "楼层摘要与评分明细不一致";
    if (!covered) return post.date ? "评分记录期限未覆盖该楼层" : "未取得楼层发表时间";
    return "clear";
  }

  function historyKey(candidate) {
    return `chh-rated:${bulkJob.me}:${bulkJob.tid}:${candidate.uid}`;
  }

  async function checkAuthor(candidate) {
    assertRunning();
    const key = historyKey(candidate);
    const entry = (await chrome.storage.local.get(key))[key];
    if (entry?.state === "pending") {
      return { status: "review", known: true, detail: `楼层 ${entry.pid} 曾尝试提交，结果待核对` };
    }
    if (entry || ratedAuthors.has(candidate.uid)) {
      return { status: "skipped", detail: "已有你的评分" };
    }
    const posts = await authorPosts(candidate);
    if (!posts.length) return { status: "review", detail: `楼层 ${candidate.pid}：未能核对该作者的全部回帖` };
    if (ratedAuthors.has(candidate.uid)) return { status: "skipped", detail: "楼层已有你的评分" };
    let review;
    for (const post of posts) {
      // A non-empty inline list is complete only when its unique UID count matches the site's total.
      if (post.inlineCount > 0 && post.inlineCount === new Set(post.visibleRaters).size &&
          historyCoversPost(post.date || bulkJob.threadDate || "", 365, Date.now())) {
        if (post.visibleRaters.includes(bulkJob.me)) return { status: "skipped", detail: "楼层已有你的评分" };
        continue;
      }
      const state = await readRatings(post);
      if (state === "rated") return { status: "skipped", detail: "已有你的评分" };
      if (state !== "clear" && !review) review = { status: "review", detail: `楼层 ${post.pid}：${state}` };
      await sleep(300);
    }
    if (review) return review;
    return '';
  }

  function unwrapAjaxResponse(html) {
    if (!/^\s*(?:<\?xml|<root\b)/i.test(html)) return html;
    const xml = new DOMParser().parseFromString(html, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('评分接口返回了无效 XML');
    return xml.documentElement.textContent || '';
  }

  function responseText(html) {
    const doc = new DOMParser().parseFromString(unwrapAjaxResponse(html), "text/html");
    doc.querySelectorAll('script, style').forEach(e => e.remove());
    const message = doc.querySelector('#messagetext, .alert_error, .alert_info, .alert_right');
    return ((message || doc.body).textContent || '服务器返回空响应').replace(/\s+/g, " ").trim();
  }

  function classifyFailure(html) {
    const text = responseText(html);
    if (/已经.*评分|评分过|重复评分|不能重复/.test(text)) return { status: "skipped", detail: "已经评分" };
    if (/自己|本人/.test(text) && /评分/.test(text)) return { status: "skipped", detail: "自己的帖子" };
    if (/剩余|超出|不足|上限/.test(text) && /评分|邪恶|积分/.test(text)) return { status: "stop", detail: "今日评分额度不足" };
    if (/登录|权限|无权|用户组/.test(text)) return { status: "stop", detail: "登录状态或权限不足" };
    if (/验证码|安全验证/.test(text)) return { status: "stop", detail: "网站要求安全验证" };
    return { status: "stop", detail: text.slice(0, 240) || "服务器未返回评分表" };
  }

  function remainingPoints(form) {
    const row = form.querySelector('[name="score1"]')?.closest("tr");
    const table = row?.closest("table");
    if (!table) return null;
    for (const head of table.rows) {
      const col = Array.from(head.cells).findIndex(cell => /^(?:今日|今天)(?:可用|剩余|剩餘)(?:积分|分数|额度)?$/.test(cell.textContent.replace(/\s/g, "")));
      if (col < 0) continue;
      const value = row.cells[col]?.textContent.trim();
      if (/^\d+(?:\s*分)?$/.test(value || "")) return Math.min(100, parseInt(value, 10));
    }
    return null;
  }

  async function prepareRate(candidate) {
    const prepareUrl = new URL(candidate.rateUrl, location.origin);
    prepareUrl.searchParams.set("infloat", "yes");
    prepareUrl.searchParams.set("inajax", "1");
    prepareUrl.searchParams.set("handlekey", "rate");
    prepareUrl.searchParams.set("ajaxtarget", "fwin_content_rate");
    const prepareResponse = await fetch(prepareUrl, {
      credentials: "include", cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
    const prepareHtml = await readForumResponse(prepareResponse);
    if (!prepareResponse.ok) return { status: "failed", detail: `HTTP ${prepareResponse.status}` };

    const parsed = new DOMParser().parseFromString(unwrapAjaxResponse(prepareHtml), "text/html");
    const form = parsed.querySelector("form#rateform");
    if (!form) return classifyFailure(prepareHtml);
    if (bulkJob?.cancelled) return { status: 'stop', detail: '已停止，未提交当前评分' };
    if (!form.querySelector('[name="score1"]') || !form.querySelector('[name="formhash"]')) {
      return { status: 'stop', detail: '评分表字段不完整，已停止' };
    }

    if (form.querySelector('[name="pid"]')?.value !== candidate.pid ||
        form.querySelector('[name="tid"]')?.value !== bulkJob.tid) throw new Error("评分表目标不匹配");
    return { form, points: remainingPoints(form) };
  }

  function confirmBudget(points) {
    if (points === null) {
      const input = window.prompt("评分框未显示可识别的今日剩余额度。请按论坛显示的实际剩余分数填写（0–100），取消可结束任务。", "");
      if (input === null) return false;
      if (!/^\d{1,3}$/.test(input.trim()) || Number(input) > 100) throw new Error("请输入 0–100 的整数");
      points = Number(input);
    }
    bulkJob.left = points;
    const slots = Math.floor(points / bulkJob.score);
    if (!slots) return true;
    return window.confirm(`今日剩余 ${points} 分，每人 +${bulkJob.score}，本次最多可加 ${slots} 人。\n已评分和待核对的作者会跳过。现在开始吗？`);
  }

  async function rateCandidate(candidate) {
    const existing = await checkAuthor(candidate);
    if (existing) return existing;
    const quote = await prepareRate(candidate);
    if (!quote.form) return quote;
    if (quote.points !== null) bulkJob.left = Math.min(bulkJob.left, quote.points);
    if (bulkJob.left < bulkJob.score) return { status: "quota" };
    const form = quote.form;
    const data = new URLSearchParams();
    new FormData(form).forEach((value, key) => data.append(key, String(value)));
    data.set("score1", String(bulkJob.score));
    data.set("reason", settings.blessingsEnabled ? randomBlessing() : "");
    data.set("ratesubmit", "true");
    data.delete("sendreasonpm");
    if (bulkJob.notifyAuthor) data.set("sendreasonpm", "on");

    const submitUrl = new URL(form.getAttribute("action"), location.origin);
    if (submitUrl.origin !== location.origin || submitUrl.searchParams.get('action') !== 'rate') {
      return { status: 'stop', detail: '评分提交地址不匹配' };
    }
    submitUrl.searchParams.set("inajax", "1");
    submitUrl.searchParams.set("ajaxtarget", "return_rate");
    assertRunning();
    if (form.querySelector('[name="pid"]')?.value !== candidate.pid ||
        form.querySelector('[name="tid"]')?.value !== getThreadId()) throw new Error('评分表目标不匹配');
    // Persist before POST: an ambiguous response must never trigger an automatic retry.
    const key = historyKey(candidate);
    const claim = await chrome.runtime.sendMessage({ type: "CHH_RESERVE_RATING",
      me: bulkJob.me, tid: bulkJob.tid, uid: candidate.uid, pid: candidate.pid });
    if (!claim || claim.error) throw new Error(claim?.error || "未取得评分登记结果");
    if (!claim.reserved) return { status: "skipped", detail: "本账号已登记该作者" };
    assertRunning();
    try {
      const submitResponse = await fetch(submitUrl, {
        method: "POST", credentials: "include", signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body: data.toString()
      });
      const submitHtml = await readForumResponse(submitResponse);
      if (!submitResponse.ok) throw new Error(`HTTP ${submitResponse.status}`);
      if (await readRatings(candidate) !== "rated") throw new Error(responseText(submitHtml).slice(0, 100));
      await chrome.storage.local.set({ [key]: { state: 'confirmed', pid: candidate.pid, at: Date.now() } });
    } catch (error) {
      throw new Error(`楼层 ${candidate.pid} 提交结果待核对，不会重发（${error.message}）`);
    }
    markPostRated(candidate.pid);
    return { status: "success", detail: `+${bulkJob.score}，已核对服务器记录` };
  }

  function markPostRated(pid) {
    const post = document.querySelector(`#pid${CSS.escape(pid)}`);
    if (!post) return;
    post.querySelectorAll(".chh-quick-rate-button").forEach((button) => {
      button.disabled = true;
      button.textContent = "已评分";
    });
  }

  function ensureBulkPanel() {
    let panel = document.querySelector("#chh-quick-rate-bulk");
    if (panel) return panel;
    panel = document.createElement("aside");
    panel.id = "chh-quick-rate-bulk";
    panel.className = "chh-quick-rate-bulk";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `<div class="chh-bulk-head"><strong>批量评分</strong><button type="button" class="chh-bulk-close" title="关闭" aria-label="关闭">×</button></div><div class="chh-bulk-status">准备中</div><div class="chh-bulk-track"><span></span></div><div class="chh-bulk-counts"></div><button type="button" class="chh-bulk-cancel">停止</button>`;
    document.body.append(panel);
    const resume = document.createElement("button");
    resume.type = "button";
    resume.className = "chh-bulk-resume";
    resume.textContent = "继续核查下一批";
    resume.hidden = true;
    panel.append(resume);
    resume.addEventListener("click", () => {
      if (bulkJob || !pausedThread || currentUid() !== pausedThread.me || getThreadId() !== pausedThread.tid) return;
      startBulkRate("thread").catch(error => updateBulkPanel({ status: error.message, finished: true }));
    });
    panel.querySelector(".chh-bulk-cancel").addEventListener("click", () => {
      if (bulkJob) bulkJob.cancelled = true;
      updateBulkPanel({ status: "正在停止..." });
    });
    panel.querySelector(".chh-bulk-close").addEventListener("click", () => {
      if (bulkJob) bulkJob.cancelled = true;
      panel.remove();
    });
    return panel;
  }

  function updateBulkPanel({ status, done, total, success, skipped, failed, finished = false }) {
    const panel = ensureBulkPanel();
    if (status) panel.querySelector(".chh-bulk-status").textContent = status;
    if (Number.isFinite(total)) {
      const completed = Number.isFinite(done) ? done : 0;
      panel.querySelector(".chh-bulk-track span").style.width = `${total ? (completed / total) * 100 : 0}%`;
      panel.querySelector(".chh-bulk-counts").textContent = `完成 ${completed}/${total} · 成功 ${success || 0} · 跳过 ${skipped || 0} · 失败 ${failed || 0}`;
    }
    panel.querySelector(".chh-bulk-cancel").hidden = finished;
  }

  async function startBulkRate(scope) {
    if (!navigator.locks) throw new Error('浏览器不支持跨标签页任务锁');
    return navigator.locks.request('chh-quick-rate', { ifAvailable: true }, async lock => {
      if (!lock) { updateBulkPanel({ status: '其他标签页正在评分', finished: true }); return; }
      return runBulkRate(scope);
    });
  }

  async function runBulkRate(scope) {
    if (!settings.enabled) throw new Error("扩展当前已停用");
    if (bulkJob) throw new Error("已有批量评分任务正在进行");
    bulkJob = { cancelled: false, me: currentUid(), tid: getThreadId(), score: normalizeScore(settings.score), notifyAuthor: settings.notifyAuthor };
    ratedAuthors.clear();
    const panel = ensureBulkPanel();
    const resumeButton = panel.querySelector(".chh-bulk-resume");
    resumeButton.hidden = true;
    const previous = scope === "thread" && pausedThread?.me === bulkJob.me &&
      pausedThread?.tid === bulkJob.tid ? pausedThread : null;
    if (!previous) panel.querySelector(".chh-review")?.remove();
    const cursor = { me: bulkJob.me, tid: bulkJob.tid, page: previous?.page || 1, seen: new Set(previous?.seen) };
    try {
      if (!bulkJob.me || !bulkJob.tid) throw new Error("请在已登录的主题页启动评分");
      bulkJob.scope = scope;
      bulkJob.left = null;
      const totals = { success: 0, skipped: 0, failed: 0 };
      let done = 0;
      let stopReason = "";
      let unresolved = 0;
      let reviewLimit = false;
      const report = (status, finished = false) => {
        const remaining = bulkJob.left;
        const slots = remaining === null ? 0 : Math.floor(remaining / bulkJob.score);
        updateBulkPanel({ status, done, total: finished ? done : done + slots, ...totals, finished });
        if (remaining !== null) panel.querySelector(".chh-bulk-counts").append(` · 剩余 ${remaining} 分，可加 ${slots} 人`);
      };
      const authorize = async candidate => {
        const quote = await prepareRate(candidate);
        if (quote.form) {
          if (!confirmBudget(quote.points)) throw new Error("已取消批量评分");
        } else if (quote.status === "stop") throw new Error(quote.detail);
        return quote;
      };
      report("正在读取今日剩余额度");
      const preview = collectCandidatesFromDocument(document, getCurrentPageNumber(bulkJob.tid)).find(p => p.rateUrl);
      if (preview) await authorize(preview);
      if (bulkJob.left === null || bulkJob.left >= bulkJob.score) {
        for await (const candidate of discover(scope, cursor)) {
          assertRunning();
          if (bulkJob.left === null) {
            const quote = await authorize(candidate);
            if (!quote.form) { totals.skipped++; done++; continue; }
          }
          if (bulkJob.left < bulkJob.score) break;
          report(`正在处理第 ${candidate.pageNumber} 页的 ${candidate.name}`);
          const result = await rateCandidate(candidate);
          if (result.status === "quota") break;
          done++;
          if (result.status === "success") {
            totals.success++;
            bulkJob.left -= bulkJob.score;
          } else if (result.status === "skipped" || result.status === "review") {
            totals.skipped++;
            if (result.status === "review") {
              addReview(panel, candidate, result.detail);
              if (!result.known) unresolved++;
            }
          } else {
            totals.failed++;
            if (result.status === "stop") { stopReason = result.detail; break; }
          }
          if (bulkJob.left < bulkJob.score) break;
          if (unresolved >= Math.floor(bulkJob.left / bulkJob.score)) {
            reviewLimit = true;
            break;
          }
          await sleep(normalizeDelay(settings.bulkDelay));
        }
      }
      if (stopReason) report(`任务已停止：${stopReason}`, true);
      else if (bulkJob.left !== null && bulkJob.left < bulkJob.score) report("今日剩余额度不足以再加一人，已结束", true);
      else if (reviewLimit) {
        if (scope === "thread") {
          pausedThread = cursor;
          resumeButton.hidden = false;
        }
        report("已达到本次核查人数上限，剩余额度已保留", true);
      } else {
        if (scope === "thread") pausedThread = null;
        report("批量评分完成", true);
      }
    } catch (error) {
      updateBulkPanel({ status: "任务已停止：" + (error.message || "批量评分失败"), finished: true });
    } finally {
      bulkJob = null;
    }
  }

  function addReview(panel, candidate, detail) {
    let reviews = panel.querySelector(".chh-review");
    if (!reviews) {
      reviews = document.createElement("details");
      reviews.className = "chh-review";
      reviews.innerHTML = "<summary></summary><ul></ul>";
      panel.querySelector(".chh-bulk-counts").after(reviews);
    }
    const list = reviews.querySelector("ul");
    const item = document.createElement("li");
    item.textContent = `${candidate.name}（UID ${candidate.uid}）· ${detail}`;
    list.append(item);
    reviews.querySelector("summary").textContent = `待核对，已跳过 ${list.childElementCount} 位作者`;
  }

  function scan(root = document) {
    decorateRateLinks(root);
    document.querySelectorAll("form#rateform, form[action*='action=rate'][action*='ratesubmit=yes']").forEach((form) => fillRateForm(form));
  }

  function queueScan() {
    if (mutationQueued) return;
    mutationQueued = true;
    window.requestAnimationFrame(() => {
      mutationQueued = false;
      scan();
    });
  }

  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored, score: normalizeScore(stored.score), bulkDelay: normalizeDelay(stored.bulkDelay) };
    scan();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    Object.entries(changes).forEach(([key, change]) => { settings[key] = change.newValue ?? DEFAULTS[key]; });
    settings.score = normalizeScore(settings.score);
    settings.bulkDelay = normalizeDelay(settings.bulkDelay);
    refreshQuickButtonLabels();
    document.querySelectorAll("form#rateform").forEach((form) => fillRateForm(form, true));
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "CHH_QUICK_RATE_APPLY") {
      const form = document.querySelector("form#rateform");
      sendResponse({ applied: form ? fillRateForm(form, true) : false });
      return;
    }
    if (message?.type === "CHH_BULK_RATE") {
      if (bulkJob) {
        sendResponse({ started: false, error: "已有批量评分任务正在进行" });
        return;
      }
      startBulkRate(message.scope).catch(error => updateBulkPanel({ status: error.message, finished: true }));
      sendResponse({ started: true });
    }
  });

  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => Array.from(m.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE))) queueScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
