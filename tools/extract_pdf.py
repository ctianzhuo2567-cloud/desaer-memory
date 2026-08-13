#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从德赛尔产品说明书 PDF 提取结构化产品数据。

用法:
    python tools/extract_pdf.py <pdf路径> <输出json路径>

说明:
    - 说明书横向排版，每页 PDF = 左右两个半页，各带一个印刷页码；
    - 每个产品从某个半页开始（该半页含“主要成分”栏目），跨若干半页；
    - 目录页给出“品类 + 产品代号 + 类型 + 起始页码”，用作主索引；
    - 本脚本按“起始页码区间”把正文归位，再拆分栏目与规格。
"""

import io
import json
import re
import sys

import pdfplumber


CJK = "\u4e00-\u9fff"

CATEGORIES = {
    "浸水", "脱脂", "浸灰", "脱灰", "酶制剂", "鞣制助剂", "鞣剂",
    "复鞣剂", "加脂剂", "复鞣染色助剂", "丙烯酸树脂", "聚氨酯树脂",
    "综合树脂", "填料", "油蜡", "补伤膏", "助剂", "手感剂", "染料水", "颜料膏",
}

SECTION_HEADERS = [
    ("主要成分", "components"),
    ("主要组分", "components"),
    ("性能", "performance"),
    ("特点", "performance"),
    ("特征", "performance"),
    ("规格", "specs"),
    ("技术指标", "specs"),
    ("应用", "application"),
    ("运输与储存", "storage"),
    ("储存与运输", "storage"),
    ("安全须知", "safety"),
    ("示例", "examples"),
    ("注意", "notes"),
]

# 用户已确认的原文勘误：产品代号 -> {(原键, 原值): 正确键}
SPEC_FIXES = {
    "DESOPON UH": {("固含量%", "阴离子"): "离子性"},
}


def compact(s: str) -> str:
    """去掉非字母数字字符后小写，用于代号比对。"""
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def clean_code(s: str) -> str:
    s = re.sub(r"8?[®\u00ae]", "", s)
    s = s.replace("\u00ae", "").replace("®", "")
    s = re.split(r"[%s]" % CJK, s)[0]
    s = re.sub(r"[\s\u3000]+", " ", s).strip(" -–—.")
    return s


def collapse_doubled(s: str) -> str:
    """把同字重复的栏目标题（如“性性能能”）还原。"""
    return re.sub(r"([%s])\1+" % CJK, r"\1", s)


def group_lines(words, y_tol=3.0):
    """按 top 坐标把词聚成行（保序）。"""
    lines = []
    for w in sorted(words, key=lambda x: (x["top"], x["x0"])):
        if lines and abs(lines[-1][0] - w["top"]) <= y_tol:
            lines[-1][1].append(w)
        else:
            lines.append((w["top"], [w]))
    out = []
    for _, ws in lines:
        ws = sorted(ws, key=lambda x: x["x0"])
        out.append(" ".join(x["text"] for x in ws).strip())
    return [x for x in out if x]


def half_texts(page):
    w = page.width
    words = page.extract_words()
    margin = 36.0  # 半页最外缘的竖排品类字区
    left_ws = [x for x in words if margin <= x["x0"] < w / 2]
    right_ws = [x for x in words if w / 2 <= x["x0"] and x["x1"] <= w - margin]
    return "\n".join(group_lines(left_ws)), "\n".join(group_lines(right_ws))


def page_numbers(page):
    """取整页底部附近的两个独立三位印刷页码，返回 (左, 右)。"""
    words = page.extract_words()
    cands = [w for w in words if re.fullmatch(r"\d{3}", w["text"]) and w["top"] > page.height * 0.70]
    if len(cands) < 2:
        return None, None
    cands.sort(key=lambda w: (-w["top"], w["x0"]))
    two = sorted(cands[:2], key=lambda w: w["x0"])
    return int(two[0]["text"]), int(two[1]["text"])


def parse_toc(doc):
    """解析目录页，返回 [(category, code, label, page)]。"""
    entries = []
    current = ""
    for pi in (3, 4, 5, 6):
        page = doc.pages[pi]
        words = page.extract_words()
        half = page.width / 2
        for side in ("L", "R"):
            ws = [w for w in words if (w["x0"] < half if side == "L" else w["x0"] >= half)]
            for raw in group_lines(ws):
                s = re.sub(r"[\s\u3000]+", " ", raw).strip()
                if not s or "目录" in s or "CONTENTS" in s:
                    continue
                if not re.search(r"[A-Za-z0-9]", s):
                    token = re.sub(r"[\s\u3000·・]", "", s)
                    if token in CATEGORIES:
                        current = token
                    continue
                if s.upper().startswith("DESO"):
                    m = re.search(r"[%s]" % CJK, s)
                    if not m:
                        continue
                    code = clean_code(s[: m.start()])
                    rest = s[m.start():].strip()
                    pm = re.search(r"(\d{3})\s*$", rest)
                    page_no = int(pm.group(1)) if pm else None
                    label = re.sub(r"\s*\d{3}\s*$", "", rest).strip()
                    entries.append((current, code, label, page_no))
    return entries


def collect_halves(doc):
    """遍历产品页，返回按印刷页码排序的半页列表。"""
    halves = []
    for pi in range(8, len(doc.pages)):
        page = doc.pages[pi]
        lt, rt = half_texts(page)
        nums = page_numbers(page)
        for side, text, num in (("L", lt, nums[0]), ("R", rt, nums[1])):
            if num is None:
                continue
            m = re.search(
                r"\bDESO[A-Za-z0-9]+(?:8)?[®\u00ae]?[A-Za-z0-9\-\.\(\)]*"
                r"(\s+[A-Za-z0-9][A-Za-z0-9\-\.\(\)]*)*",
                text,
            )
            code = clean_code(m.group(0)) if m else ""
            halves.append(
                {
                    "page": num,
                    "code": code,
                    "start": bool(re.search(r"主\s*要\s*成\s*分|主\s*要\s*组\s*分", text)),
                    "text": text,
                }
            )
    halves.sort(key=lambda h: h["page"])
    return halves


def cn_name(text):
    for line in text.splitlines():
        s = line.strip()
        if "德赛" in s and "说明书" not in s and len(s) <= 32:
            idx = s.index("德赛")
            name = s[idx:].strip()
            if name.startswith("德赛") and len(name) >= 4:
                return re.sub(r"\s+", " ", name)
    return ""


def parse_sections(text):
    """把产品全文拆成栏目，并解析规格键值。"""
    sections = {key: [] for _, key in SECTION_HEADERS}
    sections["_head"] = []
    order = []
    current = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if re.fullmatch(r"\d{3}", line):
            continue
        if line == "德赛尔产品说明书":
            continue
        if line.startswith("本说明书中所提供的信息") or line.startswith("环境或条件测试"):
            continue
        if len(line) == 1 and re.match(r"[%s]" % CJK, line):
            continue  # 竖排品类字
        probe = collapse_doubled(re.sub(r"[\s\u3000]", "", line))
        hit = None
        for title, key in SECTION_HEADERS:
            if probe == title:
                hit = key
                break
        if hit:
            current = hit
            if hit not in order:
                order.append(hit)
            continue
        if current:
            sections[current].append(line)
        else:
            sections["_head"].append(line)
    sections["_head"] = []
    return sections, order


def bullets(lines):
    """把 • 开头的多行条目合并成列表。"""
    items, buf = [], []
    for line in lines:
        s = line.strip()
        if s.startswith(("•", "\u2022", "- ")):
            if buf:
                items.append(" ".join(buf))
                buf = []
            s = re.sub(r"^[•\u2022\-]\s*", "", s)
        if s:
            buf.append(s)
    if buf:
        items.append(" ".join(buf))
    return items


def repair_embedded_header(lines):
    """修正文本层里标题字符被插进正文的情况（如“使性用化能学品”）。"""
    out = []
    for line in lines:
        s = line.replace("使性用化能学品", "使用化学品")
        out.append(s)
    return out


def parse_specs(lines, product_label):
    """解析规格栏目：键值对 + 表格（颜料膏颜色系列）。"""
    pairs = []
    leftover = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = re.match(r"^(.{1,28}?)[：:]\s*(.*)$", line)
        if m and not line.startswith(("•", "\u2022")):
            key = re.sub(r"[\s\u3000]", "", m.group(1))
            key = re.sub(r"[，,](?=%)", "", key)
            key = key.replace("颜应色用", "颜色")
            value = m.group(2).strip()
            if not value and i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                if nxt and not re.match(r"^.{1,28}?[：:]", nxt) and not nxt.startswith(("•", "\u2022")):
                    value = nxt
                    i += 1
            pairs.append({"key": key, "value": value})
        else:
            leftover.append(line)
        i += 1

    table = None
    if "颜料膏" in (product_label or ""):
        rows = []
        for line in leftover:
            tokens = line.split()
            if len(tokens) >= 7 and tokens[0] == "德赛福" and "DESOFU" in tokens:
                di = next(i for i, t in enumerate(tokens) if t.upper().startswith("DESOFU"))
                color_idx = next(
                    (i for i in range(di + 1, len(tokens) - 2)
                     if re.fullmatch(r"[%s]+" % CJK, tokens[i])),
                    None,
                )
                if color_idx is None:
                    continue
                rows.append(
                    {
                        "cn": tokens[0] + "".join(tokens[1:di]),
                        "en": " ".join(tokens[di:color_idx]),
                        "color": tokens[color_idx],
                        "solid": tokens[-2],
                        "ph": tokens[-1],
                    }
                )
        if rows:
            table = rows
    return pairs, leftover, table


def main():
    pdf_path = sys.argv[1]
    out_path = sys.argv[2]
    with pdfplumber.open(pdf_path) as doc:
        toc = parse_toc(doc)
        halves = collect_halves(doc)

    starts = [h for h in halves if h["start"]]
    by_compact = {}
    for h in starts:
        by_compact.setdefault(compact(h["code"]), []).append(h)
    by_page = {h["page"]: h for h in starts}

    products = []
    used = set()
    report = []
    for category, code, label, toc_page in toc:
        key = compact(code)
        candidates = by_compact.get(key, [])
        if len(candidates) == 1:
            half = candidates[0]
        elif toc_page in by_page:
            half = by_page[toc_page]
        elif candidates:
            half = sorted(candidates, key=lambda h: abs(h["page"] - (toc_page or 0)))[0]
        else:
            report.append("未找到正文: %s %s %s" % (category, code, label))
            continue
        if id(half) in used:
            report.append("正文重复使用: %s %s %s" % (category, code, label))
            continue
        used.add(id(half))
        if key and compact(half["code"]) and key != compact(half["code"]):
            report.append("代号不一致: 目录[%s] 正文[%s]" % (code, half["code"]))
        products.append(
            {
                "category": category,
                "code": half["code"] or code,
                "label": label,
                "tocPage": toc_page,
                "page": half["page"],
                "cnName": cn_name(half["text"]),
            }
        )

    for h in starts:
        if id(h) not in used:
            report.append("正文多余起点: %s 页%d" % (h["code"], h["page"]))

    products.sort(key=lambda p: p["page"])
    bounds = [p["page"] for p in products] + [10 ** 6]
    span = {h["page"]: h["text"] for h in halves}
    pages = sorted(span)

    result = []
    for idx, p in enumerate(products):
        lo, hi = bounds[idx], bounds[idx + 1]
        own = [span[n] for n in pages if lo <= n < hi]
        full = "\n".join(own)
        sections, order = parse_sections(full)
        specs, spec_leftover, spec_table = parse_specs(sections["specs"], p["label"])
        for (old_key, old_value), new_key in SPEC_FIXES.get(p["code"], {}).items():
            for sp in specs:
                if sp["key"] == old_key and sp["value"] == old_value:
                    sp["key"] = new_key
        features = bullets(repair_embedded_header(sections["performance"]))
        components = bullets(repair_embedded_header(sections["components"]))
        if not features and len(components) > 1:
            # 源文件文本层偶有漏掉“性能”标题：首个条目为主要成分，其余为性能
            components, features = components[:1], components[1:]
        item = {
            "id": compact(p["code"]),
            "code": p["code"],
            "name": p["cnName"],
            "category": p["category"],
            "type": p["label"],
            "page": p["page"],
            "features": features,
            "components": components,
            "specs": specs,
            "specRaw": spec_leftover,
            "colorSeries": spec_table,
            "application": sections["application"],
            "storage": bullets(repair_embedded_header(sections["storage"])),
            "safety": bullets(repair_embedded_header(sections["safety"])),
            "examples": sections["examples"],
            "notes": sections["notes"],
        }
        result.append(item)

    covered = []
    for n in pages:
        for lo, hi in zip(bounds, bounds[1:]):
            if lo <= n < hi:
                covered.append(n)
                break
    missing = [n for n in pages if n not in covered]
    if missing:
        print("[!] 有带页码但未归属任何产品的半页:", missing)

    payload = {
        "source": "德赛尔产品说明书 2025",
        "count": len(result),
        "categories": sorted(CATEGORIES),
        "products": result,
    }
    with io.open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)

    print("目录条目: %d" % len(toc))
    print("产品起点: %d" % len(starts))
    print("提取产品: %d" % len(result))
    for line in report:
        print("[!]", line)


if __name__ == "__main__":
    main()
