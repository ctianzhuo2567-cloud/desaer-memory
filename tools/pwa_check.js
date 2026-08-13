/* PWA 专项验证：manifest 可解析、service worker 激活、断网后仍能打开。
 * 用法: node tools/pwa_check.js <http地址> <chrome.exe路径>
 */
const { chromium } = require("playwright");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const base = process.argv[2];
  const exe = process.argv[3];
  assert(/^https?:\/\//.test(base), "用法: node tools/pwa_check.js <http地址> <chrome.exe路径>");

  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(base, { waitUntil: "load" });
  assert((await page.textContent("#appVersion")).trim().length > 0, "应显示版本号");

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const res = await fetch(link.href);
    return { ok: res.ok, json: await res.json() };
  });
  assert(manifest && manifest.ok, "manifest 应可访问");
  assert(manifest.json.display === "standalone", "display 应为 standalone");
  assert((manifest.json.icons || []).length >= 2, "manifest 应包含图标");

  const icon = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="apple-touch-icon"]');
    return link ? (await fetch(link.href)).status : 0;
  });
  assert(icon === 200, "apple-touch-icon 应可访问: " + icon);

  await page.evaluate(() => navigator.serviceWorker.ready);
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    return { active: reg && reg.active ? reg.active.state : null, keys };
  });
  assert(swState.active === "activated", "service worker 应激活: " + JSON.stringify(swState));
  assert(swState.keys.some((k) => k.startsWith("desaar-memory-")), "应有版本化缓存");

  // 断网后应仍能打开（由 service worker 回退到缓存）
  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  const offlineOk = (await page.textContent("#stPending")) !== null;
  await context.setOffline(false);
  assert(offlineOk, "断网重载后应仍能打开");

  assert(errors.length === 0, "页面错误: " + errors.join("\n"));
  console.log("版本:", (await page.textContent("#appVersion")).trim());
  console.log("manifest: standalone, 图标", manifest.json.icons.length, "个");
  console.log("service worker: activated, 缓存:", swState.keys.join(", "));
  console.log("断网重载: 通过");
  console.log("PWA 验证通过");
  await browser.close();
})().catch((e) => {
  console.error("PWA 验证失败:", e.message);
  process.exit(1);
});
