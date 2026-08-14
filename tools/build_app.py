#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 products.json 注入应用模板，生成 index.html 与 PWA 文件。

用法: build_app.py <products.json> <app目录> <输出目录>
输出: index.html, sw.js, manifest.webmanifest, icon-192.png, icon-512.png, apple-touch-icon.png
版本号 = (模板 + 产品数据 + service worker 模板 + manifest + 图标) 的内容哈希前 8 位，内容不变则版本不变。
"""

import datetime
import hashlib
import io
import json
import os
import shutil
import sys


def main():
    if len(sys.argv) != 4:
        raise SystemExit("用法: build_app.py <products.json> <app目录> <输出目录>")
    data_path, app_dir, out_dir = sys.argv[1:4]

    data = json.load(io.open(data_path, encoding="utf-8"))
    products = data["products"]
    payload = json.dumps(products, ensure_ascii=False, separators=(",", ":"))

    template = io.open(os.path.join(app_dir, "template.html"), encoding="utf-8").read()
    sw_template = io.open(os.path.join(app_dir, "sw.template.js"), encoding="utf-8").read()
    manifest = io.open(os.path.join(app_dir, "manifest.webmanifest"), encoding="utf-8").read()
    icon_names = ("icon-192.png", "icon-512.png", "apple-touch-icon.png")
    icon_bytes = []
    for name in icon_names:
        with io.open(os.path.join(app_dir, name), "rb") as f:
            icon_bytes.append(f.read())

    version = hashlib.sha256(
        template.encode("utf-8")
        + b"\0"
        + payload.encode("utf-8")
        + b"\0"
        + sw_template.encode("utf-8")
        + b"\0"
        + manifest.encode("utf-8")
        + b"\0"
        + b"\0".join(icon_bytes)
    ).hexdigest()[:8]
    build_date = datetime.date.today().isoformat()

    marker = "/*__PRODUCTS__*/"
    if marker not in template:
        raise SystemExit("模板中缺少数据占位符 /*__PRODUCTS__*/")
    html = template.replace(marker, payload + " ||", 1)
    html = html.replace("/*__VERSION__*/", version).replace("/*__BUILD_DATE__*/", build_date)

    sw = sw_template.replace("__VERSION__", version)

    os.makedirs(out_dir, exist_ok=True)
    index_path = os.path.join(out_dir, "index.html")
    io.open(index_path, "w", encoding="utf-8", newline="\n").write(html)
    io.open(os.path.join(out_dir, "sw.js"), "w", encoding="utf-8", newline="\n").write(sw)
    shutil.copyfile(
        os.path.join(app_dir, "manifest.webmanifest"),
        os.path.join(out_dir, "manifest.webmanifest"),
    )
    for name in icon_names:
        shutil.copyfile(os.path.join(app_dir, name), os.path.join(out_dir, name))

    print(
        "生成 %s（%.1f KB，%d 个产品），版本 %s（%s）"
        % (index_path, len(html.encode("utf-8")) / 1024, len(products), version, build_date)
    )


if __name__ == "__main__":
    main()
