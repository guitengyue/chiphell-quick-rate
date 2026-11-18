// Both Chiphell hostnames share this extension-origin lock and the v1.2 ledger.
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== "CHH_RESERVE_RATING") return;
  const { me, tid, uid, pid } = message;
  if (sender.id !== chrome.runtime.id || !/^https:\/\/(www\.)?chiphell\.com\//.test(sender.url || "") ||
      ![me, tid, uid, pid].every(id => typeof id === "string" && /^\d+$/.test(id))) {
    reply({ error: "评分目标无效" });
    return;
  }
  const key = `chh-rated:${me}:${tid}:${uid}`;
  navigator.locks.request(key, async () => {
    if ((await chrome.storage.local.get(key))[key]) return { reserved: false };
    await chrome.storage.local.set({ [key]: { state: "pending", pid, at: Date.now() } });
    return { reserved: true };
  }).then(reply, () => reply({ error: "无法保存评分记录" }));
  return true;
});
