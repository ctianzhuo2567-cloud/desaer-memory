"""从可维护的工序数据生成自包含 SVG，供资料阅读器缩放查看。"""

import math
import unicodedata
from html import escape


def wrap(text, width, size=23):
    lines, line, used = [], "", 0
    for char in text:
        advance = size if unicodedata.east_asian_width(char) in "WF" else size * 0.57
        if char == "\n" or (used + advance > width and line):
            # 避免逗号、句号等出现在新行开头。
            carry = line[-1:] if char in "，。：；、）%" else ""
            lines.append(line[:-1] if carry else line)
            line = carry
            used = size if carry else 0
        if char != "\n":
            line += char
            used += advance
    if line:
        lines.append(line)
    return lines


def step_lines(step):
    lines = [("时间 " + step["duration"], True)] if step.get("duration") else []
    lines.extend((f"{label} {value}", True) for label, value in step.get("parameters", []))
    lines.extend((text, False) for text in step.get("instructions", []))
    for material in step.get("materials", []):
        parts = [material.get(key, "") for key in ("name", "dosage", "basis", "note")]
        lines.append(("用料 · " + " · ".join(part for part in parts if part), False))
    return lines


def populate_flow_metadata(page):
    """为流程图生成统一的工序文字记录。"""
    flow = page["flow"]
    steps = flow["steps"]
    page["count"], page["countUnit"] = len(steps), "道工序"
    page["branches"] = [{"title": f'{index + 1:02} {step["title"]}',
                         "text": "\n".join(text for text, _ in step_lines(step))}
                        for index, step in enumerate(steps)]
    page["note"] = "\n".join(flow.get("notes", []) + [flow.get("materialsNote", "材料与用量 · 后续补充")])


def display_lines(step, flow):
    """共用待确认说明放在页脚，卡片内集中展示实际用量。"""
    base = dict(step, materials=[])
    lines = step_lines(base)
    for material in step.get("materials", []):
        parts = [material.get("name", ""), material.get("dosage", "")]
        basis = material.get("basis", "")
        if basis and basis not in flow.get("materialsNote", ""):
            parts.append(basis)
        if material.get("note"):
            parts.append(material["note"])
        lines.append((" ".join(part for part in parts if part), False))
    return lines


def render_process_flow(page):
    flow = page["flow"]
    steps, columns = flow["steps"], flow["columns"]
    if not steps or columns not in (3, 4, 5):
        raise ValueError("流程图需要工序，列数应为 3、4 或 5")
    width, margin, gap = 1600, 48, 30
    cell_width = (width - margin * 2 - gap * (columns - 1)) / columns
    wrapped = [[(line, accent) for text, accent in display_lines(step, flow)
                for line in wrap(text, cell_width - 40)] for step in steps]
    rows = math.ceil(len(steps) / columns)
    row_heights = [max(188, 91 + max(len(lines) for lines in wrapped[row * columns:(row + 1) * columns]) * 33)
                   for row in range(rows)]
    notes = [line for note in flow.get("notes", []) for line in wrap(note, width - 144, 23)]
    notes.append(flow.get("materialsNote", "材料与用量 · 后续补充"))
    note_y = 134 + sum(row_heights) + 48 * (rows - 1) + 24
    height = note_y + len(notes) * 34 + 96
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
           '<style>text{font-family:"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;fill:#1c416d} .param{fill:#008d8d;font-weight:700}</style>',
           f'<rect width="{width}" height="{height}" fill="#fff"/>',
           '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#369ed0" stroke-width="1.5"/></marker></defs>',
           '<rect x="48" y="35" width="8" height="49" rx="4" fill="#008fb9"/>',
           f'<text x="76" y="73" font-size="40" font-weight="700">{escape(page["title"])}</text>',
           f'<text x="76" y="110" font-size="21" fill="#62788d">制革工序知识 · {len(steps)} 道工序 · 按编号顺序阅读</text>']
    positions = []
    y = 134
    for row, row_height in enumerate(row_heights):
        for column in range(columns):
            index = row * columns + column
            if index >= len(steps):
                break
            positions.append((margin + column * (cell_width + gap), y, row_height))
        y += row_height + 48
    for index, (step, lines, (x, y, h)) in enumerate(zip(steps, wrapped, positions)):
        svg.append(f'<g data-step-id="{escape(step["id"], quote=True)}">')
        svg.append(f'<rect x="{x}" y="{y}" width="{cell_width}" height="{h}" rx="18" fill="#eef6fa" stroke="#68b7ee" stroke-width="2"/>')
        svg.append(f'<text x="{x + 18}" y="{y + 39}" font-size="21" font-weight="700" class="param">{index + 1:02}</text>')
        svg.append(f'<text x="{x + 57}" y="{y + 41}" font-size="27" font-weight="700">{escape(step["title"])}</text>')
        for line_index, (line, accent) in enumerate(lines):
            svg.append(f'<text x="{x + 20}" y="{y + 88 + line_index * 33}" font-size="23" class="{"param" if accent else "instruction"}">{escape(line)}</text>')
        svg.append('</g>')
        if index + 1 < len(steps):
            next_x, next_y, _ = positions[index + 1]
            start_x, start_y = x + cell_width, y + h / 2
            if (index + 1) % columns:
                path = f'M {start_x + 3} {start_y} H {next_x - 5}'
            else:
                middle_y = y + h + 24
                path = f'M {start_x + 3} {start_y} H {width - 18} V {middle_y} H 18 V {next_y + row_heights[(index + 1) // columns] / 2} H {next_x - 5}'
            svg.append(f'<path d="{path}" fill="none" stroke="#369ed0" stroke-width="2" marker-end="url(#arrow)"/>')
    svg.append(f'<rect x="48" y="{note_y}" width="1504" height="{len(notes) * 34 + 25}" rx="16" fill="#e8f6f3" stroke="#9bd4ca"/>')
    for index, note in enumerate(notes):
        svg.append(f'<text x="72" y="{note_y + 34 + index * 34}" font-size="23">{escape(note)}</text>')
    source = page.get("sourceTitle", "用户提供的 DECISION 制革基础知识培训图")
    svg.append(f'<text x="48" y="{height - 20}" font-size="18" fill="#62788d">资料来源 · {escape(source)} · 原第 {page["sourcePage"]} 页</text></svg>')
    page["width"], page["height"] = width, height
    populate_flow_metadata(page)
    return "".join(svg).encode("utf-8")
