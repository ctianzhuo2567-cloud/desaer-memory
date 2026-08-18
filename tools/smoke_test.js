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
  assert((await page.textContent("#stPending")) === "263", "待学习初始应为 263");
  assert((await page.textContent("#stNew")) === "20", "新卡默认 20");

  // 新增产品应进入产品库；ESP 按用户要求归入浸水分类，且“关于”页只保留版本信息。
  const catalogUpdate = await page.evaluate(() => {
    const wanted = ["DESOPON FS", "DESOPON MLS", "DESOATEN DR", "DESOAGEN MO-20", "DESOBATE ESP"];
    return {
      products: PRODUCTS.filter(p => wanted.includes(p.code)).map(p => ({ code:p.code, category:p.category, type:p.type })),
      hasSourceText: document.querySelector("#view-me").textContent.includes("产品数据来自")
    };
  });
  assert(catalogUpdate.products.length === 5, "产品库应包含 5 个指定产品且不重复");
  const esp = catalogUpdate.products.find(p => p.code === "DESOBATE ESP");
  assert(esp && esp.category === "浸水" && esp.type === "浸水酶", "ESP 应归入浸水分类并标为浸水酶");
  assert(!catalogUpdate.hasSourceText, "关于页不应再显示产品数据来源说明");

  // 专项答题的外观只应使用形态，不包含颜色、透明度等描述
  const appearanceShapes = await page.evaluate(() => [...new Set(PRODUCTS.map(appearanceOf).filter(Boolean))]);
  const allowedShapes = ["液体", "粘稠液体", "粉体", "膏状", "乳液", "浆状", "颗粒", "固体", "液体或膏状"];
  assert(appearanceShapes.includes("液体") && !appearanceShapes.includes("透明液体"), "外观题应归类为简洁形态");
  assert(appearanceShapes.every(shape => allowedShapes.includes(shape)), "外观题不应出现颜色或透明度描述: " + appearanceShapes.join("、"));

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

  // 阶段一：每日学习保留四级记忆反馈；专项学习才使用上一个和下一个。
  await page.click("#btnStart");
  await page.waitForTimeout(250);
  const firstCode = (await page.textContent("#fcCode")).trim();

  // 学习中可进入详情补充竞品与备注，返回后应回到同一张卡片
  await page.click("#btnStudyDetail");
  await page.waitForTimeout(250);
  assert(await page.evaluate(() => !document.querySelector("#view-detail").classList.contains("hidden")), "学习中应能打开产品详情");
  assert((await page.textContent(".d-head .code")).trim() === firstCode, "详情应对应当前学习卡片");
  await page.fill("#competitorsInput", "学习中测试竞品");
  await page.fill("#memoInput", "学习中测试备注");
  await page.click("#btnSaveNotes");
  await page.goBack();
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => !document.querySelector("#studyOverlay").classList.contains("hidden")), "详情返回后应继续学习");
  assert((await page.textContent("#fcCode")).trim() === firstCode, "详情返回后应回到同一张学习卡片");
  const studyNotes = await page.textContent("#fcBubbles");
  assert(studyNotes.includes("学习中测试竞品") && studyNotes.includes("学习中测试备注"), "学习中保存的竞品与备注应立即显示");

  const dailyStudyNav = await page.evaluate(() => ({
    rateButtons: document.querySelectorAll(".rate-btn").length,
    projectNavHidden: document.querySelector("#projectStudyActions").classList.contains("hidden"),
    noteLabel: document.querySelector("#btnStudyDetail").textContent
  }));
  assert(dailyStudyNav.rateButtons === 4 && dailyStudyNav.projectNavHidden && dailyStudyNav.noteLabel === "补充竞品与备注", "每日学习应显示四级记忆反馈，专项导航不应出现");
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
  assert(studyState.againWrong === false, "翻卡“不认识”不应进错题本");
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
  assert((await page.textContent("#stPending")) === "259", "待学习应随学习减少: " + (await page.textContent("#stPending")));

  // 基础回归
  await page.click('.tabbar button[data-tab="library"]');
  const groupTitles = await page.$$eval("#libList .sec-title", els => els.map(e => e.textContent));
  assert(groupTitles.length >= 15, "产品库应有多个品类分组");
  await page.fill("#searchInput", "德赛精 KF");
  await page.waitForTimeout(350);
  const hits = await page.$$eval("#libList .row", els => els.length);
  assert(hits >= 1, "搜索应命中德赛精 KF");
  await page.click("#libList .row");
  await page.waitForTimeout(200);
  const detailCode = (await page.textContent(".d-head .code")).trim();
  assert(detailCode.includes("KF"), "详情页应显示 KF");
  const specValues = await page.$$eval("#view-detail .kv .v", els => els.length);
  assert(specValues >= 3, "详情页应有规格指标");
  await page.click("#btnBack");
  await page.waitForTimeout(300);
  await page.fill("#searchInput", "D Pigments");
  await page.waitForTimeout(350);
  await page.click("#libList .row");
  await page.waitForTimeout(200);
  const seriesRows = await page.$$eval("#view-detail table.series tr", els => els.length);
  assert(seriesRows >= 15, "颜料膏应有颜色系列表");

  // 返回详情前的产品库，再切回首页
  await page.click("#btnBack");
  await page.waitForTimeout(300);
  const backState = await page.evaluate(() => [...document.querySelectorAll(".view")].filter(v => !v.classList.contains("hidden")).map(v => v.id).join(","));
  assert(backState === "view-library", "返回应回到产品库, 实际: " + backState);
  await page.click('.tabbar button[data-tab="home"]');

  // 专项选产品：支持按与产品库相同的分类筛选，且可叠加搜索
  await page.click('.tabbar button[data-tab="projects"]');
  await page.click("#btnNewProject");
  await page.waitForTimeout(200);
  const pickCats = await page.$$eval("#pickCatChips button", els => els.map(e => e.textContent.trim()));
  assert(pickCats.includes("全部") && pickCats.includes("浸水") && pickCats.includes("脱脂"), "专项选产品应显示产品库分类");
  await page.locator("#pickCatChips button", { hasText: "浸水" }).click();
  const pickRowsAreSoaking = await page.$$eval("#pickList .row .s", els => els.length > 0 && els.every(e => e.textContent.includes("· 浸水")));
  assert(pickRowsAreSoaking, "选择浸水分类后应只显示浸水产品");
  await page.fill("#pickInput", "KF");
  const filteredPickCodes = await page.$$eval("#pickList .row .t", els => els.map(e => e.textContent.trim()));
  assert(filteredPickCodes.length >= 1 && filteredPickCodes.every(code => code.includes("KF")), "专项分类筛选应可叠加搜索");
  await page.click("#btnPickClose");
  await page.waitForTimeout(200);

  // 专项得分可查看当次错题、自己的答案与正确答案，也可从近 7 天分数再次进入
  await page.evaluate(() => {
    const project = {
      id: "smoke_project",
      name: "测试专项",
      productIds: PRODUCTS.slice(0, 8).map(p => p.id),
      createdAt: Date.now(),
      completed: false,
      completedAt: 0
    };
    state.projects = [project];
    state.projectScores = {};
    saveState();
    openProject(project.id);
  });
  await page.waitForTimeout(200);

  // 专项学习必须覆盖每日学习遗留的完成页，不能露出“开始答题”并跳到每日答题。
  await page.evaluate(() => {
    document.querySelector("#ovBody").innerHTML = '<div class="done-box"><button id="btnToQuiz">开始答题</button></div>';
  });
  await page.locator("#projectBody button", { hasText: "开始今日专项学习" }).click();
  await page.waitForTimeout(150);
  const projectStudy = await page.evaluate(() => ({
    mode: session.mode,
    hasCard: !!document.querySelector("#ovBody #flashcard"),
    hasDailyQuizButton: !!document.querySelector("#ovBody #btnToQuiz"),
    shownCode: document.querySelector("#fcCode")?.textContent,
    rateActionsHidden: document.querySelector("#studyRateActions").classList.contains("hidden"),
    prevDisabled: document.querySelector("#btnProjectStudyPrev").disabled,
    nextLabel: document.querySelector("#btnProjectStudyNext").textContent
  }));
  assert(projectStudy.mode === "project" && projectStudy.hasCard && !projectStudy.hasDailyQuizButton && projectStudy.shownCode, "专项学习应重建卡片，不能沿用每日答题入口");
  assert(projectStudy.rateActionsHidden && projectStudy.prevDisabled && projectStudy.nextLabel === "下一个", "专项学习应仅显示上一个和下一个");
  await page.click("#btnProjectStudyNext");
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => session.idx === 1 && !document.querySelector("#btnProjectStudyPrev").disabled), "专项学习点击下一个后应进入下一张，且可返回上一张");
  await page.evaluate(() => { session.idx = session.queue.length - 1; session.done = session.idx; renderCard(); });
  assert((await page.textContent("#btnProjectStudyNext")) === "完成今日学习", "专项最后一张的下一个应显示为完成今日学习");
  await page.click("#btnProjectStudyNext");
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.querySelector("#studyOverlay").classList.contains("hidden") && !document.querySelector("#view-project").classList.contains("hidden")), "完成专项学习后应回到专项项目页");
  await page.locator("#projectBody button", { hasText: "今日专项答题" }).click();
  await page.waitForTimeout(150);
  const expectedCorrect = await page.evaluate(() => {
    const q = quiz.current;
    const wrongIndex = (q.correctIndex + 1) % q.options.length;
    document.querySelectorAll(".quiz-card .opt")[wrongIndex].click();
    return q.options[q.correctIndex];
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    clearTimeout(quiz.timer);
    quiz.timer = null;
    quiz.idx = quiz.queue.length;
    endQuizRound();
  });
  await page.waitForTimeout(100);
  assert(await page.$("#btnProjectScoreDetail"), "专项答题结束后得分应可点击查看详情");
  await page.click("#btnProjectScoreDetail");
  await page.waitForTimeout(150);
  const scoreDetail = await page.textContent("#scoreBody");
  assert(scoreDetail.includes("错误题目") && scoreDetail.includes("你的答案") && scoreDetail.includes("正确答案：" + expectedCorrect), "答题详情应显示错题和正确答案");
  await page.goBack();
  await page.waitForTimeout(150);
  assert(await page.$("#projectBody .ws-cell.has-score"), "项目页应显示可点击的当天得分");
  await page.click("#projectBody .ws-cell.has-score");
  await page.waitForTimeout(150);
  assert((await page.textContent("#scoreBody")).includes("正确答案：" + expectedCorrect), "近 7 天得分应能再次打开答题详情");
  await page.goBack();

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
