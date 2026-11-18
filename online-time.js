// Prefer the author's sidebar. Only look up profiles for visible buttons.
const chhOnlineTime = (() => {
  const cache = new Map();
  const queue = new Map();
  let loading = false;
  const unitPattern = /^([\d,，]+(?:\.\d+)?)\s*(小时|小時|分钟|分鐘|天)(?:\s|$)/;

  function readTime(root) {
    if (!root) return "";
    for (const label of root.querySelectorAll("dt, li, th, .tip_c p")) {
      const match = label.textContent.trim().match(/^(?:累计)?(?:在线时间|在線時間)\s*[:：]?\s*(.*)$/);
      if (!match) continue;
      const value = match[1] || label.nextElementSibling?.textContent.trim() || "";
      const duration = value.match(unitPattern);
      if (duration) return duration[1] + " " + duration[2];
    }
    return "";
  }

  async function lookup(uid) {
    const url = new URL("home.php", location.origin);
    url.search = new URLSearchParams({ mod: "space", uid, do: "profile" });
    const res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";
    const doc = new DOMParser().parseFromString(await readForumResponse(res), "text/html");
    // The page header can describe the logged-in visitor, or a redirected profile.
    const profile = doc.querySelector(".u_profile, #profilecontent") || doc.querySelector("#ct .mn");
    const heading = profile?.querySelector("h2, .mt");
    const identity = heading?.textContent.match(/\bUID\s*[:：]\s*(\d+)/i)?.[1];
    if (identity !== uid) return "";
    return readTime(profile);
  }

  function display(badge, value) {
    badge.textContent = value ? "在线 " + value : "在线时间未知";
    badge.title = value ? "该楼层作者的累计在线时间" : "暂未取得该作者的在线时间";
  }

  async function drain() {
    if (loading) return;
    loading = true;
    try {
      while (queue.size) {
        const [uid, badges] = queue.entries().next().value;
        let value = cache.get(uid);
        if (value === undefined && [...badges].some(el => el.isConnected)) {
          try { value = await lookup(uid); } catch { value = ""; }
          // A sidebar discovered during the request takes precedence.
          if (!cache.has(uid)) cache.set(uid, value);
        }
        queue.delete(uid);
        for (const badge of badges) display(badge, cache.get(uid));
        if (queue.size) await new Promise(resolve => setTimeout(resolve, 350));
      }
    } finally {
      loading = false;
    }
  }

  function request(badge) {
    const uid = badge.dataset.uid;
    if (cache.has(uid)) return display(badge, cache.get(uid));
    if (!queue.has(uid)) queue.set(uid, new Set());
    queue.get(uid).add(badge);
    void drain();
  }

  const visible = typeof IntersectionObserver === "function" && new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      visible.unobserve(entry.target);
      request(entry.target);
    }
  });

  function attach(button, sidebar, uid) {
    const badge = document.createElement("span");
    badge.className = "chh-online-time";
    badge.dataset.uid = uid;
    button.after(badge);
    const value = readTime(sidebar);
    if (value && uid) cache.set(uid, value);
    if (value || !uid || cache.has(uid)) return display(badge, value || cache.get(uid));
    badge.textContent = "在线时间…";
    if (visible) visible.observe(badge);
    else request(badge);
  }

  return { attach };
})();
