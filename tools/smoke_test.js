/* 用本机 Chrome 对生成的应用做交互冒烟测试（合并流程版）。
 * 用法: node tools/smoke_test.js <应用html> <chrome.exe路径>
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const html = process.argv[2];
  const exe = process.argv[3];
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message + " @ " + (e.stack ? e.stack.split("\n")[1] : "")));
  page.on("console", m => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  await page.goto(pathToFileURL(path.resolve(html)).href, { waitUntil: "load" });
  assert((await page.textContent("#stPending")) === "259", "待学习初始应为 259");
  assert((await page.textContent("#stNew")) === "20", "新卡默认 20");

  // 手势返回：打开学习浮层后返回，应关闭浮层并留在首页，而不是退出
  await page.click("#btnStart");
  await page.waitForTimeout(250);
  assert(await page.evaluate(() => !document.querySelector("#studyOverlay").classList.contains("hidden")), "应打开学习浮层");
  await page.goBack();
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.querySelector("#studyOverlay").classList.contains("hidden")), "返回应关闭学习浮层");
  assert(await page.evaluate(() => !document.querySelector("#view-home").classList.contains("hidden")), "返回后应仍在首页");

  // 每日新产品数改为 3
  await page.click('.tabbar button[data-tab="me"]');
  await page.fill("#dailyNew", "3");
  await page.dispatchEvent("#dailyNew", "change");
  await page.click('.tabbar button[data-tab="home"]');

  // 注入一条“昨天的错题”，验证次日排在最前
  const targetCode = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("desaar_memory_v1"));
    const batch = st.meta.batch || [];
    const target = PRODUCTS.find(p => !batch.includes(p.id));
    st.srs[target.id] = {
      reps: 0, lapses: 0, ease: 2.5, interval: 0, due: 0,
      wrong: true, lastWrong: Date.now() - 86400000, introDay: "", stage: "wrong", quizCorrect: 0
    };
    localStorage.setItem("desaar_memory_v1", JSON.stringify(st));
    return target.code;
  });
  await page.reload({ waitUntil: "load" });
  assert((await page.textContent("#stNew")) === "3", "每日新卡应为 3");

  // 阶段一：学习。首卡“忘记”应重新学习，且不进错题本
  await page.click("#btnStart");
  await page.waitForTimeout(250);
  const firstCode = (await page.textContent("#fcCode")).trim();
  await page.click('.rate-btn[data-rate="again"]');
  await page.waitForTimeout(200);
  for (let i = 0; i < 15; i++) {
    if (await page.$("#btnToQuiz")) break;
    await page.click('.rate-btn[data-rate="good"]');
    await page.waitForTimeout(180);
  }
  assert(await page.$("#btnToQuiz"), "学习阶段完成后应出现“开始答题”");
  const studyState = await page.evaluate((firstCode) => {
    const st = JSON.parse(localStorage.getItem("desaar_memory_v1"));
    const againId = PRODUCTS.find(p => p.code === firstCode).id;
    const learning = Object.values(st.srs).filter(s => s.reps > 0 && !s.wrong && (s.interval || 0) < 120).length;
    return { againWrong: st.srs[againId].wrong, learning };
  }, firstCode);
  assert(studyState.againWrong === false, "翻卡“忘记”不应进错题本");
  assert(studyState.learning === 3, "学习阶段应让 3 个产品进入学习中: " + studyState.learning);

  // 阶段二：答题。昨天的错题应排在最前，队列为 1+3
  await page.click("#btnToQuiz");
  await page.waitForTimeout(250);
  const quizTotal = await page.textContent("#quizCount");
  assert(quizTotal.startsWith("1/4"), "答题队列应为 1 错题 + 3 新题: " + quizTotal);
  const firstQuizCode = (await page.textContent("#quizCode")).trim();
  assert(firstQuizCode === targetCode, "昨天的错题应排在最前: " + firstQuizCode + " != " + targetCode);

  const answerOne = async (correct) => {
    await page.waitForSelector(".quiz-card .opt", { timeout: 4000 });
    await page.evaluate((correct) => {
      const id = document.querySelector(".quiz-card").dataset.id;
      const p = PRODUCTS.find(x => x.id === id);
      const els = Array.from(document.querySelectorAll(".quiz-card .opt"));
      const target = correct
        ? els.find(e => e.textContent.trim() === p.type)
        : els.find(e => e.textContent.trim() !== p.type);
      target.click();
    }, correct);
  };

  await answerOne(false);
  await page.waitForTimeout(250);
  const feedback = await page.textContent("#quizFeedback");
  assert(feedback.includes("答错"), "答错应有即时反馈: " + feedback);
  await page.waitForTimeout(1000);
  for (let i = 0; i < 3; i++) {
    await answerOne(true);
    await page.waitForTimeout(1100);
  }
  await page.waitForSelector("#quizBody .q-center", { timeout: 4000 });
  const retestText = await page.textContent("#quizBody");
  assert(retestText.includes("重新考察"), "应进入错题重考环节");
  await page.click("#quizBody .btn");
  await answerOne(true);
  await page.waitForTimeout(1100);
  await page.waitForSelector("#quizBody .q-center", { timeout: 4000 });
  const summaryText = await page.textContent("#quizBody");
  assert(summaryText.includes("本轮答题完成"), "应有完成总结");
  await page.click("#quizBody .btn");

  const quizState = await page.evaluate((targetCode) => {
    const st = JSON.parse(localStorage.getItem("desaar_memory_v1"));
    const targetId = PRODUCTS.find(p => p.code === targetCode).id;
    const learning = Object.values(st.srs).filter(s => s.reps > 0 && !s.wrong && (s.interval || 0) < 120).length;
    return {
      wrong: st.srs[targetId].wrong,
      quizCorrect: st.srs[targetId].quizCorrect,
      learning
    };
  }, targetCode);
  assert(quizState.wrong === true && quizState.quizCorrect === 1, "重考答对 1 次应仍在错题本");
  assert(quizState.learning === 3, "答题不应改变“学习中”: " + quizState.learning);

  // 累计答对 3 次 → 掌握并移出错题本
  const mastery = await page.evaluate((targetCode) => {
    const id = PRODUCTS.find(p => p.code === targetCode).id;
    recordQuizResult(id, true);
    recordQuizResult(id, true);
    const st = JSON.parse(localStorage.getItem("desaar_memory_v1"));
    return { stage: st.srs[id].stage, wrong: st.srs[id].wrong, interval: st.srs[id].interval };
  }, targetCode);
  assert(mastery.stage === "mastered" && mastery.wrong === false && mastery.interval >= 120,
    "累计答对 3 次应掌握: " + JSON.stringify(mastery));
  await page.evaluate(() => refreshHome());
  assert((await page.textContent("#stPending")) === "255", "待学习应随学习减少: " + (await page.textContent("#stPending")));

  // 基础回归
  await page.click('.tabbar button[data-tab="library"]');
  const groupTitles = await page.$$eval("#libList .sec-title", els => els.map(e => e.textContent));
  assert(groupTitles.length >= 15, "产品库应有多个品类分组");
  await page.click('.tabbar button[data-tab="search"]');
  await page.fill("#searchInput", "德赛精 KF");
  await page.waitForTimeout(350);
  const hits = await page.$$eval("#searchResult .row", els => els.length);
  assert(hits >= 1, "搜索应命中德赛精 KF");
  await page.click("#searchResult .row");
  await page.waitForTimeout(200);
  const detailCode = (await page.textContent(".d-head .code")).trim();
  assert(detailCode.includes("KF"), "详情页应显示 KF");
  const specValues = await page.$$eval("#view-detail .kv .v", els => els.length);
  assert(specValues >= 3, "详情页应有规格指标");
  await page.click("#btnBack");
  await page.click('.tabbar button[data-tab="search"]');
  await page.fill("#searchInput", "D Pigments");
  await page.waitForTimeout(350);
  await page.click("#searchResult .row");
  await page.waitForTimeout(200);
  const seriesRows = await page.$$eval("#view-detail table.series tr", els => els.length);
  assert(seriesRows >= 15, "颜料膏应有颜色系列表");

  // 系统返回：详情 -> 搜索 -> 产品库 -> 首页
  await page.goBack();
  await page.waitForTimeout(400);
  const backState1 = await page.evaluate(() => [...document.querySelectorAll(".view")].filter(v => !v.classList.contains("hidden")).map(v => v.id).join(","));
  assert(backState1 === "view-search", "返回应回到搜索页, 实际: " + backState1);
  await page.goBack();
  await page.waitForTimeout(400);
  const backState2 = await page.evaluate(() => [...document.querySelectorAll(".view")].filter(v => !v.classList.contains("hidden")).map(v => v.id).join(","));
  assert(backState2 === "view-library", "返回应回到产品库, 实际: " + backState2);
  await page.goBack();
  await page.waitForTimeout(400);
  const backState3 = await page.evaluate(() => [...document.querySelectorAll(".view")].filter(v => !v.classList.contains("hidden")).map(v => v.id).join(","));
  assert(backState3 === "view-home", "返回应回到首页, 实际: " + backState3);

  const errs = errors.filter(e => !e.includes("favicon"));
  console.log("学习首卡:", firstCode, "| 答错反馈:", feedback);
  console.log("答题队列:", quizTotal, "| 首个:", firstQuizCode, "| 学习中:", studyState.learning, "->", quizState.learning);
  console.log("重考后: wrong=", quizState.wrong, "quizCorrect=", quizState.quizCorrect, "| 3次后:", mastery.stage);
  console.log("搜索命中:", hits, "| 详情:", detailCode, "| 规格项:", specValues, "| 品类分组:", groupTitles.length);
  console.log(errs.length ? "JS 错误:\n" + errs.join("\n") : "无 JS 报错，测试通过");
  await browser.close();
  if (errs.length) process.exit(1);
})().catch(e => {
  console.error("测试失败:", e.message);
  process.exit(1);
});
