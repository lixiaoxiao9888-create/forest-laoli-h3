#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_tests.py —— h3_lint.py 的基线测试（18 个用例 · 零放水严格对齐）

每次改完 h3_lint.py 或相关规则后跑一遍：
    python scripts/tests/run_tests.py

退出码：全部与期望一致 = 0；任一不符 = 1。
"""

import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LINT = HERE.parent / "h3_lint.py"

# (文件名, 时长, 期望 FAIL 数, 期望 WARN 数, 用途说明, 画幅声明)
CASES = [
    ("case01_ref2va_ok.md", 12, 0, 5, "六段式合规稿（格式）· H20 密度 + H24 维持句 + H27 定格 + H35 氛围层", "9:16"),
    ("case02_t2va_ok.md", 8, 0, 5, "三字段合规稿（格式）· H20 密度 + H24 维持句 + H27 定格 + H35 氛围层", "9:16"),
    ("case03_style_line_ok.md", 8, 0, 4, "开场风格句放行（depth of field / film grain）· H24/H27 + H35 提示", "9:16"),
    ("case04_style_line_bad.md", 8, 1, 3, "风格句掺否定根 no grain + 元描述根 composition + H35", "9:16"),
    ("case05_general_bad.md", 20, 11, 9, "综合违规稿 · 中文正文/栏名/@/超时长/台词入声 + H35", None),
    ("case06_camera_bad.md", 12, 2, 11, "运镜违规稿 · 升格/Hit-Stop/滑动变焦/特写横移/位移+变焦 + H35", "9:16"),
    ("case07_dialogue_density_ok.md", 12, 0, 4, "台词密度正例 · 4镜4句/填充83%/20句每分钟（长镜与缺维持句按新规提示）", "9:16"),
    ("case08_prop_floating_bad.md", 4, 0, 4, "道具悬浮反例 · 锅只写 at its center 未写支撑 → H22 + H24 + H27 + H35", "9:16"),
    ("case09_prop_grounded_ok.md", 4, 0, 0, "道具接地正例 · stove standing on the table + 氛围层三件齐（H35 零告警）", "9:16"),
    ("case10_spatial_anchor_ok.md", 8, 0, 0, "空间锚点正例 · 座位固定 + 维持句 + 一镜一主角动作 + 氛围层三件齐（H35 零告警）", "9:16"),
    ("case11_spatial_anchor_bad.md", 8, 1, 4, "空间锚点反例 · 109 词镜 + 八连动作 + 无维持句 → H23 FAIL / H20+H24+H27+H35", "9:16"),
    ("case12_same_sex_voice_bad.md", 8, 0, 4, "同性别多说话人反例 · 两女声雷同 H26 + 密度 H20 + 同镜重复标签 H30 + H35", "9:16"),
    ("case13_spatial_bloat_bad.md", 15, 0, 2, "空间尺度膨胀反例 · wall of + photograph wall → H28 + H35", "9:16"),
    ("case14_negation_in_dialogue.md", 15, 0, 4, "《门后》段01原稿反例 · H29穿门融化 + H30旁观复制 + H32抢鞋柜分身 + H35", "9:16"),
    ("case15_repeat_speaker_no_voice.md", 15, 0, 2, "《门后》段02原稿反例 · H31a 画外敲门写进正文致男主自己敲门 + H35", "9:16"),
    ("case16_two_men_opposite_voices.md", 15, 0, 2, "《门后》段04原稿反例 · H31b 开门段死锁闭合门致分裂双扇门 + H35", "9:16"),
    ("case17_freeze_and_premature_door_bad.md", 15, 0, 2, "《门后》段03原稿反例 · H33 全蹲+窄缝穿物冻帧死锁 + H35", "9:16"),
    ("case18_menhou_all4_repaired_ok.md", 15, 0, 0, "《门后》4段全修复标杆合稿 · 多段切分 + H1~H35 全绿零告警（含氛围层六件套）", "9:16"),
]

COUNT_RE = re.compile(r"FAIL\s+(\d+)\s*｜\s*WARN\s+(\d+)")


def run(case_path: Path, duration: int, aspect=None):
    cmd = [sys.executable, str(LINT), str(case_path), "--duration", str(duration)]
    if aspect:
        cmd += ["--aspect", aspect]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = proc.stdout + proc.stderr
    m = COUNT_RE.search(out)
    if not m:
        return -1, -1, out
    return int(m.group(1)), int(m.group(2)), out


def main():
    bad = 0
    print(f"{'用例':38}{'期望':>10}{'实际':>10}  结果")
    print("-" * 78)
    for name, duration, exp_f, exp_w, note, aspect in CASES:
        path = HERE / name
        if not path.exists():
            print(f"{name:38}  [缺文件]")
            bad += 1
            continue
        got_f, got_w, raw = run(path, duration, aspect)
        ok = (got_f == exp_f and got_w == exp_w)
        mark = "✓" if ok else "✗"
        print(f"{name:38}{f'{exp_f}/{exp_w}':>10}{f'{got_f}/{got_w}':>10}  {mark} {note}")
        if not ok:
            bad += 1
            for line in raw.splitlines():
                if line.startswith("[FAIL]") or line.startswith("[WARN]"):
                    print("    ", line)
    print("-" * 78)
    if bad:
        print(f"失败：{bad} 个用例与基线不符。")
        return 1
    print(f"全部 {len(CASES)} 个用例 100% 严丝合缝通过（零放水）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
