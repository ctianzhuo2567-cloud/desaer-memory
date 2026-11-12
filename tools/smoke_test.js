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
  await page.click('[data-tab="materials"]');
  const materialCount = await page.evaluate(() => MATERIALS.length);
  assert(await page.isVisible("#view-materials"), "底部入口应打开学习资料");
  assert(await page.isVisible("#materialsEmpty") === (materialCount === 0), "空目录应显示待添加提示");
  const quickMap = page.getByRole("button", { name:/德赛尔产品目录.*三页速记/ });
  await quickMap.click();
  await page.waitForFunction(() => document.querySelector(".map-canvas img")?.naturalWidth > 0);
  assert(await page.isVisible("#view-material") && await page.locator(".map-pages button").count() === 3, "资料应打开三页图谱");
  assert(await page.isVisible(".map-canvas img"), "宽屏应显示原图");
  const desktopViewport = page.viewportSize();
  await page.setViewportSize({width:320, height:740});
  assert(await page.locator(".map-viewer").evaluate(el => el.clientWidth > el.clientHeight && getComputedStyle(el).transform !== "none"), "竖握手机应打开横屏图谱");
  for(const stage of ["水场基础","复鞣与染整","涂饰材料"]){
    await page.getByRole("button", {name:stage, exact:true}).click();
    assert(await page.locator(".map-canvas img").getAttribute("alt") === stage + "思维导图", "切换工段应显示对应原图");
  }
  const mapTransform = () => page.locator(".map-canvas img").evaluate(el => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return {scale:matrix.a, left:matrix.e};
  });
  const fitted = await mapTransform();
  for(let i = 0; i < 3; i++) await page.getByRole("button", {name:"放大", exact:true}).click();
  const enlarged = await mapTransform();
  assert(enlarged.scale > fitted.scale, "放大应改变图谱比例");
  await page.locator(".map-canvas").press("ArrowRight");
  assert((await mapTransform()).left < enlarged.left, "放大后应能水平平移");
  await page.getByRole("button", {name:"全图", exact:true}).click();
  assert((await mapTransform()).scale === fitted.scale, "全图应回到初始比例");
  assert(await page.locator("#materialBody input").count() === 0, "速记图谱阅读页只提供工段浏览");
  await page.locator(".map-close").click();
  await page.waitForSelector("#view-materials");
  await page.setViewportSize(desktopViewport);
  await page.getByRole("button", {name:/制革工序知识/}).click();
  const expectedSteps = [
    ["准备工段", "预浸水、脱脂|去肉|主浸水、脱脂|浸灰|去肉|片皮|预脱灰|主脱灰、脱脂|软化|水洗|浸酸|鞣制|防霉、提碱|出鼓陈放"],
    ["复鞣工段", "回软|铬复鞣|中和|填充|加脂|固定"],
    ["涂饰工段", "补伤|磨革|封底|底浆|压花|摔软|绷板|面浆|顶光|打软"]
  ];
  for(const [title, sequence] of expectedSteps){
    await page.getByRole("button", {name:title, exact:true}).click();
    await page.waitForFunction(() => document.querySelector(".map-canvas img")?.naturalWidth > 0);
    const flow = await page.evaluate(title => {
      const material = MATERIALS.find(item => item.id === "leather-process-knowledge");
      const map = material.maps.find(item => item.title === title);
      const svg = new DOMParser().parseFromString(atob(map.image.split(",")[1]), "image/svg+xml");
      return {sequence:map.flow.steps.map(step => step.title).join("|"),
        missingMaterials:map.flow.steps.every(step => step.materials.length === 0),
        svgValid:svg.querySelector("svg") && !svg.querySelector("parsererror"),
        count:map.count, transcript:document.querySelector(".map-transcript").textContent};
    }, title);
    assert(flow.sequence === sequence && flow.count === sequence.split("|").length, "工序顺序与数量应和原图一致");
    assert(flow.svgValid && flow.missingMaterials, "流程图应生成有效矢量图，未提供的材料用量应留空");
    assert(flow.transcript.includes("道工序") && !flow.transcript.includes("个型号"), "流程资料应使用工序计数");
    assert(await page.locator(".map-canvas img").getAttribute("alt") === title + "流程图", "新资料切页应显示对应流程图");
  }
  const processFacts = await page.evaluate(() => {
    const pages = MATERIALS.find(item => item.id === "leather-process-knowledge").maps;
    return {ph:pages[0].flow.steps[0].parameters[0][1],
      acid:pages[0].flow.steps[10].instructions[0],
      fat:pages[1].flow.steps[4].instructions[0],
      wash:pages[1].flow.notes[0],
      roller:pages[2].flow.steps[3].parameters[0][1]};
  });
  assert(processFacts.ph === "7.5±1" && processFacts.acid.includes("1∶10 冷水化开，冷凉后分次加入") && processFacts.fat.includes("55℃ 热水 1∶3 乳化") && processFacts.wash.includes("回软后、中和后") && processFacts.roller === "8–12 g/sf", "原图参数、稀释说明、水洗位置和单位应保留");
  await page.setViewportSize({width:390, height:844});
  const flowFit = await mapTransform();
  await page.getByRole("button", {name:"放大", exact:true}).click();
  assert((await mapTransform()).scale > flowFit.scale, "流程资料应沿用手机缩放");
  await page.locator(".map-close").click();
  await page.waitForSelector("#view-materials");
  assert(await page.evaluate(() => !document.body.classList.contains("map-reading")), "离开流程资料应恢复页面滚动");
  await page.setViewportSize(desktopViewport);
  await quickMap.click();
  await page.click("#btnMaterialBack");
  await page.waitForSelector("#view-materials");
  await quickMap.click();
  await page.click('[data-tab="home"]');
  await page.waitForSelector("#view-home");
  assert(await page.evaluate(() => navDepth === 0 && history.state.view === "home"), "从资料详情切回学习应退出资料返回层");

  const eligibleCount = await page.evaluate(() => PRODUCTS.filter(p => !p.retired).length);
  assert((await page.textContent("#stPending")) === String(eligibleCount), "待学习初始应只包含未淘汰产品");
  assert((await page.textContent("#stNew")) === "20", "新卡默认 20");

  // 旧版单一进度必须一次性迁移到快速认型，且不误写入深度掌握。
  const migrated = await page.evaluate(() => {
    const old = { srs:{demo:{reps:2, interval:7, due:Date.now(), wrong:false, stage:"reviewing"}}, meta:{dailyNew:20}, notes:{demo:{memo:"保留"}} };
    const next = normalizeState(old);
    return { quick:next.plans.quick.srs.demo, deepCount:Object.keys(next.plans.deep.srs).length, quickDaily:next.plans.quick.meta.dailyNew, note:next.notes.demo.memo };
  });
  assert(migrated.quick && migrated.quick.level === 3 && migrated.deepCount === 0 && migrated.quickDaily === 20 && migrated.note === "保留", "旧进度应迁移到快速认型并保留备注");

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

  const retirement = await page.evaluate(() => ({
    count: PRODUCTS.filter(p => p.retired).length,
    kf: PRODUCTS.find(p => p.code === "DESOAGEN KF")?.retired === true,
    missing: PRODUCTS.filter(p => p.retired && !p.code).length
  }));
  assert(retirement.count === 53 && retirement.kf && retirement.missing === 0, "应保留未收录产品的淘汰记录并恢复在册产品状态");
  const manualCorrections = await page.evaluate(() => ({
    asw: PRODUCTS.find(p => p.id === "desosseasw"),
    ls30: PRODUCTS.find(p => p.id === "desossels30"),
    dc3333: PRODUCTS.find(p => p.id === "desoraydc3333")
  }));
  assert(manualCorrections.asw?.code === "DESOSSE ASW" && !manualCorrections.asw.retired && manualCorrections.ls30?.code === "DESOSSE LS30" && manualCorrections.dc3333?.code === "DESORAY DC3333", "ASW 应恢复在册，产品代码应与说明书一致且保留原产品 ID");
  const latestAdditions = await page.evaluate(() => ["DESOAGEN WG", "DESOAGEN DG", "DESOAGEN ZF", "DESOAGEN TLB", "DESOAGEN TLE", "DESOBATE FE-20", "DESOATEN ST-20", "DESOATEN A-40", "DESOATEN SF", "DESOPON UM", "DESOPON FS-A", "DESOPON UHX", "DESORAY DA3116", "DESORAY DU3291", "DESOTOP TU4265", "DESOCOR CW8516", "DESOFU M Pigments"].filter(code => PRODUCTS.some(p => p.code === code)));
  assert(latestAdditions.length === 17, "最新版说明书的 17 个新增产品应进入产品库");

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

  // 快速认型每日新产品数改为 3
  await page.click('.tabbar button[data-tab="me"]');
  await page.evaluate(() => {
    state.plans.quick.meta.dailyNew = 3;
    state.plans.quick.meta.batchDay = "";
    saveState();
  });
  await page.click('.tabbar button[data-tab="home"]');

  // 注入一条“昨天的错题”，验证次日排在最前
  const targetCode = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("desaar_memory_v1"));
    const batch = st.plans.quick.meta.batch || [];
    const target = PRODUCTS.find(p => !p.retired && !batch.includes(p.id));
    st.plans.quick.srs[target.id] = {
      reps: 0, lapses: 0, interval: 0, due: 0,
      wrong: true, lastWrong: Date.now() - 86400000, introDay: "", stage: "wrong", quizCorrect: 0, level:-1, mastered:false, plan:"quick"
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
  await page.click("#flashcard");
  const quickAnswerFace = await page.evaluate(() => {
    const back = document.querySelector("#fcBack");
    const style = getComputedStyle(back);
    return {
      centered: back.classList.contains("quick-answer-face") && style.alignItems === "center" && style.justifyContent === "center",
      name: back.querySelector(".quick-answer-name")?.textContent || "",
      category: back.querySelector(".quick-answer-category")?.textContent || "",
      typeProminent: (() => {
        const type = back.querySelector(".quick-answer-type");
        const typeStyle = type ? getComputedStyle(type) : null;
        return !!typeStyle && parseFloat(typeStyle.fontSize) >= 20 && typeStyle.backgroundColor !== "rgba(0, 0, 0, 0)";
      })()
    };
  });
  assert(quickAnswerFace.centered && quickAnswerFace.name && quickAnswerFace.category && quickAnswerFace.typeProminent, "快速认型翻面应居中显示产品名称和品类，并突出产品类型");
  await page.click("#flashcard");

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
    const learning = Object.values(st.plans.quick.srs).filter(s => s.reps > 0 && !s.wrong && !s.mastered).length;
    return { againWrong: st.plans.quick.srs[againId].wrong, learning };
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
      const els = Array.from(document.querySelectorAll(".quiz-card .opt"));
      const target = correct ? els[quiz.current.correctIndex] : els.find((e, i) => i !== quiz.current.correctIndex);
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
    const learning = Object.values(st.plans.quick.srs).filter(s => s.reps > 0 && !s.wrong && !s.mastered).length;
    return {
      wrong: st.plans.quick.srs[targetId].wrong,
      quizCorrect: st.plans.quick.srs[targetId].quizCorrect,
      learning
    };
  }, targetCode);
  assert(quizState.wrong === true && quizState.quizCorrect === 1, "重考答对 1 次应仍在错题本");
  assert(quizState.learning === 3, "答题不应改变“学习中”: " + quizState.learning);

  // 累计答对 3 次 → 掌握并移出错题本
  const mastery = await page.evaluate((targetCode) => {
    const id = PRODUCTS.find(p => p.code === targetCode).id;
    recordQuizResult(id, true, "quick");
    recordQuizResult(id, true, "quick");
    const st = JSON.parse(localStorage.getItem("desaar_memory_v1"));
    return { stage: st.plans.quick.srs[id].stage, wrong: st.plans.quick.srs[id].wrong, interval: st.plans.quick.srs[id].interval };
  }, targetCode);
  assert(mastery.stage === "mastered" && mastery.wrong === false && mastery.interval >= 21,
    "累计答对 3 次应掌握: " + JSON.stringify(mastery));
  await page.evaluate(() => refreshHome());
  assert((await page.textContent("#stPending")) === String(eligibleCount - 4), "待学习应随学习减少: " + (await page.textContent("#stPending")));

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
  const retiredActions = await page.evaluate(() => ({
    label: Array.from(document.querySelectorAll("#detailBody button")).find(b => b.textContent.includes("已淘汰"))?.textContent || "",
    disabled: Array.from(document.querySelectorAll("#detailBody button")).filter(b => b.textContent.includes("已淘汰")).every(b => b.disabled)
  }));
  assert(retiredActions.label && retiredActions.disabled, "淘汰产品详情不应允许新学习或加入新池");
  const specValues = await page.$$eval("#view-detail .kv .v", els => els.length);
  assert(specValues >= 3, "详情页应有规格指标");
  await page.click("#btnBack");
  await page.waitForTimeout(300);
  await page.fill("#searchInput", "CW8323");
  await page.waitForTimeout(350);
  assert(await page.$$eval("#libList .row", els => els.length) === 1, "新增产品 CW8323 应可唯一检索");
  await page.click("#libList .row");
  await page.waitForTimeout(200);
  assert((await page.textContent(".d-head .code")).trim() === "DESOCOR CW8323", "新增产品详情应显示 CW8323");
  assert((await page.textContent("#detailBody")).includes("水晶高光效果"), "新增产品详情应保留说明书性能");
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

  // 深度掌握：详情页一键加入产品池；每日从该池随机抽取，卡片使用深度信息，pH 仅对有数据的产品出题。
  const deepProduct = await page.evaluate(() => {
    const p = PRODUCTS.find(p => !p.retired && phOf(p) && deepDistractorPool("ph", phOf(p)).length >= 3) || PRODUCTS.find(p => !p.retired && p.features && p.features.length);
    openDetail(p.id);
    return p.code;
  });
  await page.waitForTimeout(150);
  await page.locator("#detailBody button", { hasText: "加入深度掌握" }).click();
  await page.click("#btnBack");
  await page.waitForTimeout(150);
  await page.click("#btnPlanDeep");
  await page.waitForTimeout(100);
  const deepPool = await page.evaluate(() => ({ selected:state.plans.deep.selectedIds.length, active:activePlan, fresh:newRemaining("deep"), hasSummary:!!document.querySelector("#planSummary"), brand:getComputedStyle(document.body).getPropertyValue("--brand").trim() }));
  assert(deepPool.selected === 1 && deepPool.active === "deep" && deepPool.fresh === 1 && !deepPool.hasSummary && deepPool.brand === "#766d91", "深度掌握应使用莫兰迪紫，且不显示方案概览卡");
  const phQuestion = await page.evaluate(() => {
    const p = PRODUCTS.find(p => phOf(p) && deepDistractorPool("ph", phOf(p)).length >= 3);
    if(!p) return null;
    const types = deepQuestionTypes(p);
    return buildDeepQuestion(p.id, types.indexOf("ph"));
  });
  assert(phQuestion && phQuestion.qtype === "ph" && phQuestion.prompt.includes("pH"), "深度掌握应为有 pH 指标的产品生成 pH 题");
  await page.click("#btnStart");
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => session.plan === "deep" && document.querySelectorAll(".rate-btn").length === 4), "深度掌握应使用独立进度并保留四级反馈");
  await page.click("#btnQuitStudy");
  await page.waitForTimeout(150);
  await page.click("#btnManageDeep");
  await page.waitForTimeout(150);
  assert(await page.isVisible("#deepPickBulk"), "深度掌握选品页应显示批量选择控件");
  await page.locator("#pickCatChips button", { hasText: "浸水" }).click();
  const soakingIds = await page.evaluate(() => PRODUCTS.filter(p => p.category === "浸水" && !p.retired).map(p => p.id));
  await page.click("#btnPickSelectCategory");
  const categorySelection = await page.evaluate(() => ({ selected:pickSelected.slice(), active:PRODUCTS.filter(p => !p.retired).map(p => p.id) }));
  assert(soakingIds.every(id => categorySelection.selected.includes(id)) && categorySelection.selected.every(id => categorySelection.active.includes(id)), "分类全选应选中该分类全部在册产品且不纳入淘汰产品");
  await page.click("#btnPickSelectAll");
  const allSelection = await page.evaluate(() => ({ selected:pickSelected.slice(), active:PRODUCTS.filter(p => !p.retired).map(p => p.id) }));
  assert(allSelection.selected.length === allSelection.active.length && allSelection.active.every(id => allSelection.selected.includes(id)), "全部选择应选中所有在册产品且排除淘汰产品");
  await page.click("#btnPickSelectAll");
  assert(await page.evaluate(() => pickSelected.length === 0), "再次点击全选应可清空对应选择");
  await page.click("#btnPickClose");
  await page.waitForTimeout(150);
  await page.click("#btnPlanQuick");

  // 专项选产品：支持按与产品库相同的分类筛选，且可叠加搜索
  await page.click('.tabbar button[data-tab="projects"]');
  await page.click("#btnNewProject");
  await page.waitForTimeout(200);
  assert(await page.$$eval("#pickList .chip.retired", els => els.length) === 0, "新建专项的选品列表不应显示淘汰产品");
  const pickCats = await page.$$eval("#pickCatChips button", els => els.map(e => e.textContent.trim()));
  assert(pickCats.includes("全部") && pickCats.includes("浸水") && pickCats.includes("脱脂"), "专项选产品应显示产品库分类");
  await page.locator("#pickCatChips button", { hasText: "浸水" }).click();
  const pickRowsAreSoaking = await page.$$eval("#pickList .row .s", els => els.length > 0 && els.every(e => e.textContent.includes("· 浸水")));
  assert(pickRowsAreSoaking, "选择浸水分类后应只显示浸水产品");
  await page.fill("#pickInput", "EWT");
  const filteredPickCodes = await page.$$eval("#pickList .row .t", els => els.map(e => e.textContent.trim()));
  assert(filteredPickCodes.length >= 1 && filteredPickCodes.every(code => code.includes("EWT")), "专项分类筛选应可叠加搜索");
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

  // 重置两套主学习方案时保留备注、在册深度选品池及专项数据，并排除已淘汰产品。
  const resetFixture = await page.evaluate(() => {
    const active = PRODUCTS.find(p => !p.retired);
    const retired = PRODUCTS.find(p => p.retired);
    const progress = (key) => Object.assign(blankSrs(key), { reps:2, wrong:true, due:Date.now() });
    state.plans.quick.srs = { [active.id]:progress("quick"), [retired.id]:progress("quick") };
    state.plans.deep.srs = { [active.id]:progress("deep"), [retired.id]:progress("deep") };
    state.plans.quick.meta.dailyNew = 15;
    state.plans.deep.meta.dailyNew = 8;
    state.plans.quick.meta.batch = [retired.id];
    state.plans.deep.meta.batch = [retired.id];
    state.plans.deep.selectedIds = [active.id, retired.id];
    state.plans.deep.meta.batchDay = dayKey();
    state.plans.deep.meta.batchSize = 8;
    state.plans.deep.meta.batchScheme = 4;
    state.notes[active.id] = { memo:"保留备注", competitor:"竞品信息" };
    state.projects = [{ id:"keep_reset_project", name:"保留专项", productIds:[active.id], createdAt:1, completed:false, completedAt:0 }];
    state.projectScores = { keep_reset_project:[{ date:dayKey(), score:90 }] };
    const epoch = state.meta.dataEpoch;
    activePlan = "deep";
    state.ui.activePlan = "deep";
    saveState();
    return { activeId:active.id, retiredId:retired.id, epoch:epoch };
  });
  await page.click('.tabbar button[data-tab="me"]');
  await page.waitForTimeout(150);
  page.once("dialog", dialog => dialog.accept());
  await page.click("#btnResetPlans");
  await page.waitForTimeout(150);
  const resetResult = await page.evaluate(({activeId, retiredId}) => {
    const quickBatch = dailyBatch("quick");
    const deepBatch = dailyBatch("deep");
    return {
      quickSrs:Object.keys(planOf("quick").srs).length,
      deepSrs:Object.keys(planOf("deep").srs).length,
      quickDaily:planOf("quick").meta.dailyNew,
      deepDaily:planOf("deep").meta.dailyNew,
      deepSelected:planOf("deep").selectedIds,
      memo:state.notes[activeId]?.memo,
      competitor:state.notes[activeId]?.competitor,
      projects:state.projects.map(p => p.id),
      score:state.projectScores.keep_reset_project?.[0]?.score,
      quickBatchRetired:quickBatch.some(id => byId(id)?.retired),
      deepBatchRetired:deepBatch.some(id => byId(id)?.retired),
      activePlan:activePlan,
      epoch:state.meta.dataEpoch,
      retiredId:retiredId
    };
  }, resetFixture);
  assert(resetResult.quickSrs === 0 && resetResult.deepSrs === 0 && resetResult.quickDaily === 15 && resetResult.deepDaily === 8, "重置应清空两套卡片进度并保留每日新增设置");
  assert(resetResult.deepSelected.length === 1 && resetResult.deepSelected[0] === resetFixture.activeId && !resetResult.deepSelected.includes(resetResult.retiredId), "重置应保留深度在册选品并剔除淘汰产品");
  assert(resetResult.memo === "保留备注" && resetResult.competitor === "竞品信息" && resetResult.projects.includes("keep_reset_project") && resetResult.score === 90, "重置不应影响产品备注、专项项目或成绩");
  assert(!resetResult.quickBatchRetired && !resetResult.deepBatchRetired && resetResult.activePlan === "deep" && resetResult.epoch === resetFixture.epoch, "新批次不得包含淘汰产品，重置也不得改变方案选择或 dataEpoch");

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
