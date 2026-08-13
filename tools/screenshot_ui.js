/* 生成几个关键界面的手机尺寸截图，用于视觉审查。
 * 用法: node tools/screenshot_ui.js <应用html> <chrome.exe路径>
 */
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

(async () => {
  const html = process.argv[2];
  const exe = process.argv[3];
  const outDir = path.resolve("output/ui");
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(path.resolve(html)).href, { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, "01-home.png") });

  await page.click("#btnStart");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, "02-card-front.png") });
  await page.click("#flashcard");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, "03-card-back.png") });
  await page.click("#btnQuitStudy");

  await page.evaluate(() => openQuiz());
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, "04-quiz.png") });
  await page.click("#btnQuitQuiz");

  await page.click('.tabbar button[data-tab="search"]');
  await page.fill("#searchInput", "德赛精 KF");
  await page.waitForTimeout(350);
  await page.click("#searchResult .row");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, "05-detail.png") });

  console.log("screenshots ->", outDir);
  await browser.close();
})().catch(e => {
  console.error("截图失败:", e.message);
  process.exit(1);
});
