<div align="center">

# 🎬 Manju Laoli · H3 Short-Drama Director

## **v2.1.1** · forest-laoli-h3

> 🎥 An industrial directing system for **MiniMax H3 (Hailuo 3.0)** short dramas
> Script → asset reference sheets → H3 storyboard → three-field / six-section prompt payload → machine QC → delivery package, in one chain
> 🧩 **Platform-agnostic**: no renderer, production host, or queue API is bound. You get plain-text payloads + a handoff package.
> 📐 **9:16 vertical** recommended; **16:9 landscape works too** — one aspect ratio per film, never `auto`

![Version](https://img.shields.io/badge/version-v2.1.1-6a5acd)
![Rulebooks](https://img.shields.io/badge/rulebooks-20-00b4d8)
![QC](https://img.shields.io/badge/QC-H1~H36-ff6b6b)
![Tests](https://img.shields.io/badge/tests-29%2F29%20strict-2ec4b6)
![Model](https://img.shields.io/badge/model-MiniMax%20H3-9d4edd)
![Aspect](https://img.shields.io/badge/aspect-9%3A16%20recommended%20%7C%2016%3A9%20supported-ff9f43)
![Platform](https://img.shields.io/badge/platform-any%20renderer-00b4d8)
![Stars](https://img.shields.io/github/stars/lixiaoxiao9888-create/forest-laoli-h3?style=social)

[简体中文](README.md) ｜ **English**

---

### 🎬 Production pipeline

```
G0 Locks → ① Script → ② Assets → ③ Storyboard → ④ H3 compile → ⑤ Clean + QC → ⑥ Deliver
            (G1)       (G2)        (G3)           (G4)            (G5)            (G6)
```

</div>

---

## 🧭 What this is

An **executable rulebook for AI agents** (OpenClaw skill / Agent Skill package) — not a prompt template collection. Drop `SKILL.md` and `references/` into your agent's skills directory and call it.

**It does one thing: turn a short drama from text into a production-grade MiniMax H3 prompt payload and handoff package.**

It doesn't aim to "sound good" — it aims to **run**. H3 is extremely word-root sensitive, generates every segment with zero memory, and deadlocks on specific action combinations. This package turns those failures into pre-flight, checkable gates.

> **Persona**: 漫剧老李 (Manju Laoli). The package id is `forest-laoli-h3`: `forest` = the name, `laoli` = the IP persona, `h3` = this package only does H3.

## 🚫 What it fixes

| Symptom | Root cause | Rule |
|---|---|---|
| **You write "don't cross the axis" and it draws an axis** | H3 renders word roots; negations are discarded | Five-pass word-root cleaning + H13/H14: after the semicolon, no negation, camera jargon, abstract evaluation, psychological verbs, metaphors, or sound words |
| **You write "oppressive" and get a frown and squint** | Abstract words collapse into generic training-set filters | Emotion must resolve into **four-zone facial muscles** (brow · eyes · mouth · jaw) with visible counts; 30 English emotion recipes |
| **Objects and action, but no air** | Reference images lock "what it looks like," never "what light hits it" | **Three-layer split**: shape from images, space from blocking, atmosphere written to death; six-piece atmosphere header + H35 |
| **Segments don't connect; faces drift** | H3 has zero cross-segment memory | Fixed **9 picture slots** for the whole film (never skip a slot) + spatial-anchor recap per segment + positive hold sentence per shot + 1 s freeze on the final shot; skipping slots shifts everything (H36) |
| **A door opens early / one door splits into two leaves** | Cross-shot result words run ahead; a dynamic door locked as `fully_preserved` | Door/window state lock: closed in every pre-opening shot; any door change at segment end marks the set `partially_preserved` (H31) |
| **One character becomes two (two Lin Zhaos, left and right)** | Anchor jump inside a segment + a third on-screen character with an observer verb | Hard on-screen headcount (max two per shot) + single-anchor lock within a segment (H30/H32) |
| **The man indoors turns around and knocks on his own door** | An off-screen knock verb gets bound to the only visible subject | Off-screen source isolation: exterior actions go only into `overall_soundscape`; body text keeps only the visible indoor consequence (H31) |
| **A character melts into transparency while stepping through a doorway** | Passing through door/window openings triggers alpha dissolve | No through-door motion — stop inside with a hand on the door, or shoot the door closing on its own (H29) |
| **Stuck at 76%, frozen frames** | Full crouch + thin object sliding through a narrow gap deadlocks physical reasoning | High-risk physical deadlock ban: half-crouch / waist bend + settled result state (H33) |
| **Landscape projects flagged / aspect ratio changes mid-film** | Aspect written into body text, set to `auto`, or a full-width colon missed by the checker | Aspect goes only into payload `aspect_ratio`; one ratio per film; the linter accepts `9:16` / `9：16` / `16x9` and normalizes them (H14) |

## ⚡ Core mechanisms

- **Six gated stages**: G0 locks → script → assets → storyboard → H3 compile → clean & QC → deliver, each with a deliverable and a gate;
- **Two-checkpoint routing**: `H3-Base-FL2VA` (zero / one / two images → three fields) · `H3-Base-Ref2VA` (multimodal reference → six sections), field order fixed;
- **Five-pass word-root cleaning**: negation roots, meta-description, camera jargon, emotion conclusions, hard sound roots — peeled layer by layer until only visible facts remain;
- **H1–H36 machine QC**: `h3_lint.py` handles single segments, multi-segment compilations, delivery manifests, BOM tolerance, `9：16` / `16x9` normalization, cross-segment picture-slot consistency (H34), and slot overflow (H36);
- **Delivery is de-shelled**: markdown shells stripped into `.txt` + picture-slot table + manifest JSON — renderer-agnostic, drop it into the official API, a local H3-Base, ComfyUI, or any client;
- **29 strict test cases + doc self-check**: `run_tests.py` guards behavior, `check_docs.py` guards version drift, item counts, and dead cross-references.

## 📂 Repository layout

```
forest-laoli-h3/
├── SKILL.md                                     Master router: scope · six stages · six locks · iron rules · QC index
├── CHANGELOG.md                                 Version history (v2.0 → v2.1.0)
├── references/                                  20 execution-grade rulebooks (self-contained, zero external deps)
│   ├── checklist.md                             62-item pre-delivery checklist
│   ├── gates.md                                 P0 blockers 25 / P1 fixes 16 / P2 optimizations 7
│   ├── diagnose.md                              D01–D50 symptom codes + stuck-job triage tree
│   ├── delivery.md                              De-shelling · picture slots · manifest JSON · three-stage review
│   ├── spatial-anchor-and-hold.md               Anchor card · hold sentences · action budget · blocking / doors / clones
│   ├── atmosphere-and-light.md                  Three-layer split · six-piece atmosphere header · 3D-guoman vocabulary
│   ├── camera-four-axis-h3.md                   Eight tiers × four axes · turn-based cuts · expression + action pairing
│   ├── camera-movement.md                       22 camera moves with physical scales · vertical/horizontal phrasing
│   ├── h3-shot-grammar.md                       Shot size / position / move · positive axis invariants · blocking four elements
│   ├── dialogue-density.md                      Dialogue pacing · 3.3 chars/sec calibration · one line per shot
│   ├── acting-facs.md / acting-recipes.md / acting-listen.md   Four-zone muscles · 30 recipes · five-step listening chain
│   ├── h3-lexicon-cleanup.md                    Word-root blacklist · nine rewrite formulas · five cleaning passes
│   ├── h3-format.md                             Official three-field / six-section spec
│   ├── h3-constraints-qc.md                     H1–H36 hard-constraint matrix
│   ├── script-layer.md / asset-layer.md         "Living dialogue" patterns · three-view + fixed 9 slots
│   ├── pipeline.md / examples.md                End-to-end segmentation · full good/bad examples
├── scripts/
│   ├── h3_lint.py                               H1–H36 QC (single / multi-segment / manifest JSON)
│   └── tests/                                   29 fixtures + run_tests.py + check_docs.py
├── README.md / README.en.md
└── LICENSE
```

## 🚀 Quick start

```bash
git clone https://github.com/lixiaoxiao9888-create/forest-laoli-h3.git
```

Copy the `forest-laoli-h3/` folder into your agent's skills directory (e.g. `~/.openclaw/workspace/skills/`, Claude Code's `skills/`), or install with the skills CLI:

```bash
npx skills add https://github.com/lixiaoxiao9888-create/forest-laoli-h3 --skill forest-laoli-h3
```

**Lint before you deliver (three copy-paste commands):**

```bash
# ① single segment / multi-segment compilation (auto-splits)
python scripts/h3_lint.py script.md --duration 12

# ② landscape projects: declare the aspect explicitly
python scripts/h3_lint.py script.md --duration 12 --aspect 16:9

# ③ delivery manifest array (reads sibling .txt, takes aspect, checks H36 slot overflow)
python scripts/h3_lint.py manifest.json --json
```

> **Reading results**: `FAIL` must reach zero; `WARN` gets fixed or justified in the delivery note.
> **Exit codes**: `0` no FAIL / `1` has FAIL / `2` input problem (missing file, empty prompt, bad JSON) — CI-ready.
> **Keep the manifest and its `.txt` files in the same folder**: when an entry has no `prompt`, the linter reads the `file` it points to.

**After changing rules, run the baseline:**

```bash
python scripts/tests/run_tests.py     # 29 cases: positives green, negatives hit the exact gate
python scripts/tests/check_docs.py    # missing QC codes / item-count drift / dead links
```

## 🔒 G0 — six locks (any missing lock means stop and ask)

| Lock | Values | Default |
|---|---|---|
| **A Mode** | T2VA / I2VA / L2VA / FL2VA / Ref2VA | **Ref2VA** |
| **B Duration** | 4 / 5 / 8 / 10 / 12 / 15 s | Per beat, usually 8–15 s |
| **C Visual base** | BASE_LIVE live-action / BASE_ANIME 3D·semi-real / BASE_2D hand-drawn / BASE_INK ink-wash | **Undecided means do not start** |
| **D Asset form** | M1 text-only / M2 locked reference images | Start at M1, upgrade when images exist |
| **E Seam** | Tail-frame anchor / hard cut on new angle / empty-shot transition | Tail anchor at emotional peaks, empty shot for slow scenes |
| **F Spatial anchor** | One anchor card for the film: furniture list + seat/blocking table + three direction words + initial door/window state | **Unpinned means do not start** |

**Aspect is a recommendation, not a lock**: 9:16 by default; 16:9 is proven to work (better for landscape projects, two-shot parallelism, wide spatial views). Three rules — one ratio per film, no `auto`/`adaptive`, aspect lives only in the payload, never in body text.

## 🎛️ Mode routing (H3 has only two checkpoints)

| Checkpoint | Input | Use case | Output |
|---|---|---|---|
| `H3-Base-FL2VA` | no image | pure text segment (T2VA) | three fields |
| `H3-Base-FL2VA` | one image | first frame (I2VA) / last frame (L2VA) | instruction line + three fields |
| `H3-Base-FL2VA` | two images | first + last frame (FL2VA) | instruction line + three fields |
| `H3-Base-Ref2VA` | multimodal reference | character three-view + set hero angle + props (Ref2VA) | **six sections** |

- **Three fields**: `integrated_multimodal_description` / `overall_soundscape` / `non_diegetic_music`
- **Six sections**: `subject_definitions` / `summary` / `retention_analysis` / `detailed_description` / `overall_soundscape` / `non_diegetic_music`

## ✅ Machine QC H1–H36

| Group | Coverage | Level |
|---|---|---|
| H1–H3 | Field completeness and section order, ascending timestamps, bound cut phrases, 4–15 s duration | FAIL |
| H4–H7 | English body + `<d>` language tags, label definition/usage, legal retention values | FAIL/WARN |
| H8–H12 | Header/symbol cleanup, off-screen fixed phrase + closed-lips evidence, sound layering, named subject in shot 1 | FAIL/WARN |
| H13–H14 | **Word-root cleaning**, **one aspect ratio per film** (`auto` or mixed FAIL, undeclared WARN) | FAIL/WARN |
| H15–H19 | Physical camera scales, banned moves, move × shot-size conflicts, repeated moves | FAIL/WARN |
| H20–H22 | Dialogue density, turn-based cuts, prop physical grounding | WARN |
| H23–H25 | Shot word ceiling (>100 words FAIL), hold sentences, underweight shots | FAIL/WARN |
| H26–H28 | Same-sex voice contrast, final-shot freeze, spatial scale bloat | WARN |
| H29–H33 | Through-door dissolve, on-screen clones, door state lock and off-screen knock pollution, anchor jumps, physical deadlocks | WARN |
| H34 | Cross-segment `Picture N` slot consistency | FAIL |
| H35 | **Missing atmosphere layer** (light position / air medium / foreground depth) | WARN |
| H36 | **Slot overflow** (max `Picture N` > image count, or an empty slot) | FAIL |

## 🩺 When a render breaks or hangs

1. **Stuck (0% / 76%)**: follow the four-axis tree (`diagnose.md §10`) — ① skipped or mismatched picture slots ② renderer queue / rate limit / session not created (**renderer-side, out of scope here**) ③ genuine moderation block ④ physical deadlock (H33). This package only guarantees that ①③④ — problems in the prompt itself — are detectable.
2. **Broken image**: locate the segment and shot → look up the D01–D50 symptom code → fix only the faulty sentence → re-lint with zero new findings.

## 📌 Scope

- **Short drama only**: no ads, product films, brand promos, music videos, or game intros;
- **Platform-agnostic**: output is a plain-text payload + handoff package (de-shelled `.txt` + slot table + manifest JSON). Rendering, queues, concurrency, and account capacity belong to your renderer; no push scripts ship here;
- **Platform specs stay at the script layer**: Red-guo / Douyin rules like "60–90 s per episode, paywall beats" inform the script only; the H3 generation layer accepts only independent 4–15 s units;
- **No pretend memory**: continuity comes from picture slots, anchor recaps, hold sentences, and freeze frames — not from model self-consistency;
- **No images bundled**: you generate reference images externally; this package ships the image prompts and the fixed 9-slot table.

## 🙏 Credits

Rule foundations reference MiniMax H3's official prompting guidance (`base-en` / `ref-en`) and the MiniMax-H3 open-source repository's field spec. Fight-choreography and storyboarding methodology is distilled from the "漫剧老李" Short-Drama Director Suite V7.4.26. The real-machine findings (《门后》segments 01–04, H29–H33) and the v2.0 platform-agnostic rework are original to this package.

## 📄 License

[MIT](LICENSE)
