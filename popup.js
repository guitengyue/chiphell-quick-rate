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

  const controls = {
    enabled: document.querySelector("#enabled"),
    blessingsEnabled: document.querySelector("#blessingsEnabled"),
    score: document.querySelector("#score"),
    notifyAuthor: document.querySelector("#notifyAuthor"),
    autoSubmit: document.querySelector("#autoSubmit"),
    bulkDelay: document.querySelector("#bulkDelay")
  };
  const applyButton = document.querySelector("#apply");
  const status = document.querySelector("#status");
  let statusTimer;

  function showStatus(text) {
    window.clearTimeout(statusTimer);
    status.textContent = text;
    statusTimer = window.setTimeout(() => {
      status.textContent = "设置会自动保存";
    }, 1800);
  }

  function saveSettings() {
    updateApplyLabel();
    chrome.storage.sync.set({
      enabled: controls.enabled.checked,
      blessingsEnabled: controls.blessingsEnabled.checked,
      score: Number.parseInt(controls.score.value, 10),
      notifyAuthor: controls.notifyAuthor.checked,
      autoSubmit: controls.autoSubmit.checked,
      bulkDelay: Number.parseInt(controls.bulkDelay.value, 10)
    }, () => showStatus("已保存"));
  }

  function updateApplyLabel() {
    applyButton.textContent = controls.blessingsEnabled.checked ? "重新生成祝福并填写" : "重新填写分数";
  }

  chrome.storage.sync.get(DEFAULTS, (settings) => {
    controls.enabled.checked = settings.enabled;
    controls.blessingsEnabled.checked = settings.blessingsEnabled;
    updateApplyLabel();
    controls.score.value = String(settings.score);
    controls.notifyAuthor.checked = settings.notifyAuthor;
    controls.autoSubmit.checked = false;
    controls.bulkDelay.value = String(settings.bulkDelay);
  });

  Object.values(controls).forEach((control) => {
    control.addEventListener("change", saveSettings);
  });

  applyButton.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(www\.)?chiphell\.com\//.test(tab.url || "")) {
      showStatus("请先打开 Chiphell 帖子");
      return;
    }

    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: "CHH_QUICK_RATE_APPLY" });
      showStatus(result?.applied ? "已填写评分框" : "请先打开评分框");
    } catch {
      showStatus("刷新 Chiphell 页面后再试");
    }
  });

  async function startBulk(scope) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(www\.)?chiphell\.com\//.test(tab.url || "")) {
      showStatus("请先打开 Chiphell 帖子");
      return;
    }
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: "CHH_BULK_RATE", scope });
      if (!result?.started) {
        showStatus(result?.error || "无法启动批量评分");
        return;
      }
      window.close();
    } catch {
      showStatus("刷新 Chiphell 页面后再试");
    }
  }

  document.querySelector("#ratePage").addEventListener("click", () => startBulk("page"));
  document.querySelector("#rateThread").addEventListener("click", () => startBulk("thread"));
})();
