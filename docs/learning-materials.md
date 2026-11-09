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
