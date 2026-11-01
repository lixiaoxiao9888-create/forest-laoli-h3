#!/usr/bin/env node
/**
 * h3-bridge.js —— H3 导演 Skill ⇄ 立映生产机 对接与诊断桥 (v1.4.0)
 *
 * 定位：**不依赖任何插件 exe**（Node 22+ 内置 WebSocket，零依赖），做五件事：
 *   1. check  —— 体检：调试端口 / 队列桥接 / 生产会话 / 账号通道容量（3队列 vs 10队列）
 *   2. limit  —— 查容量：问出当前账号服务端通道上限（同时能跑几段、本地排队几段）
 *   3. doctor —— 诊卡死：一键排查「贴错/漏贴素材」「高危死锁动作」「敏感词审核」「队列僵尸任务」
 *   4. push   —— 投喂入队：入队前强制核对 Picture N 图槽映射与文件完整性，按账号容量（或 --limit N）派发
 *   5. kick / ls —— 点火认领队列 / 查看实时进度与排队分布
 *
 * 前置（一次性）：立映生产机必须带调试端口启动
 *   快捷方式 → 属性 → 目标末尾加：  --remote-debugging-port=9333
 *
 * 用法：
 *   node h3-bridge.js check
 *   node h3-bridge.js limit
 *   node h3-bridge.js doctor [清单.json]
 *   node h3-bridge.js ls
 *   node h3-bridge.js push 清单.json [--only 段01,段02] [--tag _o] [--limit 3] [--dry]
 *   node h3-bridge.js kick
 */

const fs = require('fs')
const http = require('http')
const path = require('path')

const WORKFLOW = 'MiniMaxH3_作剧专用多参版'
const PORT = Number(readFlag('--port') || 9333)

function ensureWebSocket() {
  if (typeof WebSocket !== 'undefined') return
  try { globalThis.WebSocket = require('ws'); return } catch {}
  throw new Error('当前 Node 版本（' + process.version + '）无内置 WebSocket，请升级至 Node 22+：https://nodejs.org')
}

function readFlag(name) {
  const i = process.argv.indexOf(name)
  return i > -1 ? process.argv[i + 1] : null
}
function hasFlag(name) { return process.argv.includes(name) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- 极简 CDP ----------
function listTargets(port) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/json/list' }, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(new Error('调试端口返回非 JSON')) } })
    }).on('error', () => reject(new Error(
      `连不上 127.0.0.1:${port}\n` +
      `  → 立映生产机没带调试端口启动。快捷方式属性 → 目标末尾加  --remote-debugging-port=${port}\n` +
      `  → 改完完全退出立映（任务栏也要退），再启动。`
    )))
  })
}

async function attach(port) {
  ensureWebSocket()
  const targets = await listTargets(port)
  const page = targets.find((t) => t.type === 'page' && /立映|liying|\/\/127\.0\.0\.1:5180/i.test(t.title + t.url))
    || targets.find((t) => t.type === 'page')
  if (!page) throw new Error('调试端口开了，但没找到立映的窗口页面')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const c = { ws, id: 0, pending: new Map() }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接被拒')) })
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && c.pending.has(m.id)) {
      const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id)
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
    }
  }
  c.send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++c.id
    c.pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => { if (c.pending.has(id)) { c.pending.delete(id); rej(new Error('超时 ' + method)) } }, 60000)
  })
  c.evalJs = async (expr) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true })
    if (r.exceptionDetails) throw new Error('页面内报错: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
    return r.result.value
  }
  c.close = () => { try { ws.close() } catch {} }
  await c.send('Runtime.enable')
  return c
}

// ---------- 容量计算（3队列 vs 10队列：区分服务端并发通道与本地等待池） ----------
function resolveCapacity(snap, manualLimit) {
  const cc = (snap && snap.channelCheck) || null
  const serverLimit = cc ? Number(cc.concurrencyLimit) : NaN
  const localOcc = cc && Number.isFinite(Number(cc.localOccupied)) ? Number(cc.localOccupied) : 0
  const serverOcc = cc && Number.isFinite(Number(cc.serverOccupied)) ? Number(cc.serverOccupied) : 0
  const occupied = Math.max(localOcc, serverOcc)

  let totalCap = 1
  let source = '兜底串行（未读到服务端通道数）'
  if (Number.isFinite(serverLimit) && serverLimit >= 1) {
    totalCap = Math.floor(serverLimit)
    source = `服务端下发 (${cc.status || 'confirmed'})`
  } else {
    const items = (snap && snap.items) || []
    const spans = items.filter((i) => i && i.dispatchedAt && i.completedAt)
      .map((i) => ({ d: Date.parse(i.dispatchedAt), c: Date.parse(i.completedAt) }))
      .filter((x) => Number.isFinite(x.d) && Number.isFinite(x.c) && x.c > x.d)
    let maxOverlap = 0
    for (const p of spans) {
      const k = spans.filter((x) => x.d <= p.d && x.c > p.d).length
      if (k > maxOverlap) maxOverlap = k
    }
    if (maxOverlap > 0) {
      totalCap = maxOverlap
      source = `历史实跑重叠反推`
    }
  }

  let effectiveCap = Math.max(1, totalCap - occupied)
  if (Number.isFinite(manualLimit) && manualLimit >= 1) {
    effectiveCap = Math.min(Math.floor(manualLimit), totalCap)
    source += ` + 手工限流(--limit ${Math.floor(manualLimit)})`
  }
  return { totalCap, occupied, effectiveCap, source }
}

// ---------- 图槽与投喂稿静态核验（防省图错位、防人景贴反、防高危卡死词） ----------
function verifySegmentPromptAndSlots(seg) {
  const issues = []
  const warnings = []
  if (!fs.existsSync(seg.file)) {
    issues.push(`找不到投喂件：${seg.file}`)
    return { issues, warnings }
  }
  const text = fs.readFileSync(seg.file, 'utf8')
  if (!text.trim()) {
    issues.push(`投喂件为空：${seg.file}`)
    return { issues, warnings }
  }
  // 1. 检查 Markdown 壳残留
  if (/^\s*#{1,6}\s+(?:subject_definitions|detailed_description)/m.test(text) || /\*\*subject_definitions\*\*/i.test(text) || /```/.test(text)) {
    warnings.push(`投喂件含 Markdown 标题/#/**/围栏符号，建议剥壳为纯文本字段名`)
  }
  // 2. 提取正文中引用的所有 Picture N
  const picRefs = [...text.matchAll(/Picture\s+(\d+)/gi)].map((m) => Number(m[1]))
  const maxPic = picRefs.length ? Math.max(...picRefs) : 0
  if (maxPic > seg.images.length) {
    issues.push(
      `图槽越界（省图错位）：稿内引用了 Picture ${maxPic}，但清单 images 只挂了 ${seg.images.length} 张图！` +
      `（全片图槽必须一次钉死，本段不用的中间图槽也必须原位挂上，否则后面槽位全部前移错位）`
    )
  }
  // 3. 检查每张图是否存在、是否非空，并与 subject_definitions 做人/景/物语义交叉对账
  for (let i = 0; i < seg.images.length; i++) {
    const imgPath = seg.images[i]
    if (!fs.existsSync(imgPath)) {
      issues.push(`图槽 Picture ${i + 1} 文件不存在：${imgPath}`)
    } else {
      const st = fs.statSync(imgPath)
      if (st.size === 0) issues.push(`图槽 Picture ${i + 1} 是 0 字节空文件：${imgPath}`)
    }
  }
  const defMatches = [...text.matchAll(/<Subject\s+(\d+)>\s+is\s+([^.\n]{1,120}?)\s+in\s+(?:<)?Picture\s+(\d+)(?:>)?/gi)]
  for (const m of defMatches) {
    const subjId = m[1]
    const desc = m[2].toLowerCase()
    const picNum = Number(m[3])
    const imgFile = seg.images[picNum - 1] ? path.basename(seg.images[picNum - 1]).toLowerCase() : ''
    if (!imgFile) continue
    const isPersonDesc = /\b(man|woman|boy|girl|landlord|tenant|lady|gentleman|child)\b/.test(desc)
    const isSceneDesc = /\b(room|hall|corridor|kitchen|bedroom|office|street|entrance|stairwell|study|courtyard)\b/.test(desc)
    const isSceneFile = /场景|客厅|门厅|走廊|书房|卧室|scn|scene|room|hall/.test(imgFile)
    const isPersonFile = /人物|男主|女主|老周|林昭|顾深|chr|char/.test(imgFile)
    if (isPersonDesc && isSceneFile) {
      warnings.push(`疑似贴错素材：<Subject ${subjId}> (Picture ${picNum}) 定义为人物(${desc.slice(0, 24)})，但挂的文件名像场景(${imgFile})`)
    } else if (isSceneDesc && isPersonFile) {
      warnings.push(`疑似贴错素材：<Subject ${subjId}> (Picture ${picNum}) 定义为场景(${desc.slice(0, 24)})，但挂的文件名像人物(${imgFile})`)
    }
  }
  // 4. 检查高危卡死动作（段03 76% 卡死/冻帧根因）与穿门融化（段01 根因）
  const bodyNoDlg = text.replace(/<d>[\s\S]*?<\/d>/g, ' ')
  if (/\bcrouches?\s+on\s+(?:his|her|their)\s+heels\b/i.test(bodyNoDlg) || /\b(?:slides?|pushes?|slips?)\s+(?:in\s+|out\s+)?(?:through|under)\s+the\s+(?:narrow\s+)?(?:gap|crack|slit)\b/i.test(bodyNoDlg)) {
    warnings.push(`命中高危卡死/冻帧动作（crouches on his heels / slides through the gap）：极易卡在 76% 或成片冻帧 1.6s+，建议改 bends from the waist + 地面静置结果态`)
  }
  if (/\b(?:steps?|walks?|moves?|goes?|passes?)\s+(?:out\s+)?(?:through|out\s+of|past)\b[^.;]{0,40}?\b(?:door|doorway|frame|opening)\b/i.test(bodyNoDlg)) {
    warnings.push(`命中穿门消除式动作（steps out through the door）：人物越过门框线会半透明融化（H29）`)
  }
  // 5. 检查高危内容审核拦截词（区分真卡审核 vs 假卡死）
  const modHits = bodyNoDlg.match(/\b(corpse|decapitat\w+|dismember\w+|slit\w*\s+throat|naked|nude|blood\s+pool)\b/gi)
  const dlgModHits = text.match(/(砍死|杀光|碎尸|裸体|自杀|跳楼)/g)
  if (modHits || dlgModHits) {
    warnings.push(`命中高危审核敏感词 ${JSON.stringify((modHits || []).concat(dlgModHits || []))}：易触发服务端内容审核秒拒（failed/rejected）`)
  }
  return { issues, warnings }
}

// ---------- 命令 ----------
async function check() {
  const c = await attach(PORT)
  try {
    const snap = await c.evalJs(`(async () => {
      const q = window.queueService
      let s = null
      try { s = q ? await q.snapshot() : null } catch (e) { s = null }
      return {
        title: document.title,
        bridge: !!q,
        methods: q ? Object.keys(q).length : 0,
        snap: s
      }
    })()`)
    if (!snap.bridge) throw new Error('页面里没有 queueService —— 打开的不是立映生产机，或版本不对')
    const s = snap.snap || {}
    const items = s.items || []
    const pending = items.filter((x) => x.status === 'pending').length
    const running = items.filter((x) => x.status === 'dispatched').length
    const completed = items.filter((x) => x.status === 'completed').length
    const failed = items.filter((x) => x.status === 'failed' || x.status === 'error').length
    const capInfo = resolveCapacity(s, null)
    const alive = s.dispatching && !(pending > 0 && running === 0)

    console.log('  立映生产机       ' + snap.title)
    console.log('  队列桥接         queueService 可用（' + snap.methods + ' 个方法）')
    console.log('  生产会话         ' + (alive ? '活着 —— 入队会被直接接手开跑'
      : pending ? `未点火 —— 队列里有 ${pending} 段停在「等待中 (pending)」`
      : '未激活 —— 入队后需跑 kick 点火'))
    console.log(`  账号通道容量     同时可跑 ${capInfo.totalCap} 段（来源：${capInfo.source}）` +
      (capInfo.occupied ? ` ｜ 已占 ${capInfo.occupied} 段 ｜ 当前可用 ${capInfo.effectiveCap} 段` : ''))
    console.log(`  当前队列分布     总计 ${items.length} 条（在跑 ${running} / 容量 ${capInfo.totalCap} ｜ 本地排队 ${pending} ｜ 完成 ${completed} ｜ 失败 ${failed}）`)
    console.log('  目标工作流       ' + WORKFLOW)
    if (!alive) {
      console.log('\n  注意：队列派发需要客户端内部的「生产会话」令牌，脚本直接调 start() 会被拒（no_session）。')
      console.log('        → 入队完跑一句：node h3-bridge.js kick')
      console.log('        它会重启一次立映，客户端启动时用内部凭据把队列捞起来按通道容量并发跑。')
    }
    console.log('\n  可以投喂。')
  } finally { c.close() }
}

async function ls() {
  const c = await attach(PORT)
  try {
    const s = await c.evalJs('window.queueService.snapshot()')
    const capInfo = resolveCapacity(s, null)
    const allItems = s.items || []
    const running = allItems.filter((x) => x.status === 'dispatched').length
    const pending = allItems.filter((x) => x.status === 'pending').length
    const completed = allItems.filter((x) => x.status === 'completed').length
    const failed = allItems.filter((x) => x.status === 'failed' || x.status === 'error').length
    const items = allItems.filter((x) => !/^ep\d|^probe|^TEST/i.test(x.displayName || ''))
    const tail = items.slice(-20)
    console.log(
      `  自动派发 ${s.dispatching ? 'ON' : 'OFF'} ｜ 账号并发容量 ${capInfo.totalCap} 段 ｜ ` +
      `在跑 ${running}/${capInfo.totalCap} ｜ 本地排队 ${pending} ｜ 完成 ${completed} ｜ 失败 ${failed}\n`
    )
    for (const x of tail) {
      console.log('  ' + String(x.progress || 0).padStart(3) + '%  ' + (x.status || '?').padEnd(10) + ' ' + x.displayName)
    }
    if (!tail.length) console.log('  （队列为空）')
  } finally { c.close() }
  setTimeout(() => process.exit(0), 80)
}

function loadManifest(p) {
  const abs = path.resolve(p)
  if (!fs.existsSync(abs)) throw new Error('找不到清单：' + abs)
  const arr = JSON.parse(fs.readFileSync(abs, 'utf8'))
  if (!Array.isArray(arr) || !arr.length) throw new Error('清单是空的')
  const dir = path.dirname(abs)
  return arr.map((e) => ({
    ...e,
    file: path.resolve(dir, e.file),
    images: (e.images || []).map((x) => path.resolve(dir, x)),
  }))
}

async function doctor() {
  console.log('\n  === H3 投喂与卡死四维诊断 (doctor) ===\n')
  const mf = process.argv.slice(3).find((a) => !a.startsWith('--') && /\.json$/i.test(a))
  if (mf) {
    const segs = loadManifest(mf)
    console.log(`  [1/2] 静态核验清单与图槽对账（共 ${segs.length} 段）：`)
    let errCount = 0
    let warnCount = 0
    for (const s of segs) {
      const { issues, warnings } = verifySegmentPromptAndSlots(s)
      errCount += issues.length
      warnCount += warnings.length
      if (!issues.length && !warnings.length) {
        console.log(`    ✓ ${s.name}：图×${s.images.length} 槽位对齐、无高危死锁词`)
      } else {
        for (const msg of issues) console.log(`    ✗ [阻断] ${s.name}: ${msg}`)
        for (const msg of warnings) console.log(`    ! [告警] ${s.name}: ${msg}`)
      }
    }
    console.log(`    小结：阻断项 ${errCount} 条 ｜ 风险告警 ${warnCount} 条\n`)
  } else {
    console.log('  [1/2] 未传入清单.json（可传 `node h3-bridge.js doctor 清单.json` 检查贴错素材/图槽错位）\n')
  }

  console.log('  [2/2] 连接立映生产机排查队列卡死 / 审核 / 并发状态：')
  try {
    const c = await attach(PORT)
    try {
      const s = await c.evalJs('window.queueService.snapshot()')
      const capInfo = resolveCapacity(s, null)
      const items = s.items || []
      const now = Date.now()
      const running = items.filter((x) => x.status === 'dispatched')
      const pending = items.filter((x) => x.status === 'pending')
      const failed = items.filter((x) => x.status === 'failed' || x.status === 'error')

      console.log(`    ✓ 账号通道上限：同时可跑 ${capInfo.totalCap} 段（${capInfo.source}）`)
      console.log(`    ✓ 当前状态：在跑 ${running.length} 段 ｜ 排队等待 ${pending.length} 段 ｜ 失败 ${failed.length} 段`)

      if (pending.length > 0 && running.length === 0) {
        console.log(`    ✗ [卡 0% 诊断] 队列有 ${pending.length} 段停在 pending 但 0 段在跑 → 生产会话未点火（不是卡审核！）`)
        console.log(`      → 处方：直接运行  node h3-bridge.js kick`)
      }
      for (const r of running) {
        const dispTime = r.dispatchedAt ? Date.parse(r.dispatchedAt) : NaN
        const elapsedMin = Number.isFinite(dispTime) ? Math.round((now - dispTime) / 60000) : null
        if (elapsedMin !== null && elapsedMin >= 12) {
          console.log(
            `    ! [疑似僵尸任务] ${r.displayName} 已停在 ${r.progress || 0}% 达 ${elapsedMin} 分钟！\n` +
            `      → 原因判定：真卡审核会直接报错变 failed，绝不会挂在 ${r.progress || 0}% 不动。\n` +
            `        挂住不动只有三种可能：\n` +
            `        ① 服务端已返回 404/1005 清掉任务或早就 100% 出片但本地断连未下载；\n` +
            `        ② 一次性塞入超出了账号通道上限（当前号上限 ${capInfo.totalCap} 段）；\n` +
            `        ③ 稿内含全蹲(crouches on his heels)/窄缝穿物(slides through the gap)触发物理死锁。\n` +
            `      → 处方：先跑 node h3-bridge.js kick 重启客户端重拉状态；若仍卡死，检查稿件 H31-H33 并用 480P 探针重投。`
          )
        }
      }
      for (const f of failed.slice(-5)) {
        console.log(
          `    ✗ [任务失败/审核拦截] ${f.displayName} 状态=${f.status} 错误=${f.error || f.message || '服务端拒单/审核拦截'}\n` +
          `      → 处方：若是内容审核拦截，排查台词与正文敏感词；若是参数报错，核对 Picture N 图槽是否漏图错位。`
        )
      }
    } finally { c.close() }
  } catch (e) {
    console.log('    （未连上立映调试端口：' + e.message.split('\n')[0] + '）')
  }
  console.log('')
  setTimeout(() => process.exit(0), 80)
}

async function push() {
  const mf = process.argv.slice(2).find((a) => !a.startsWith('--') && /\.json$/i.test(a))
  if (!mf) throw new Error('用法: node h3-bridge.js push 清单.json [--only 名1,名2] [--tag _o] [--limit 3] [--dry]')
  let segs = loadManifest(mf)
  const only = readFlag('--only')
  if (only) {
    const want = only.split(',').map((s) => s.trim())
    segs = segs.filter((s) => want.some((w) => s.name.includes(w)))
    if (!segs.length) throw new Error('清单里没有匹配 --only 的段')
  }
  const tag = readFlag('--tag') || ''
  const dry = hasFlag('--dry')
  const manualLimit = readFlag('--limit') ? Number(readFlag('--limit')) : null

  // 入队前强制体检：文件存在 + 图 <=9 + Picture N 图槽映射不越界 + 人景不贴反
  for (const s of segs) {
    if (!fs.existsSync(s.file)) throw new Error(`段 ${s.name} 缺投喂件 ${s.file}`)
    const miss = s.images.filter((p) => !fs.existsSync(p))
    if (miss.length) throw new Error(`段 ${s.name} 缺 ${miss.length} 张图：\n    ` + miss.join('\n    '))
    if (s.images.length > 9) throw new Error(`段 ${s.name} 图超过 9 张（H3 硬上限 9 张）`)
    const { issues, warnings } = verifySegmentPromptAndSlots(s)
    if (issues.length) {
      throw new Error(`段 ${s.name} 投喂前体检未通过：\n    ✗ ` + issues.join('\n    ✗ '))
    }
    for (const w of warnings) {
      console.log(`  ! [体检提醒] ${s.name}: ${w}`)
    }
  }
  console.log(`\n  待投喂 ${segs.length} 段 → ${WORKFLOW}${dry ? '（试跑，不入队）' : ''}`)
  console.log('  ' + '-'.repeat(54))

  if (dry) {
    for (const s of segs) console.log(`  ✓ ${s.name}  ${s.duration}s ${s.resolution} 图×${s.images.length}（图槽与文件核验通过）`)
    return
  }

  const c = await attach(PORT)
  try {
    const s0 = await c.evalJs('window.queueService.snapshot()')
    const capInfo = resolveCapacity(s0, manualLimit)
    const cap = capInfo.effectiveCap

    for (const s of segs) {
      const displayName = s.name + tag
      const valueFields = {
        prompt: fs.readFileSync(s.file, 'utf8'),
        duration: String(s.duration || 15),
        resolution: s.resolution || '720P',
        aspect_ratio: s.aspect || '9:16 (Portrait Widescreen)',
      }
      const filePaths = {}
      s.images.forEach((p, i) => { filePaths['image_' + (i + 1)] = p })
      const item = { workflowName: WORKFLOW, displayName, taskName: displayName, valueFields, filePaths, resourceFields: {} }
      await c.evalJs('window.queueService.enqueue(' + JSON.stringify(item) + ')')
      console.log(`  已入队  ${displayName}  ${valueFields.duration}s ${valueFields.resolution} 图×${s.images.length}`)
      await sleep(500)
    }
    const started = await c.evalJs(`(async () => {
      try { const r = await window.queueService.start({ concurrencyLimit: ${cap} }); return r || { ok: true } }
      catch (e) { return { ok: false, error: String(e && e.message || e) } }
    })()`)
    const s = await c.evalJs('window.queueService.snapshot()')
    const allItems = s.items || []
    const runCount = allItems.filter((x) => x.status === 'dispatched').length
    const pendCount = allItems.filter((x) => x.status === 'pending').length
    console.log(
      `\n  队列总计 ${allItems.length} 条 ｜ 账号并发上限 ${capInfo.totalCap} 段（本次派发并发度=${cap}）\n` +
      `  当前分布：同时在跑 ${runCount} 段 ｜ 本地排队等待 ${pendCount} 段（跑完一段自动补进下一段）`
    )
    if (started && started.ok && (!started.ret || started.ret !== 'refused')) {
      console.log('  已开启自动派发 —— 队列会按通道容量自动跑完')
    } else {
      console.log('  任务已安全进入本地等待队列，但尚未点火：' + ((started && started.error) || (started && started.ret) || '需客户端生产会话'))
      console.log('  → 跑一句： node h3-bridge.js kick    （重启立映，客户端自动按容量认领队列）')
    }
    console.log('  看进度：node h3-bridge.js ls ｜ 诊卡死：node h3-bridge.js doctor\n')
  } finally { c.close() }
  setTimeout(() => process.exit(0), 80)
}

function ps(script) {
  const r = require('child_process').spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 60000 }
  )
  if (r.error) throw new Error('调 PowerShell 失败：' + r.error.message)
  return (r.stdout || '').trim()
}

async function waitPort(port, seconds) {
  for (let i = 0; i < seconds; i++) {
    try { await listTargets(port); return true } catch { await sleep(1000) }
  }
  return false
}

async function kick(opts = {}) {
  const say = opts.quiet ? () => {} : (...a) => console.log(...a)
  if (process.platform !== 'win32') throw new Error('kick 只支持 Windows（立映是 Windows 客户端）')
  const P = `[string]([char]0x751F+[char]0x4EA7+[char]0x673A)`
  const L = `[string]([char]0x7ACB+[char]0x6620)`
  const out = ps(`
    $P = ${P}; $L = ${L}
    $proc = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "*$P*" })
    if ($proc.Count -gt 0) {
      $main = $proc | Where-Object { $_.Path -notmatch '\\\\Temp\\\\' } | Select-Object -First 1
      if (-not $main) { $main = $proc[0] }
      $exe = $main.Path
      "FOUND=$($proc.Count)"
      $proc | Stop-Process -Force
      Start-Sleep -Milliseconds 2500
    } else {
      "FOUND=0"
      $d = [Environment]::GetFolderPath('Desktop')
      $f = Get-ChildItem -LiteralPath $d -Filter '*.exe' -ErrorAction SilentlyContinue |
           Where-Object { $_.Name -match $L } | Select-Object -First 1
      if (-not $f) { "NO_EXE"; exit }
      $exe = $f.FullName
    }
    $c = '"' + $exe + '" --remote-debugging-port=${PORT}'
    $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $c }
    "STARTED|$($r.ReturnValue)"
  `)
  if (/NO_EXE/.test(out)) {
    throw new Error('桌面上没找到立映的可执行文件 —— 手动双击图标打开一次，再跑这条命令')
  }
  if (!/STARTED\|0/.test(out)) {
    throw new Error('拉起失败：' + out.replace(/\s+/g, ' ').slice(0, 200))
  }
  const found = /FOUND=(\d+)/.exec(out)
  say(`\n  ${found && found[1] !== '0' ? '重启立映生产机（' + found[1] + ' 个进程）' : '立映原来没开，已拉起'}`)
  say('  客户端做完授权校验后，会自己认领队列里所有「等待中」的任务')
  say('  已带调试端口 ' + PORT + ' 启动')

  process.stdout.write('  等调试端口')
  const up = await waitPort(PORT, 60)
  say(up ? '  ok' : '  超时')
  if (!up) throw new Error('60 秒内没等到调试端口 —— 检查启动参数是否带上了 --remote-debugging-port')

  process.stdout.write('  等客户端认领队列')
  let moved = null
  for (let i = 0; i < 24; i++) {
    await sleep(3000)
    try {
      const c = await attach(PORT)
      const s = await c.evalJs('window.queueService.snapshot()')
      c.close()
      const capInfo = resolveCapacity(s, null)
      const it = s.items || []
      const run = it.filter((x) => x.status === 'dispatched').length
      const pend = it.filter((x) => x.status === 'pending').length
      say(`\r  等客户端认领队列   在跑 ${run}/${capInfo.totalCap} ｜ 本地排队 ${pend}    `)
      if (run > 0) { moved = { run, pend, cap: capInfo.totalCap }; break }
    } catch {}
  }
  say('')
  if (moved) {
    say(`  队列已被认领：${moved.run} 段同时在跑（账号通道上限 ${moved.cap} 段），${moved.pend} 段在本地队列排队等待补位`)
    say('  看进度：node h3-bridge.js ls\n')
  } else {
    say('  队列还没动。多半是授权校验没过（额度 / 机器码），')
    say('  在立映界面上点一次「重新连接授权服务」再试。\n')
  }
  if (require.main === module) setTimeout(() => process.exit(0), 80)
  return { moved, found: found ? Number(found[1]) : 0 }
}

async function limitCmd() {
  const c = await attach(PORT)
  try {
    const snap = await c.evalJs('window.queueService.snapshot()')
    const capInfo = resolveCapacity(snap, null)
    const items = (snap && snap.items) || []
    const run = items.filter((x) => x.status === 'dispatched').length
    const pend = items.filter((x) => x.status === 'pending').length
    console.log('')
    console.log(`  账号服务端并发通道上限：同时可跑 ${capInfo.totalCap} 段（${capInfo.source}）`)
    console.log(`  当前占用与排队情况    ：正在跑 ${run} 段 ｜ 本地排队 ${pend} 段 ｜ 剩余可立即派发 ${capInfo.effectiveCap} 段`)
    console.log('  ------------------------------------------------------------------')
    console.log('  【3 队列 vs 10 队列 机制说明】')
    console.log('  • 同时跑几个（Running / Dispatched）：由账号通道数决定（普通号常见 3 通道，高配号 10 通道）。')
    console.log('  • 排队排几个（Local Pending Pool）  ：立映本地队列可一次性塞入整集（6~20 段均可），')
    console.log('    超出通道上限的段数会停在 `pending（等待中）`；前序跑完 1 段，客户端自动补进 1 段。')
    console.log('  • 如需手动压低并发（如多开或 3 队列号防卡单）：push 时加 `--limit 3` 即可。\n')
  } finally { c.close() }
  setTimeout(() => process.exit(0), 80)
}

// ---------- 入口 ----------
function main() {
  const cmd = process.argv[2]
  if (cmd === 'check') { check().then(() => setTimeout(() => process.exit(0), 80)); return }
  if (cmd === 'ls') return ls()
  if (cmd === 'push') return push()
  if (cmd === 'kick') return kick()
  if (cmd === 'limit') return limitCmd()
  if (cmd === 'doctor') return doctor()
  console.log(`h3-bridge (v1.4.0) —— H3 导演 Skill 对接立映生产机（零依赖，含图槽防贴错与队列诊断）

  node h3-bridge.js check                           体检：端口 / 桥接 / 派发状态 / 账号容量
  node h3-bridge.js limit                           查容量：3队列 vs 10队列（同时跑几个、排队排几个）
  node h3-bridge.js doctor [清单.json]              诊卡死：排查贴错素材 / 省图错位 / 敏感词 / 僵尸任务
  node h3-bridge.js ls                              看进度：显示 [在跑/容量 | 本地排队 | 完成 | 失败]
  node h3-bridge.js push 清单.json [--limit 3]      整包入队（支持 --only 段01,段02 / --tag _o / --limit N / --dry）
  node h3-bridge.js kick                            重启立映，让客户端自己认领队列按容量开跑`)
}

// 被 require（免费对接包 h3-link 当库用）时不自动跑 CLI
if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error('\n  ✗ ' + (e && e.message ? e.message : e) + '\n')
    process.exit(1)
  }
}

module.exports = {
  PORT, WORKFLOW,
  ensureWebSocket, readFlag, hasFlag, sleep,
  listTargets, attach, resolveCapacity, verifySegmentPromptAndSlots,
  loadManifest, check, ls, doctor, push, kick, limitCmd, ps, waitPort,
}
