import './style.css'
import {
  deleteBrief,
  exportBackup,
  getBrief,
  getSetting,
  importBackup,
  listBriefs,
  saveBrief,
  setSetting,
} from './db'
import { LOOPS, buildHiveExportBundle, downloadJson, downloadText, slugify } from './hive'
import {
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  describeApiError,
  generatePlan,
  isAbortError,
  type ModelId,
} from './llm'
import { renderMarkdown } from './markdown'
import {
  PROMPT_SPEC,
  assessBrief,
  briefTitle,
  emptyBrief,
  normalizeInputs,
  parseFollowerCount,
  renderPrompt,
  sha256Text,
} from './template'
import type { BriefInputs, GeneratedPlan, HiveJobStatus, StartupBrief, VariableSpec } from './types'

type Tab = 'prompt' | 'plan' | 'hive'
type Group = 'v' | 'x'

const CUSTOM = '__custom__'
const SENT_OPEN = '\u0001'
const SENT_CLOSE = '\u0002'
const SITE_URL = PROMPT_SPEC.links.site
const APP_URL = PROMPT_SPEC.links.app

const app = document.querySelector<HTMLDivElement>('#app')!

let brief: StartupBrief = emptyBrief()
let savedBriefs: StartupBrief[] = []
let tab: Tab = 'prompt'
let showSaved = false
let generating = false
let abortCtrl: AbortController | null = null
let liveText = ''
let liveTimer = 0
let toastTimer = 0
let autoSaveTimer = 0
let lastError = ''
let apiKey = getSetting('apiKey') ?? ''
let rememberKey = apiKey.length > 0
let model: ModelId = resolveModel(getSetting('model'))

// ---------- helpers ----------

function resolveModel(value: string | null): ModelId {
  const found = MODEL_OPTIONS.find((m) => m.id === value)
  return found ? found.id : DEFAULT_MODEL
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replaceAll("'", '&#39;')
}

function toast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600)
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

function pickJsonFile(onData: (data: unknown) => Promise<void>) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      await onData(JSON.parse(await file.text()))
    } catch {
      toast('That file is not a valid backup')
    }
  }
  input.click()
}

function isRtlLanguage(lang: string): boolean {
  return /^(hebrew|עברית|arabic|العربية|he\b|ar\b|persian|farsi|urdu)/i.test(lang.trim())
}

function currentTitle(): string {
  return brief.name.trim() || briefTitle(brief.inputs)
}

function hasContent(): boolean {
  return (
    Object.values(brief.inputs).some((v) => v.trim()) ||
    (brief.extras['founder_notes'] ?? '').trim() !== '' ||
    brief.name.trim() !== ''
  )
}

function followerHint(value: string): string {
  const n = parseFollowerCount(value)
  return n === null ? '' : `→ ${n.toLocaleString('en-US')}`
}

function statusBadge(status: HiveJobStatus): string {
  switch (status) {
    case 'succeeded':
      return 'badge-ok'
    case 'queued':
    case 'running':
      return 'badge-info'
    case 'blocked_trust':
      return 'badge-warn'
    default:
      return 'badge-danger'
  }
}

// ---------- persistence ----------

async function persist() {
  brief.hiveReady = assessBrief(brief.inputs, brief.extras).ready
  brief.updatedAt = new Date().toISOString()
  await saveBrief(brief)
  savedBriefs = await listBriefs()
}

function scheduleAutoSave() {
  window.clearTimeout(autoSaveTimer)
  autoSaveTimer = window.setTimeout(() => void flushAutoSave(true), 800)
}

async function flushAutoSave(showIndicator = false) {
  window.clearTimeout(autoSaveTimer)
  if (!hasContent()) return
  await persist()
  if (showIndicator) {
    const ind = document.getElementById('autosave')
    if (ind) {
      ind.classList.remove('hidden')
      window.setTimeout(() => ind.classList.add('hidden'), 1800)
    }
  }
  const btn = document.getElementById('btnSaved')
  if (btn) btn.textContent = `Saved briefs (${savedBriefs.length})`
}

// ---------- form ----------

function readVar(v: VariableSpec, group: Group): string {
  const el = document.getElementById(`${group}_${v.name}`) as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null
  if (!el) return ''
  if (el instanceof HTMLSelectElement && el.value === CUSTOM) {
    const custom = document.getElementById(`${group}c_${v.name}`) as HTMLInputElement | null
    return custom?.value ?? ''
  }
  return el.value
}

function readForm() {
  for (const v of PROMPT_SPEC.variables) brief.inputs[v.name] = readVar(v, 'v')
  for (const f of PROMPT_SPEC.extras.fields) brief.extras[f.name] = readVar(f, 'x')
  const name = document.getElementById('f_name') as HTMLInputElement | null
  if (name) brief.name = name.value
}

function fieldHtml(v: VariableSpec, value: string, group: Group): string {
  const id = `${group}_${v.name}`
  const hint =
    v.format === 'thousands'
      ? ` <span class="hint-inline" id="hint_${v.name}">${followerHint(value)}</span>`
      : ''
  const label = `<label for="${id}">${escapeHtml(v.label)}${v.required ? ' <span class="req">*</span>' : ''}${hint}</label>`
  const help = v.help ? `<span class="help">${escapeHtml(v.help)}</span>` : ''
  const common = `id="${id}" data-var="${v.name}" data-group="${group}"`
  let control = ''

  switch (v.type) {
    case 'select': {
      const opts = v.options ?? []
      const isCustom = value !== '' && !opts.includes(value)
      control =
        `<select ${common}>` +
        `<option value="">Select…</option>` +
        opts
          .map(
            (o) =>
              `<option value="${escapeAttr(o)}"${o === value ? ' selected' : ''}>${escapeHtml(o)}</option>`,
          )
          .join('') +
        (v.allowCustom
          ? `<option value="${CUSTOM}"${isCustom ? ' selected' : ''}>Custom…</option>`
          : '') +
        `</select>` +
        (v.allowCustom
          ? `<input class="custom-input${isCustom ? '' : ' hidden'}" id="${group}c_${v.name}" data-custom-for="${id}" placeholder="Type your own" value="${isCustom ? escapeAttr(value) : ''}" />`
          : '')
      break
    }
    case 'textarea':
      control = `<textarea ${common} placeholder="${escapeAttr(v.placeholder ?? '')}">${escapeHtml(value)}</textarea>`
      break
    case 'number':
      control = `<input ${common} inputmode="numeric" placeholder="${escapeAttr(v.placeholder ?? '')}" value="${escapeAttr(value)}" />`
      break
    default: {
      const listId = v.examples?.length ? `list_${v.name}` : ''
      control =
        `<input ${common}${listId ? ` list="${listId}"` : ''} placeholder="${escapeAttr(v.placeholder ?? '')}" value="${escapeAttr(value)}" />` +
        (listId
          ? `<datalist id="${listId}">${v.examples!.map((e) => `<option value="${escapeAttr(e)}"></option>`).join('')}</datalist>`
          : '')
    }
  }

  return `<div class="field">${label}${control}${help}</div>`
}

function readinessHtml(): string {
  const r = assessBrief(brief.inputs, brief.extras)
  return `
    <div class="completeness" id="readiness">
      <strong>Brief readiness → hive: ${r.ready ? 'ready' : 'incomplete'} · ${r.score}%</strong>
      <div class="score-bar"><span style="width:${r.score}%"></span></div>
      ${
        r.missingRequired.length
          ? `<div>Still needed: <ul>${r.missingRequired.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`
          : '<div>All six brief fields are filled — the prompt is ready to run.</div>'
      }
      ${r.warnings.map((w) => `<div class="warn">${escapeHtml(w)}</div>`).join('')}
    </div>`
}

// ---------- prompt tab ----------

/** Rendered prompt as HTML: filled values highlighted, empty placeholders marked */
function promptViewHtml(): string {
  const values = normalizeInputs(brief.inputs)
  const wrapped: BriefInputs = {}
  for (const [name, val] of Object.entries(values)) {
    wrapped[name] = val ? `${SENT_OPEN}${val}${SENT_CLOSE}` : ''
  }
  const { prompt } = renderPrompt(wrapped, brief.extras)
  return escapeHtml(prompt)
    .replaceAll(SENT_OPEN, '<span class="filled">')
    .replaceAll(SENT_CLOSE, '</span>')
    .replace(/\{\{\s*[a-z0-9_]+\s*\}\}/g, (m) => `<mark>${m}</mark>`)
}

function promptMetaHtml(prompt: string): string {
  const tokens = Math.ceil(prompt.length / 4)
  return (
    `<span>${prompt.length.toLocaleString('en-US')} chars · ~${tokens.toLocaleString('en-US')} tokens</span>` +
    `<span>template <code>${escapeHtml(PROMPT_SPEC.id)}@${escapeHtml(PROMPT_SPEC.version)}</code></span>`
  )
}

function promptTabHtml(): string {
  const r = renderPrompt(brief.inputs, brief.extras)
  const ready = assessBrief(brief.inputs, brief.extras).ready
  return `
    <div class="toolbar">
      <button class="btn btn-primary" id="btnCopyPrompt" type="button">Copy prompt</button>
      <button class="btn btn-secondary" id="btnDownloadPrompt" type="button">Download .md</button>
      <button class="btn btn-secondary" id="btnOpenClaude" type="button"${ready ? '' : ' disabled'}>Open in Claude</button>
      <button class="btn btn-secondary" id="btnOpenChatGPT" type="button"${ready ? '' : ' disabled'}>Open in ChatGPT</button>
    </div>
    <div class="meta" id="promptMeta">${promptMetaHtml(r.prompt)}</div>
    <pre class="prompt-view" id="promptView">${promptViewHtml()}</pre>`
}

// ---------- plan tab ----------

function planMetaHtml(plan: GeneratedPlan): string {
  const parts = [
    `<span>${escapeHtml(plan.model)}</span>`,
    `<span>${escapeHtml(new Date(plan.createdAt).toLocaleString())}</span>`,
  ]
  if (plan.usage) {
    parts.push(`<span>${plan.usage.outputTokens.toLocaleString('en-US')} output tokens</span>`)
  }
  parts.push(`<span>prompt sha256 <code>${escapeHtml(plan.promptSha256.slice(0, 12))}…</code></span>`)
  return parts.join('')
}

function planTabHtml(): string {
  const ready = assessBrief(brief.inputs, brief.extras).ready
  const plan = brief.plan
  const dir = isRtlLanguage(brief.extras['output_language'] ?? '') ? ' dir="rtl"' : ''

  const setup = `
    <section class="section">
      <h2>Generate with Claude</h2>
      <p class="hint">Bring your own Anthropic API key. The browser sends it only to api.anthropic.com; it is never stored in briefs, hive exports or backups. <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">Get a key</a>.</p>
      <div class="field">
        <label for="f_apiKey">Anthropic API key</label>
        <div class="key-row">
          <input id="f_apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" value="${escapeAttr(apiKey)}" />
          <button class="btn btn-secondary btn-sm" id="btnToggleKey" type="button">Show</button>
        </div>
      </div>
      <label class="checkbox-row"><input type="checkbox" id="f_rememberKey"${rememberKey ? ' checked' : ''}/> Remember the key on this device</label>
      <div class="field">
        <label for="f_model">Model</label>
        <select id="f_model">${MODEL_OPTIONS.map((m) => `<option value="${m.id}"${m.id === model ? ' selected' : ''}>${escapeHtml(m.label)}</option>`).join('')}</select>
      </div>
      <div class="row">
        <button class="btn btn-primary" id="btnGenerate" type="button"${ready && !generating ? '' : ' disabled'}>${plan ? 'Regenerate plan' : 'Generate plan'}</button>
        ${generating ? '<button class="btn btn-danger" id="btnStop" type="button">Stop</button>' : ''}
      </div>
      ${ready ? '' : '<div class="notice notice-warn">Fill all six brief fields to enable generation.</div>'}
      ${lastError ? `<div class="notice notice-danger">${escapeHtml(lastError)}</div>` : ''}
    </section>`

  let output = ''
  if (generating) {
    output = `
      <div class="progress"><span class="spinner"></span> Generating — the plan streams in below. A full eight-section plan can take a few minutes.</div>
      <div class="plan-view" id="planView"${dir}>${renderMarkdown(liveText)}</div>`
  } else if (plan) {
    output = `
      <div class="toolbar">
        <button class="btn btn-secondary" id="btnCopyPlan" type="button">Copy plan</button>
        <button class="btn btn-secondary" id="btnDownloadPlan" type="button">Download .md</button>
        <button class="btn btn-danger" id="btnClearPlan" type="button">Clear</button>
      </div>
      <div class="meta">${planMetaHtml(plan)}</div>
      ${plan.stopReason === 'aborted' ? '<div class="notice notice-warn">Stopped early — this is a partial plan.</div>' : ''}
      ${plan.stopReason === 'max_tokens' ? '<div class="notice notice-warn">The model hit its output limit — the end of the plan may be cut off.</div>' : ''}
      ${plan.stopReason === 'refusal' ? '<div class="notice notice-danger">The model declined this brief; nothing usable was generated.</div>' : ''}
      <div class="plan-view" id="planView"${dir}>${renderMarkdown(plan.markdown)}</div>`
  } else {
    output = `<div class="notice notice-info">No plan yet. Generate it here, or copy the prompt from the Prompt tab and run it in any AI assistant.</div>`
  }

  return setup + output
}

function scheduleLiveRender() {
  if (liveTimer) return
  liveTimer = window.setTimeout(() => {
    liveTimer = 0
    const view = document.getElementById('planView')
    if (!view) return
    view.innerHTML = renderMarkdown(liveText)
    view.scrollTop = view.scrollHeight
  }, 150)
}

async function startGeneration() {
  if (generating) return
  readForm()
  const readiness = assessBrief(brief.inputs, brief.extras)
  if (!readiness.ready) {
    toast('Fill all six brief fields first')
    return
  }
  const key = apiKey.trim()
  if (!key) {
    toast('Add your Anthropic API key first')
    document.getElementById('f_apiKey')?.focus()
    return
  }

  const rendered = renderPrompt(brief.inputs, brief.extras)
  const promptSha256 = await sha256Text(rendered.prompt)

  generating = true
  liveText = ''
  lastError = ''
  abortCtrl = new AbortController()
  await flushAutoSave()
  renderTabPanel()

  const startedAt = new Date().toISOString()
  try {
    const result = await generatePlan({
      apiKey: key,
      prompt: rendered.prompt,
      model,
      signal: abortCtrl.signal,
      onText: (_delta, snapshot) => {
        liveText = snapshot
        scheduleLiveRender()
      },
    })
    brief.plan = {
      markdown: result.text,
      model: result.model,
      createdAt: startedAt,
      stopReason: result.stopReason,
      promptSha256,
      usage: result.usage,
    }
    if (result.stopReason === 'refusal') {
      lastError = result.refusal?.explanation
        ? `The model declined to generate this plan: ${result.refusal.explanation}`
        : 'The model declined to generate this plan.'
    }
    await persist()
    toast(result.stopReason === 'refusal' ? 'Generation declined' : 'Plan generated')
  } catch (err) {
    if (isAbortError(err)) {
      if (liveText.trim()) {
        brief.plan = {
          markdown: liveText,
          model,
          createdAt: startedAt,
          stopReason: 'aborted',
          promptSha256,
        }
        await persist()
        toast('Stopped — partial plan kept')
      } else {
        toast('Stopped')
      }
    } else {
      lastError = describeApiError(err)
    }
  } finally {
    generating = false
    abortCtrl = null
    window.clearTimeout(liveTimer)
    liveTimer = 0
    renderTabPanel()
  }
}

// ---------- hive tab ----------

function hiveTabHtml(): string {
  return `
    <section class="section">
      <h2>Hive export · Collect → Edit → Dispatch</h2>
      <p class="hint">Jobs follow <code>platform/schema/job.schema.json</code>. Trust tier L1 and Law #2: every outbound is a draft that Barak picks — nothing goes to a founder or customer automatically.</p>
      <div id="hivePreview"><div class="progress"><span class="spinner"></span> Building jobs…</div></div>
      <div class="row">
        <button class="btn btn-primary" id="btnExportHive" type="button">Export hive JSON</button>
        <button class="btn btn-secondary" id="btnBackup" type="button">Backup all briefs</button>
        <button class="btn btn-secondary" id="btnRestore" type="button">Restore</button>
      </div>
    </section>`
}

async function fillHivePreview() {
  const host = document.getElementById('hivePreview')
  if (!host) return
  const bundle = await buildHiveExportBundle(brief)
  if (document.getElementById('hivePreview') !== host) return
  const rows = bundle.jobs
    .map(
      (j) => `
      <tr>
        <td><code>${escapeHtml(j.loop)}</code>${j.error ? `<div class="help">${escapeHtml(j.error)}</div>` : ''}</td>
        <td>${j.kind}</td>
        <td><span class="badge ${statusBadge(j.status)}">${j.status}</span></td>
        <td>${j.trustTier} · cost ${j.costTier}</td>
        <td>${
          j.outbound
            ? `${j.outbound.channel} → ${j.outbound.destinationClass}${j.outbound.requiresHumanPick ? ' · human pick' : ''}`
            : '—'
        }</td>
      </tr>`,
    )
    .join('')
  const complete = bundle.jobs.some((j) => j.loop === LOOPS.dispatch)
  host.innerHTML = `
    <table class="job-table">
      <thead><tr><th>Loop</th><th>Kind</th><th>Status</th><th>Trust</th><th>Outbound</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${
      complete
        ? `<div class="notice notice-info">${bundle.jobs.length} jobs ready. <code>${LOOPS.dispatch}</code> stays queued until Barak picks it (Law #2).</div>`
        : `<div class="notice notice-warn">The edit job is blocked until all six brief fields are filled; <code>${LOOPS.dispatch}</code> is only queued for a complete brief.</div>`
    }`
}

async function exportHive(target: StartupBrief) {
  const bundle = await buildHiveExportBundle(target)
  downloadJson(`hive-startup-brief-${target.id.slice(0, 8)}.json`, bundle)
  const complete = bundle.jobs.some((j) => j.loop === LOOPS.dispatch)
  toast(
    complete
      ? `Hive export: ${bundle.jobs.length} jobs (Collect → Edit → Dispatch draft)`
      : 'Partial hive export — brief incomplete, edit job blocked',
  )
}

// ---------- saved briefs ----------

function savedHtml(): string {
  if (!showSaved) return ''
  const items = savedBriefs
    .map((b, i) => {
      const ready = b.hiveReady ?? assessBrief(b.inputs, b.extras ?? {}).ready
      return `
      <article class="project-item${b.id === brief.id ? ' current' : ''}" style="animation-delay:${i * 40}ms">
        <h3>${escapeHtml(b.name.trim() || briefTitle(b.inputs))}</h3>
        <div class="meta">
          <span>${escapeHtml(new Date(b.updatedAt).toLocaleString())}</span>
          <span class="badge ${ready ? 'badge-ok' : 'badge-warn'}">${ready ? 'ready' : 'draft'}</span>
          ${b.plan ? '<span class="badge badge-info">plan ✓</span>' : ''}
          ${b.id === brief.id ? '<span class="badge badge-info">open now</span>' : ''}
        </div>
        <div class="item-actions">
          <button class="btn btn-secondary btn-sm" data-open="${b.id}" type="button">Open</button>
          <button class="btn btn-secondary btn-sm" data-hive="${b.id}" type="button">Hive JSON</button>
          <button class="btn btn-danger btn-sm" data-del="${b.id}" type="button">Delete</button>
        </div>
      </article>`
    })
    .join('')
  return `
    <section class="section drawer" id="savedDrawer">
      <h2>Saved briefs <span class="count">(${savedBriefs.length})</span></h2>
      <p class="hint">Stored in this browser only (IndexedDB). Use Backup in the Hive tab to move them to another device.</p>
      <div class="project-list">${
        savedBriefs.length
          ? items
          : '<div class="empty">No saved briefs yet — fill the form and it saves automatically.</div>'
      }</div>
    </section>`
}

// ---------- render ----------

function render() {
  const rtlNote = isRtlLanguage(brief.extras['output_language'] ?? '')
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">BEE</div>
        <div class="brand-text">
          <strong>Barak Electric Engineering</strong>
          <span>Hive Collect · AI App Business Plan Generator</span>
        </div>
      </div>
      <div class="topbar-actions">
        <a class="topbar-link" href="${SITE_URL}" target="_blank" rel="noopener">www.barak-e.com</a>
        <a class="topbar-link" href="${APP_URL}" target="_blank" rel="noopener">app.barak-e.com</a>
        <button class="icon-btn" id="btnSaved" type="button">Saved briefs (${savedBriefs.length})</button>
        <button class="icon-btn" id="btnNew" type="button">+ New brief</button>
      </div>
    </header>
    <main class="shell">
      <section class="hero-strip">
        <h1>AI App Business Plan Generator</h1>
        <p>A startup idea research prompt from B.E.E. Answer six questions about the founder and get a complete consulting brief: market analysis, personas, three AI app concepts, an evaluation matrix, business model, a 90-day low-code roadmap and a platform marketing plan. Run it in Claude or ChatGPT, or generate the plan right here.</p>
        <div class="hive-pills">
          <span class="hive-pill">${LOOPS.collect}</span>
          <span class="hive-pill">${LOOPS.render}</span>
          <span class="hive-pill">${LOOPS.generate} · cost 2</span>
          <span class="hive-pill">${LOOPS.dispatch} · Law #2</span>
        </div>
      </section>

      <div class="layout">
        <div class="col">
          ${readinessHtml()}
          <section class="section">
            <h2>Founder brief</h2>
            <p class="hint">Six answers fill every placeholder in the canonical prompt. <span id="autosave" class="hidden">Saved ✓</span></p>
            <div class="field">
              <label for="f_name">Brief name</label>
              <input id="f_name" value="${escapeAttr(brief.name)}" placeholder="Optional — defaults to the summary below" />
              <span class="help">Shown as: <strong id="briefTitle">${escapeHtml(currentTitle())}</strong></span>
            </div>
            ${PROMPT_SPEC.variables.map((v) => fieldHtml(v, brief.inputs[v.name] ?? '', 'v')).join('')}
          </section>
          <section class="section">
            <h2>Extras <span class="count">optional</span></h2>
            <p class="hint">Appended as an “${escapeHtml(PROMPT_SPEC.extras.appendSection)}” section. The canonical prompt text itself is never changed.${rtlNote ? ' The generated plan will display right-to-left.' : ''}</p>
            ${PROMPT_SPEC.extras.fields.map((f) => fieldHtml(f, brief.extras[f.name] ?? '', 'x')).join('')}
          </section>
        </div>

        <div class="col">
          <nav class="tabs" role="tablist">
            <button class="tab${tab === 'prompt' ? ' active' : ''}" data-tab="prompt" type="button">Prompt</button>
            <button class="tab${tab === 'plan' ? ' active' : ''}" data-tab="plan" type="button">Plan${brief.plan ? ' <span class="count">✓</span>' : ''}</button>
            <button class="tab${tab === 'hive' ? ' active' : ''}" data-tab="hive" type="button">Hive export</button>
          </nav>
          <div id="tabPanel">${tabPanelHtml()}</div>
        </div>
      </div>

      ${savedHtml()}

      <p class="footer-note">B.E.E · Barak Electric Engineering · <a href="${SITE_URL}" target="_blank" rel="noopener">www.barak-e.com</a> · <a href="${APP_URL}" target="_blank" rel="noopener">app.barak-e.com</a> · prompt <code>${escapeHtml(PROMPT_SPEC.id)}@${escapeHtml(PROMPT_SPEC.version)}</code> · <a href="${escapeAttr(PROMPT_SPEC.links.source)}" target="_blank" rel="noopener">source</a></p>
    </main>
    <div class="toast" id="toast"></div>`

  bindShellEvents()
  bindPanelEvents()
  if (tab === 'hive') void fillHivePreview()
}

function tabPanelHtml(): string {
  return tab === 'prompt' ? promptTabHtml() : tab === 'plan' ? planTabHtml() : hiveTabHtml()
}

/** Re-render only the right-hand panel: keeps form state, focus and scroll position */
function renderTabPanel() {
  const panel = document.getElementById('tabPanel')
  if (!panel) {
    render()
    return
  }
  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab)
    if (btn.dataset.tab === 'plan') {
      btn.innerHTML = `Plan${brief.plan ? ' <span class="count">✓</span>' : ''}`
    }
  })
  panel.innerHTML = tabPanelHtml()
  bindPanelEvents()
  if (tab === 'hive') void fillHivePreview()
}

function refreshLive() {
  const box = document.getElementById('readiness')
  if (box) box.outerHTML = readinessHtml()

  const hint = document.getElementById('hint_platform_follower_count')
  if (hint) hint.textContent = followerHint(brief.inputs['platform_follower_count'] ?? '')

  const title = document.getElementById('briefTitle')
  if (title) title.textContent = currentTitle()

  const ready = assessBrief(brief.inputs, brief.extras).ready

  if (tab === 'prompt') {
    const view = document.getElementById('promptView')
    if (view) view.innerHTML = promptViewHtml()
    const meta = document.getElementById('promptMeta')
    if (meta) meta.innerHTML = promptMetaHtml(renderPrompt(brief.inputs, brief.extras).prompt)
    for (const id of ['btnOpenClaude', 'btnOpenChatGPT']) {
      const btn = document.getElementById(id) as HTMLButtonElement | null
      if (btn) btn.disabled = !ready
    }
  } else if (tab === 'plan') {
    const gen = document.getElementById('btnGenerate') as HTMLButtonElement | null
    if (gen) gen.disabled = !ready || generating
    const view = document.getElementById('planView')
    if (view) {
      if (isRtlLanguage(brief.extras['output_language'] ?? '')) view.setAttribute('dir', 'rtl')
      else view.removeAttribute('dir')
    }
  } else {
    void fillHivePreview()
  }
}

// ---------- events ----------

function onFormInput(e: Event) {
  const target = e.target as HTMLElement
  if (target instanceof HTMLSelectElement && target.dataset.var) {
    const custom = document.getElementById(
      `${target.dataset.group}c_${target.dataset.var}`,
    ) as HTMLInputElement | null
    if (custom) {
      const isCustom = target.value === CUSTOM
      custom.classList.toggle('hidden', !isCustom)
      if (isCustom && e.type === 'change') custom.focus()
    }
  }
  readForm()
  refreshLive()
  scheduleAutoSave()
}

async function openBrief(id: string) {
  await flushAutoSave()
  const found = await getBrief(id)
  if (!found) return
  found.extras ??= {}
  for (const f of PROMPT_SPEC.extras.fields) found.extras[f.name] ??= f.default ?? ''
  for (const v of PROMPT_SPEC.variables) found.inputs[v.name] ??= ''
  brief = found
  liveText = ''
  lastError = ''
  tab = 'prompt'
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function openInAssistant(base: string) {
  const r = renderPrompt(brief.inputs, brief.extras)
  // open synchronously so popup blockers see the user gesture
  window.open(base + encodeURIComponent(r.prompt), '_blank', 'noopener,noreferrer')
  void copyText(r.prompt)
  toast('Prompt copied as well — paste it if the chat opens empty')
  void flushAutoSave()
}

function bindShellEvents() {
  document.getElementById('btnNew')?.addEventListener('click', async () => {
    await flushAutoSave()
    brief = emptyBrief()
    liveText = ''
    lastError = ''
    tab = 'prompt'
    render()
    document.getElementById('v_industry_vertical')?.focus()
  })
  document.getElementById('btnSaved')?.addEventListener('click', () => {
    showSaved = !showSaved
    render()
    if (showSaved) document.getElementById('savedDrawer')?.scrollIntoView({ behavior: 'smooth' })
  })

  app.querySelectorAll<HTMLElement>('[data-var]').forEach((el) => {
    el.addEventListener('input', onFormInput)
    el.addEventListener('change', onFormInput)
  })
  app.querySelectorAll<HTMLInputElement>('[data-custom-for]').forEach((el) => {
    el.addEventListener('input', onFormInput)
  })
  document.getElementById('f_name')?.addEventListener('input', onFormInput)

  app.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      tab = btn.dataset.tab as Tab
      renderTabPanel()
    }),
  )

  // Saved briefs
  app.querySelectorAll<HTMLElement>('[data-open]').forEach((btn) =>
    btn.addEventListener('click', () => void openBrief(btn.dataset.open!)),
  )
  app.querySelectorAll<HTMLElement>('[data-hive]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const target = await getBrief(btn.dataset.hive!)
      if (target) await exportHive(target)
    }),
  )
  app.querySelectorAll<HTMLElement>('[data-del]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.del!
      if (!confirm('Delete this brief? This cannot be undone.')) return
      await deleteBrief(id)
      savedBriefs = await listBriefs()
      if (brief.id === id) {
        brief = emptyBrief()
        liveText = ''
        lastError = ''
      }
      toast('Brief deleted')
      render()
    }),
  )
}

function bindPanelEvents() {
  // Prompt tab
  document.getElementById('btnCopyPrompt')?.addEventListener('click', async () => {
    const r = renderPrompt(brief.inputs, brief.extras)
    await copyText(r.prompt)
    toast(
      r.unresolved.length
        ? `Prompt copied — ${r.unresolved.length} placeholder${r.unresolved.length === 1 ? '' : 's'} still empty`
        : 'Prompt copied',
    )
    await flushAutoSave()
  })
  document.getElementById('btnDownloadPrompt')?.addEventListener('click', () => {
    const r = renderPrompt(brief.inputs, brief.extras)
    downloadText(`bee-business-plan-prompt-${slugify(currentTitle())}.md`, r.prompt)
    toast('Prompt downloaded')
  })
  document
    .getElementById('btnOpenClaude')
    ?.addEventListener('click', () => openInAssistant('https://claude.ai/new?q='))
  document
    .getElementById('btnOpenChatGPT')
    ?.addEventListener('click', () => openInAssistant('https://chatgpt.com/?q='))

  // Plan tab
  const keyInput = document.getElementById('f_apiKey') as HTMLInputElement | null
  keyInput?.addEventListener('input', () => {
    apiKey = keyInput.value
    if (rememberKey) setSetting('apiKey', apiKey.trim() || null)
  })
  document.getElementById('btnToggleKey')?.addEventListener('click', (e) => {
    if (!keyInput) return
    const show = keyInput.type === 'password'
    keyInput.type = show ? 'text' : 'password'
    ;(e.currentTarget as HTMLButtonElement).textContent = show ? 'Hide' : 'Show'
  })
  document.getElementById('f_rememberKey')?.addEventListener('change', (e) => {
    rememberKey = (e.target as HTMLInputElement).checked
    setSetting('apiKey', rememberKey && apiKey.trim() ? apiKey.trim() : null)
    toast(rememberKey ? 'Key kept in this browser only' : 'Key forgotten when the tab closes')
  })
  document.getElementById('f_model')?.addEventListener('change', (e) => {
    model = resolveModel((e.target as HTMLSelectElement).value)
    setSetting('model', model)
  })
  document.getElementById('btnGenerate')?.addEventListener('click', () => void startGeneration())
  document.getElementById('btnStop')?.addEventListener('click', () => abortCtrl?.abort())
  document.getElementById('btnCopyPlan')?.addEventListener('click', async () => {
    if (!brief.plan) return
    await copyText(brief.plan.markdown)
    toast('Plan copied')
  })
  document.getElementById('btnDownloadPlan')?.addEventListener('click', () => {
    if (!brief.plan) return
    downloadText(`bee-business-plan-${slugify(currentTitle())}.md`, brief.plan.markdown)
    toast('Plan downloaded')
  })
  document.getElementById('btnClearPlan')?.addEventListener('click', async () => {
    if (!confirm('Remove the generated plan from this brief?')) return
    brief.plan = null
    lastError = ''
    await persist()
    renderTabPanel()
  })

  // Hive tab
  document.getElementById('btnExportHive')?.addEventListener('click', async () => {
    readForm()
    await flushAutoSave()
    await exportHive(brief)
  })
  document.getElementById('btnBackup')?.addEventListener('click', async () => {
    downloadJson(
      `bee-business-plan-backup-${new Date().toISOString().slice(0, 10)}.json`,
      await exportBackup(),
    )
    toast('Backup downloaded')
  })
  document.getElementById('btnRestore')?.addEventListener('click', () => {
    pickJsonFile(async (data) => {
      const n = await importBackup(data as { briefs?: StartupBrief[] })
      savedBriefs = await listBriefs()
      toast(`Restored ${n} brief${n === 1 ? '' : 's'}`)
      showSaved = true
      render()
    })
  })
}

// ---------- boot ----------

async function boot() {
  try {
    savedBriefs = await listBriefs()
  } catch {
    savedBriefs = []
  }
  const latest = savedBriefs[0]
  if (latest) {
    latest.extras ??= {}
    for (const f of PROMPT_SPEC.extras.fields) latest.extras[f.name] ??= f.default ?? ''
    for (const v of PROMPT_SPEC.variables) latest.inputs[v.name] ??= ''
    brief = latest
  }
  render()
  window.setTimeout(() => app.classList.add('settled'), 600)
}

void boot()
