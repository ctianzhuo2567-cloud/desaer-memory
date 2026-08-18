# 百品记项目长期规则

## 项目与构建

- 这是静态 PWA；源码主文件是 `app/template.html`，产品数据在 `data/products.json`。
- 修改页面或数据后，运行 `tools/build_app.py data/products.json app output`，并将生成的 `index.html`、`manifest.webmanifest`、`sw.js` 同步到项目根目录。
- 根目录的生成文件用于 GitHub Pages 发布；不要只改生成后的 `index.html`，必须同时保留源码修改。
- 不要提高 `state.meta.dataEpoch`，否则会清除用户已有的学习进度。

## GitHub 发布方式

- 仓库：`ctianzhuo2567-cloud/desaer-memory`，发布分支：`master`，网页：`https://ctianzhuo2567-cloud.github.io/desaer-memory/`。
- 常规顺序：完成修改 → 运行相关检查 → 提交本地 Git → 等待用户明确授权发布。
- 用户明确说“推送”“发布”或“授权推送”后，直接执行 `git push origin master`；不创建分支、不创建 PR。
- 推送后确认 `master` 与 `origin/master` 已同步，并说明 GitHub Pages 会自动更新。
- 未获用户明确授权，不得推送或发布到 GitHub。

## 学习功能不可混淆的规则

- 每日学习（快速认型）保留“不认识、模糊、认识、掌握”四种反馈方式。
- 专项学习的卡片仅使用“上一个、下一个”；最后一张显示“完成今日学习”。
- 快速认型与深度掌握是两套独立学习方案；专项学习也必须保持独立，不能因为修改一处而影响其他板块。
- 快速认型仅考分类/类型；深度掌握考性能、成分、规格、应用和 pH。
- 深度掌握使用用户选择的产品池，每天随机安排 5 个产品；不要把它改成专项学习。

## 界面约定

- 首页只保留“快速认型 / 深度掌握”切换按钮，不显示两套方案的概览卡。
- 快速认型使用蓝色；深度掌握整体使用低饱和莫兰迪紫，包含主按钮、悬停状态与移动端浏览器主题色。
- 界面文字保持简洁、中文、面向非技术用户。
