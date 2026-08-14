#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为产品分配稳定的内部序号 no。

已有 no 的产品保持不变；缺失的产品按当前数组顺序补齐，
新产品的编号取当前最大编号 +1，删除产品留下的空号不会重用。

用法: python tools/assign_no.py <products.json>
"""

import io
import json
import sys


def main():
    if len(sys.argv) != 2:
        raise SystemExit("用法: assign_no.py <products.json>")
    path = sys.argv[1]
    data = json.load(io.open(path, encoding="utf-8"))
    prods = data["products"]
    used = {p["no"] for p in prods if isinstance(p.get("no"), int)}
    nxt = (max(used) + 1) if used else 1
    assigned = 0
    for p in prods:
        if isinstance(p.get("no"), int):
            continue
        while nxt in used:
            nxt += 1
        p["no"] = nxt
        used.add(nxt)
        nxt += 1
        assigned += 1
    out = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    io.open(path, "w", encoding="utf-8", newline="\n").write(out)
    print("assigned %d numbers; total %d products" % (assigned, len(prods)))


if __name__ == "__main__":
    main()
