# 产品记忆 App 维护说明（给新对话窗口）

本文件写给以后在本项目里新建的对话窗口。新对话打开时先读这个文件，
再读仓库根目录的 `AGENTS.md`，按里面的沟通规则工作。

## 项目是什么

- 单文件网页应用（PWA），源码在 `app/template.html`，所有界面和逻辑都在这一个文件里。
- 产品数据在 `data/products.json`（259 个产品），构建时注入到网页里。
- 安卓壳（APK）只是加载线上网页，网页更新后手机端无需重装。
- 线上地址：`https://ctianzhuo2567-cloud.github.io/desaer-memory/`
- 远程仓库：`git@github.com:ctianzhuo2567-cloud/desaer-memory.git`（分支 `master`）

## 构建流程（每次改完必做）

1. 修改 `app/template.html` 和/或 `data/products.json`。
2. 运行构建脚本（`python` 可能不在 PATH，用
   `C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`，
   或先调用工作区依赖发现工具拿路径）：

   ```
   python tools/build_app.py data/products.json app output
   ```

3. 把 `output/` 里的构建产物复制到仓库根目录：
   `index.html`、`sw.js`、`manifest.webmanifest`、`icon-192.png`、`icon-512.png`、`apple-touch-icon.png`。
4. 语法自检：把 `index.html` 中最后一个 `<script>` 块抽出来跑 `node --check`。
5. 提交并推送：

   ```
   git add app/template.html data/products.json tools/xxx index.html sw.js ...
   git commit -m "说明改动"
   git push origin master
   ```

6. 推送后等 30–60 秒，确认线上已发布新版本（版本号是构建脚本按内容自动生成的 8 位哈希）：

   ```
   curl https://ctianzhuo2567-cloud.github.io/desaer-memory/sw.js
   ```

   看到新的 `VERSION` 才算完成。GitHub Pages 偶尔要等一两分钟，可轮询。

## 推送认证

- SSH 已配置好：`C:\Users\user\.ssh\config` 指向无口令密钥 `id_ed25519_desaer`，
  重启电脑后也不用再输口令。
- 沙箱里跑 `git push` 需要申请提权（网络 + 写 `.git`），正常请求即可。

## 重要约定（不要违反）

- **不要提高 `dataEpoch`**：那会清空所有用户的学习进度。只有产品 `id` 体系变更时才允许。
- 产品 `id` 是稳定的内部主键（如 `desoagenkf`），学习进度、错题、专项项目都依赖它，
  不要随增删产品而改动。
- 产品后台编号 `no`（1–259）：只用于数据管理，**界面不显示**。
  新增产品用 `python tools/assign_no.py data/products.json` 自动补号（新号 = 最大号 + 1，删除空号不复用）。
- `android/` 目录（MainActivity.java、AndroidManifest.xml、build.ps1、desaer-release.jks 等）
  除非用户明确要求，**不要提交**，也不要随意改签名相关文件。
- 版本号由构建脚本按内容哈希自动生成，不要手工改。
- 学习进度、专项项目存在浏览器 localStorage 里，导出/导入是整份 JSON。

## 页面与数据模型速览

- 底部主标签（只占一层返回栈，返回即退出）：`home`（学习）、`library`（产品库）、
  `projects`（专项学习）、`me`（我的）。
- 子页面（压一层返回）：`wrong`（错题本）、`search`（首页搜索入口）、
  `detail`（产品详情）、`project`（专项项目详情）。
- 浮层（压一层返回）：`studyOverlay`（学习卡片）、`quizOverlay`（答题）、
  `pickOverlay`（专项选产品）。
- 导航核心在 `template.html` 的 `show()`、`openDetail()`、`openProject()`、
  `popstate` 监听器，配合 `navDepth` 和 `pendingTabSwitch` 保证主标签不叠加。
  改动导航时保持这套机制一致，不要退化成每步 pushState。
- 主学习：每日从全部产品按“用户种子 + 日期”抽 `dailyNew` 个（默认 20），
  同一天稳定、不同用户不同、隔天更换。
- 学习卡片按钮：不认识/模糊 = 本轮末尾再复习；认识 = 隔 1 天；掌握 = 隔 7 天。
- 主答题：只考产品类型，答错进错题本，次日优先重考，累计答对 3 次移出。
- 专项学习：项目自选产品，每天学全部项目产品；专项答题按“项目 id + 日期”种子生成，
  题型在 类型/固含量/特点/主要成分/适用工段 间轮换，同天稳定、隔天不同，不进错题本；
  项目可完成归档、重新开启、删除。

## 多对话并发注意

- 同一时间只让一个对话窗口改代码。新对话开始前先 `git status` 确认工作区干净，
  不要覆盖另一个对话未提交的改动。
- 如果上一个对话已提交但还没推送，新对话直接推送即可。
