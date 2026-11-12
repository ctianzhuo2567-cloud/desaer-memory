# 学习资料接入

底部「学习资料」用于查阅图谱与讲义。速记图谱在手机上打开横屏阅读器，按工段切换原图，可双指缩放、拖动查看，也可用按钮放大、缩小或回到全图。浏览器允许时使用系统横屏，其他情况下在页面内横排。

资料数组位于 `data/materials.json`，每项使用稳定、唯一的 `id`。图谱使用 `maps`，每页的 WebP 原图放在 `data/materials/`。保留 `branches` 的标题与速记文字，便于屏幕阅读器读取，也可选填页脚提示 `note`。纯文本资料可以用 `sections`，各章包含 `title` 和 `paragraphs`。

```json
[
  {
    "id": "sample",
    "title": "图谱标题",
    "summary": "图谱范围",
    "maps": [
      {
        "title": "水场基础",
        "image": "catalog-example.webp",
        "width": 2222,
        "height": 1571,
        "count": 1,
        "branches": [{
          "title": "浸水",
          "text": "KMI：杀菌。"
        }],
        "note": "型号省略品牌前缀。"
      }
    ]
  }
]
```

修改资料后按 [维护操作手册](maintenance.md) 重建并检查网页。图文内嵌到 `index.html`，资料更新会改变构建版本。网页完成缓存后可离线查阅，发布到现有 GitHub Pages 的资料随站点公开访问。

## 制革工序知识

`leather-process-knowledge` 根据用户于 2026-11-12 提供的三张 DECISION 培训图整理，分别对应原第 4、8、9 页。准备工段 14 道、复鞣工段 6 道、涂饰工段 10 道。工序顺序、参数和加料说明来自这三张图，未补充图外配方。预浸水的 pH 按图保留为 `7.5±1`；辊涂量保留 `8–12 g/sf` 原单位。

该资料标记 `mapKind: "流程图"`，各页用 `flow.columns` 和 `flow.steps` 保存工序。每道工序保留稳定的 `id`，包含 `title`、可选的 `parameters`（标签和值的二元数组）、`instructions`（说明数组）和 `materials`（材料数组）。`flow.notes` 保存工段备注，`sourcePage` 记录来源页码。

目前每道工序的 `materials` 为空，表示用户尚未提供材料用量。后续每项可填写 `name`、`dosage`、`basis`、`note`。百分比必须记录对应的计量基准；资料未说明时先向用户核实，不能默认按原皮重、灰皮重或削匀革重计算。稀释比例和工序添加量分别记录。

`tools/render_process_flow.py` 在构建时将结构化数据生成矢量流程图，并生成对应的无障碍文字。图谱与既有 WebP 一样内嵌到页面，沿用横屏、缩放、拖动和离线阅读。新增材料说明后卡片高度随内容调整。
