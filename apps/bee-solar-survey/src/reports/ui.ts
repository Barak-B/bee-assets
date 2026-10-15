/**
 * Field reports UI: the per-job reports dialog and one generic editor that
 * renders any template (fields, checklists with ✓/✗/N.A. + value + photo,
 * tables as cards, photos, drawn signatures). Works offline; every change is
 * saved to IndexedDB. A locked report is read-only — changes are a new revision.
 */
import { getProject, getReport, listQuotes, listReports, saveReport, deleteDraftReport } from '../db'
import { escapeAttr, escapeHtml } from '../html'
import { compressImageFile } from '../photos'
import { loadPricing } from '../pricing'
import { sha256OfDataUrl } from '../schema'
import { outcomeToast, shareOrDownload } from '../share'
import { markDirty } from '../sync'
import { blankRow, buildContext, defectsFromInspection, finalizeReport, newReport, reviseReport, template, validateReport, visibleSections } from './model'
import { TEMPLATES, TEMPLATE_ORDER } from './templates'
import type { ChecklistItemDef, ColumnDef, FieldDef, ItemResult, ReportInstance, SectionDef, TemplateKey } from './types'

export interface ReportsDialogCtx {
  toast: (msg: string) => void
  /** Resolves once the editor is on screen (a toast shown before that would be wiped). */
  openReport: (id: string) => Promise<void>
}

export interface ReportEditorCtx {
  app: HTMLElement
  toast: (msg: string) => void
  onBack: () => void
  openReport: (id: string) => Promise<void>
}

const requestSync = () => window.dispatchEvent(new Event('bee-sync-request'))
// The survey's backup chip should show "ממתין לגיבוי" until the report reaches the server.
const markChanged = (projectId: string) => void markDirty(projectId).catch(() => undefined)

const TONE_CLASS = { ok: 'badge-ok', warn: 'badge-warn', fail: 'badge-fail' } as const

async function jobContext(projectId: string) {
  const project = await getProject(projectId)
  if (!project) throw new Error('project not found')
  const quotes = await listQuotes(projectId)
  const pricing = await loadPricing()
  return buildContext(project, quotes[0]?.quote ?? null, pricing.rules.texts?.warranty ?? [])
}

// ── Reports dialog (per job) ─────────────────────────────────────────────

export async function openReportsDialog(projectId: string, ctx: ReportsDialogCtx): Promise<void> {
  const project = await getProject(projectId)
  if (!project) return
  const reports = await listReports(projectId)
  const host = document.createElement('div')
  host.id = 'reportsDialogHost'
  document.getElementById('reportsDialogHost')?.remove()
  const card = (r: ReportInstance) => {
    const t = template(r)
    const o = t.outcome?.(r)
    return `
      <article class="quote-card" data-report="${r.id}">
        <h3>${escapeHtml(t.title_he)} · גרסה ${r.revision}</h3>
        <div class="meta">
          <span>${escapeHtml(r.updatedAt.replace('T', ' ').slice(0, 16))}</span>
          <span class="badge ${r.status === 'final' ? 'badge-ok' : 'badge-warn'}">${r.status === 'final' ? 'נעול' : 'טיוטה'}</span>
          ${o ? `<span class="badge ${TONE_CLASS[o.tone]}">${escapeHtml(o.label_he)}</span>` : ''}
        </div>
        <div class="item-actions"><button class="btn btn-secondary" data-r-open="${r.id}">${r.status === 'final' ? 'צפייה' : 'המשך מילוי'}</button></div>
      </article>`
  }
  host.innerHTML = `
    <div class="dialog-backdrop" id="rdBackdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="rdTitle">
        <header class="dialog-head">
          <h2 id="rdTitle">דוחות שטח · ${escapeHtml(project.projectName)}</h2>
          <button class="icon-btn" id="rdClose" aria-label="סגור">סגור</button>
        </header>
        <div class="field"><label>דוח חדש</label>
          <div class="report-new">
            ${TEMPLATE_ORDER.map((k) => `<button class="btn btn-secondary" data-r-new="${k}" title="${escapeAttr(TEMPLATES[k].description_he)}">${escapeHtml(TEMPLATES[k].title_he)}</button>`).join('')}
          </div>
        </div>
        <div class="quote-list" id="rdList">${reports.length ? reports.map(card).join('') : '<div class="empty">אין דוחות עדיין לפרויקט.</div>'}</div>
      </div>
    </div>`
  document.body.appendChild(host)
  const close = () => host.remove()
  host.querySelector('#rdClose')?.addEventListener('click', close)
  host.querySelector('#rdBackdrop')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close()
  })
  host.querySelectorAll<HTMLElement>('[data-r-open]').forEach((b) =>
    b.addEventListener('click', () => {
      close()
      void ctx.openReport(b.dataset.rOpen!)
    }),
  )
  host.querySelectorAll<HTMLElement>('[data-r-new]').forEach((b) =>
    b.addEventListener('click', async () => {
      const r = newReport(b.dataset.rNew as TemplateKey, projectId, await jobContext(projectId), reports)
      await saveReport(r)
      close()
      await ctx.openReport(r.id)
    }),
  )
}

// ── Editor ───────────────────────────────────────────────────────────────

let current: ReportInstance | null = null
let others: ReportInstance[] = []
let saveTimer = 0

function scheduleSave(ctx: ReportEditorCtx) {
  if (!current || current.status === 'final') return
  window.clearTimeout(saveTimer)
  const r = current
  saveTimer = window.setTimeout(async () => {
    r.updatedAt = new Date().toISOString()
    await saveReport(r)
    const ind = ctx.app.querySelector('#rpSaved')
    if (ind) ind.textContent = 'נשמר ✓'
    markChanged(r.projectId)
    requestSync()
  }, 500)
}

async function saveNow() {
  window.clearTimeout(saveTimer)
  if (current && current.status !== 'final') {
    current.updatedAt = new Date().toISOString()
    await saveReport(current)
    markChanged(current.projectId)
    requestSync()
  }
}

function selectHtml(id: string, opts: { value: string; label_he: string }[], v: string, dis: string, attrs: string) {
  return `<select id="${id}" ${attrs} ${dis}><option value="">—</option>${opts.map((o) => `<option value="${escapeAttr(o.value)}" ${o.value === v ? 'selected' : ''}>${escapeHtml(o.label_he)}</option>`).join('')}</select>`
}

const YESNO = [
  { value: 'yes', label_he: 'כן' },
  { value: 'no', label_he: 'לא' },
]

function fieldHtml(sec: string, f: FieldDef, r: ReportInstance, dis: string): string {
  const v = r.fields[sec]?.[f.key] ?? ''
  const id = `rf_${sec}_${f.key}`
  const attrs = `data-f="${sec}|${f.key}"`
  const label = `<label for="${id}">${escapeHtml(f.label_he)}${f.required ? ' <span class="req">*</span>' : ''}${f.unit ? ` <span class="unit">(${escapeHtml(f.unit)})</span>` : ''}${f.unverified ? ' <span class="badge badge-warn">לאימות</span>' : ''}</label>`
  let input: string
  if (f.kind === 'textarea') input = `<textarea id="${id}" ${attrs} ${dis}>${escapeHtml(v)}</textarea>`
  else if (f.kind === 'select') input = selectHtml(id, f.options ?? [], v, dis, attrs)
  else if (f.kind === 'yesno') input = selectHtml(id, YESNO, v, dis, attrs)
  else input = `<input id="${id}" ${attrs} ${dis} type="${f.kind === 'date' ? 'date' : 'text'}" ${f.kind === 'number' ? 'inputmode="decimal" dir="ltr"' : ''} value="${escapeAttr(v)}" />`
  return `<div class="field">${label}${input}${f.hint_he ? `<div class="meta">${escapeHtml(f.hint_he)}</div>` : ''}</div>`
}

function thumbs(r: ReportInstance, sec: string, item: string | undefined, dis: string): string {
  const list = r.photos.filter((p) => p.sectionKey === sec && (p.itemCode ?? '') === (item ?? ''))
  if (!list.length) return ''
  return `<div class="thumbs">${list.map((p) => `<div class="thumb"><img src="${p.dataUrl}" alt="" />${dis ? '' : `<button type="button" title="מחק" data-pdel="${p.id}">×</button>`}</div>`).join('')}</div>`
}

function checklistItemHtml(sec: string, i: ChecklistItemDef, r: ReportInstance, dis: string): string {
  const e = r.checklists[sec]?.[i.code] ?? { result: '' as ItemResult, value: '', note: '' }
  const btn = (res: ItemResult, label: string) =>
    `<button type="button" class="seg ${e.result === res ? `on seg-${res}` : ''}" data-ck="${sec}|${i.code}" data-res="${res}" ${dis} aria-pressed="${e.result === res}">${label}</button>`
  return `
    <div class="ck-item ${e.result ? `ck-${e.result}` : ''}" data-ckitem="${sec}|${i.code}">
      <div class="ck-head"><span class="ck-code"><bdi>${escapeHtml(i.code)}</bdi></span> ${escapeHtml(i.label_he)}${i.required ? '' : ' <span class="unit">(רשות)</span>'}${i.ruleRef ? ` <span class="unit"><bdi>${escapeHtml(i.ruleRef)}</bdi></span>` : ''}</div>
      <div class="ck-row">
        <div class="segs">${btn('ok', '✓ תקין')}${btn('fail', '✗ לא תקין')}${btn('na', 'לא רלוונטי')}</div>
        ${i.evidence === 'photo' && !dis ? `<button type="button" class="btn btn-ghost btn-sm" data-padd="${sec}|${i.code}">📷 תמונה</button>` : ''}
      </div>
      ${i.evidence === 'value' ? `<input class="ck-value" ${dis} data-ckv="${sec}|${i.code}" inputmode="decimal" dir="ltr" placeholder="${escapeAttr(i.unit ? `ערך (${i.unit})` : 'ערך')}" value="${escapeAttr(e.value)}" />` : ''}
      ${i.evidence === 'document' ? '<div class="meta">מסמך בתיק המתקן</div>' : ''}
      <input class="ck-note ${e.result === 'fail' || e.note ? '' : 'hidden'}" ${dis} data-ckn="${sec}|${i.code}" placeholder="תיאור / הערה" value="${escapeAttr(e.note)}" />
      ${thumbs(r, sec, i.code, dis)}
    </div>`
}

function cellHtml(sec: string, idx: number, c: ColumnDef, row: Record<string, string>, r: ReportInstance, dis: string): string {
  const label = `<span class="tb-label">${escapeHtml(c.label_he)}${c.unit ? ` <span class="unit">(${escapeHtml(c.unit)})</span>` : ''}${c.required && c.kind !== 'computed' ? ' <span class="req">*</span>' : ''}</span>`
  if (c.kind === 'computed') return `<div class="tb-cell tb-comp">${label}<output data-tc="${sec}|${idx}|${c.key}">${escapeHtml(c.compute?.(row, r) || '—')}</output></div>`
  const v = row[c.key] ?? ''
  const attrs = `data-t="${sec}|${idx}|${c.key}"`
  const id = `rt_${sec}_${idx}_${c.key}`
  const input =
    c.kind === 'select'
      ? selectHtml(id, c.options ?? [], v, dis, attrs)
      : c.kind === 'yesno'
        ? selectHtml(id, YESNO, v, dis, attrs)
        : `<input id="${id}" ${attrs} ${dis} ${c.kind === 'number' ? 'inputmode="decimal" dir="ltr"' : ''} value="${escapeAttr(v)}" />`
  return `<label class="tb-cell" for="${id}">${label}${input}</label>`
}

function sectionHtml(s: SectionDef, r: ReportInstance, dis: string): string {
  const head = `<h2>${escapeHtml(s.title_he)}</h2>${s.hint_he ? `<p class="hint">${escapeHtml(s.hint_he)}</p>` : ''}`
  if (s.kind === 'fields') return `<section class="section" data-sec="${s.key}">${head}<div class="grid-2">${s.fields.map((f) => fieldHtml(s.key, f, r, dis)).join('')}</div></section>`
  if (s.kind === 'checklist') {
    const entries = r.checklists[s.key] ?? {}
    const done = s.items.filter((i) => entries[i.code]?.result).length
    return `<section class="section" data-sec="${s.key}">${head}<div class="meta">${done}/${s.items.length} נבדקו</div>${s.items.map((i) => checklistItemHtml(s.key, i, r, dis)).join('')}${dis ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-ckall="${s.key}">סמן הכול תקין</button>`}</section>`
  }
  if (s.kind === 'table') {
    const rows = r.tables[s.key] ?? []
    return `<section class="section" data-sec="${s.key}">${head}
      ${rows.map((row, i) => `<div class="tb-row"><div class="tb-row-head"><strong>${i + 1}</strong>${dis ? '' : `<button type="button" class="icon-btn icon-btn-sm" data-tdel="${s.key}|${i}" aria-label="מחק שורה">מחק</button>`}</div><div class="tb-cells">${s.columns.map((c) => cellHtml(s.key, i, c, row, r, dis)).join('')}</div></div>`).join('')}
      ${dis ? '' : `<button type="button" class="btn btn-secondary" data-tadd="${s.key}">+ ${escapeHtml(s.addLabel_he ?? 'הוסף שורה')}</button>`}
    </section>`
  }
  if (s.kind === 'photos') {
    if (dis && !r.photos.some((p) => p.sectionKey === s.key)) return ''
    return `<section class="section" data-sec="${s.key}">${head}${s.min ? `<div class="meta">לפחות ${s.min}</div>` : ''}
      ${dis ? '' : `<div class="photo-actions"><button type="button" class="btn btn-secondary" data-padd="${s.key}|" data-cam="1">מצלמה</button><button type="button" class="btn btn-secondary" data-padd="${s.key}|">גלריה</button></div>`}
      ${thumbs(r, s.key, undefined, dis)}</section>`
  }
  return `<section class="section" data-sec="${s.key}">${head}
    ${s.signers
      .map((g) => {
        const sg = r.signatures[g.key]
        return `<div class="sig-box">
          <div><strong>${escapeHtml(g.label_he)}</strong>${g.required ? ' <span class="req">*</span>' : ''}</div>
          ${
            sg
              ? `<img class="sig-img" src="${sg.dataUrl}" alt="חתימה" /><div class="meta">${escapeHtml(sg.name)} · ${escapeHtml(sg.signedAt.replace('T', ' ').slice(0, 16))}</div>${dis ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-sclear="${g.key}">נקה חתימה</button>`}`
              : dis
                ? '<div class="meta">לא נחתם</div>'
                : `<button type="button" class="btn btn-secondary" data-sign="${g.key}" data-role="${escapeAttr(g.label_he)}">חתימה</button>`
          }
        </div>`
      })
      .join('')}</section>`
}

export async function renderReportEditor(reportId: string, ctx: ReportEditorCtx): Promise<void> {
  const r = await getReport(reportId)
  if (!r) {
    ctx.toast('הדוח לא נמצא')
    ctx.onBack()
    return
  }
  current = r
  others = (await listReports(r.projectId)).filter((o) => o.id !== r.id)
  draw(ctx)
}

function draw(ctx: ReportEditorCtx, keepScroll = false) {
  const r = current!
  const t = template(r)
  const final = r.status === 'final'
  const dis = final ? 'disabled' : ''
  const scroll = window.scrollY
  const o = t.outcome?.(r)
  const canDefects = final && r.templateKey === 'inspection_62446' && (o?.tone === 'fail' || o?.tone === 'warn')
  ctx.app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">BEE</div>
        <div class="brand-text"><strong>${escapeHtml(t.title_he)}</strong><span>${escapeHtml(r.context.projectName)} · גרסה ${r.revision} · ${final ? 'נעול' : 'טיוטה'}</span></div>
      </div>
      <div class="topbar-actions"><button class="icon-btn" id="rpBack">חזרה</button></div>
    </header>
    <main class="shell report-editor">
      ${o ? `<div class="note ${o.tone === 'ok' ? 'note-ok' : 'note-warn'}" id="rpOutcome"><strong>${escapeHtml(o.label_he)}</strong></div>` : ''}
      ${final ? `<div class="note note-ok">נעול ב-${escapeHtml((r.finalizedAt ?? '').replace('T', ' ').slice(0, 16))} · <bdi>${escapeHtml((r.contentHash ?? '').slice(0, 16))}</bdi>. שינוי = גרסה חדשה.</div>` : '<div class="meta" id="rpSaved"></div>'}
      <div id="rpIssues"></div>
      ${visibleSections(t, r).map((s) => sectionHtml(s, r, dis)).join('')}
    </main>
    <div class="sticky-actions">
      <button class="btn btn-secondary" id="rpPdf">PDF</button>
      ${canDefects ? '<button class="btn btn-secondary" id="rpDefects">צור רשימת ליקויים</button>' : ''}
      ${final ? '<button class="btn btn-primary" id="rpRevise">גרסה חדשה</button>' : '<button class="btn btn-danger" id="rpDelete">מחק טיוטה</button><button class="btn btn-primary" id="rpFinalize">סיים ונעל</button>'}
    </div>
    <div class="toast" id="toast"></div>
    <div id="sigHost"></div>`
  if (keepScroll) window.scrollTo(0, scroll)
  bind(ctx)
}

function refreshComputed(ctx: ReportEditorCtx) {
  const r = current!
  const t = template(r)
  ctx.app.querySelectorAll<HTMLOutputElement>('[data-tc]').forEach((el) => {
    const [sec, idx, col] = el.dataset.tc!.split('|') as [string, string, string]
    const s = t.sections.find((x) => x.key === sec)
    if (s?.kind !== 'table') return
    const c = s.columns.find((x) => x.key === col)
    el.textContent = c?.compute?.(r.tables[sec]?.[Number(idx)] ?? {}, r) || '—'
  })
  const o = t.outcome?.(r)
  const box = ctx.app.querySelector('#rpOutcome')
  if (box && o) box.innerHTML = `<strong>${escapeHtml(o.label_he)}</strong>`
}

function pickImage(camera: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = !camera
    if (camera) input.setAttribute('capture', 'environment')
    input.onchange = () => resolve([...(input.files ?? [])])
    input.click()
  })
}

function bind(ctx: ReportEditorCtx) {
  const app = ctx.app
  const r = current!
  const $ = (sel: string) => app.querySelector<HTMLElement>(sel)

  $('#rpBack')?.addEventListener('click', async () => {
    await saveNow()
    current = null
    ctx.onBack()
  })

  if (r.status !== 'final') {
    app.querySelectorAll<HTMLInputElement>('[data-f]').forEach((el) =>
      el.addEventListener('input', () => {
        const [sec, key] = el.dataset.f!.split('|') as [string, string]
        ;(r.fields[sec] ??= {})[key] = el.value
        refreshComputed(ctx)
        scheduleSave(ctx)
      }),
    )
    app.querySelectorAll<HTMLButtonElement>('[data-ck]').forEach((el) =>
      el.addEventListener('click', () => {
        const [sec, code] = el.dataset.ck!.split('|') as [string, string]
        const e = ((r.checklists[sec] ??= {})[code] ??= { result: '', value: '', note: '' })
        const res = el.dataset.res as ItemResult
        e.result = e.result === res ? '' : res
        scheduleSave(ctx)
        draw(ctx, true)
        if (e.result === 'fail') app.querySelector<HTMLInputElement>(`[data-ckn="${sec}|${code}"]`)?.focus()
      }),
    )
    app.querySelectorAll<HTMLInputElement>('[data-ckv],[data-ckn]').forEach((el) =>
      el.addEventListener('input', () => {
        const isValue = !!el.dataset.ckv
        const [sec, code] = (el.dataset.ckv ?? el.dataset.ckn)!.split('|') as [string, string]
        const e = ((r.checklists[sec] ??= {})[code] ??= { result: '', value: '', note: '' })
        if (isValue) e.value = el.value
        else e.note = el.value
        scheduleSave(ctx)
      }),
    )
    app.querySelectorAll<HTMLElement>('[data-ckall]').forEach((el) =>
      el.addEventListener('click', () => {
        const sec = el.dataset.ckall!
        for (const e of Object.values(r.checklists[sec] ?? {})) if (!e.result) e.result = 'ok'
        scheduleSave(ctx)
        draw(ctx, true)
      }),
    )
    app.querySelectorAll<HTMLInputElement>('[data-t]').forEach((el) =>
      el.addEventListener('input', () => {
        const [sec, idx, col] = el.dataset.t!.split('|') as [string, string, string]
        const row = (r.tables[sec] ??= [])[Number(idx)]
        if (row) row[col] = el.value
        refreshComputed(ctx)
        scheduleSave(ctx)
      }),
    )
    app.querySelectorAll<HTMLElement>('[data-tadd]').forEach((el) =>
      el.addEventListener('click', () => {
        const sec = el.dataset.tadd!
        ;(r.tables[sec] ??= []).push(blankRow(r, sec))
        scheduleSave(ctx)
        draw(ctx, true)
      }),
    )
    app.querySelectorAll<HTMLElement>('[data-tdel]').forEach((el) =>
      el.addEventListener('click', () => {
        const [sec, idx] = el.dataset.tdel!.split('|') as [string, string]
        r.tables[sec]?.splice(Number(idx), 1)
        scheduleSave(ctx)
        draw(ctx, true)
      }),
    )
    app.querySelectorAll<HTMLElement>('[data-padd]').forEach((el) =>
      el.addEventListener('click', async () => {
        const [sec, code] = el.dataset.padd!.split('|') as [string, string]
        const files = await pickImage(el.dataset.cam === '1')
        for (const file of files.slice(0, 10)) {
          const { dataUrl, mimeType } = await compressImageFile(file)
          r.photos.push({ id: crypto.randomUUID(), sectionKey: sec, ...(code ? { itemCode: code } : {}), dataUrl, mimeType, sha256: await sha256OfDataUrl(dataUrl), createdAt: new Date().toISOString() })
        }
        if (files.length) {
          await saveNow()
          draw(ctx, true)
          ctx.toast(`${files.length} תמונות נוספו`)
        }
      }),
    )
    app.querySelectorAll<HTMLElement>('[data-pdel]').forEach((el) =>
      el.addEventListener('click', async () => {
        r.photos = r.photos.filter((p) => p.id !== el.dataset.pdel)
        await saveNow()
        draw(ctx, true)
      }),
    )
    app.querySelectorAll<HTMLElement>('[data-sign]').forEach((el) =>
      el.addEventListener('click', () =>
        openSignaturePad(app.querySelector('#sigHost')!, el.dataset.role ?? '', async (name, dataUrl) => {
          r.signatures[el.dataset.sign!] = { name, dataUrl, signedAt: new Date().toISOString() }
          await saveNow()
          draw(ctx, true)
        }),
      ),
    )
    app.querySelectorAll<HTMLElement>('[data-sclear]').forEach((el) =>
      el.addEventListener('click', async () => {
        delete r.signatures[el.dataset.sclear!]
        await saveNow()
        draw(ctx, true)
      }),
    )
    $('#rpDelete')?.addEventListener('click', async () => {
      if (!confirm('למחוק את הטיוטה?')) return
      window.clearTimeout(saveTimer)
      await deleteDraftReport(r.id)
      current = null
      ctx.onBack()
    })
    $('#rpFinalize')?.addEventListener('click', async () => {
      await saveNow()
      const v = validateReport(r, others)
      const box = $('#rpIssues')!
      if (v.missing.length) {
        box.innerHTML = `<div class="note note-warn" id="rpMissing"><div><strong>חסר כדי לנעול (${v.missing.length}):</strong><ul>${v.missing.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul></div></div>`
        window.scrollTo(0, 0)
        return
      }
      if (v.warnings.length && !confirm(`לתשומת לב:\n• ${v.warnings.join('\n• ')}\n\nלנעול בכל זאת?`)) return
      const final = await finalizeReport(r, others)
      await saveReport(final)
      current = final
      markChanged(final.projectId)
      requestSync()
      draw(ctx)
      ctx.toast('הדוח ננעל')
    })
  } else {
    $('#rpRevise')?.addEventListener('click', async () => {
      const rev = reviseReport(r, [...others, r])
      await saveReport(rev)
      await ctx.openReport(rev.id)
      ctx.toast(`נפתחה גרסה ${rev.revision} — החתימות לא עוברות`)
    })
    $('#rpDefects')?.addEventListener('click', async () => {
      const d = defectsFromInspection(r, [...others, r])
      await saveReport(d)
      requestSync()
      await ctx.openReport(d.id)
      ctx.toast(`נוצרה רשימת ליקויים · ${d.tables.defects?.filter((x) => x.description).length ?? 0} פריטים`)
    })
  }

  $('#rpPdf')?.addEventListener('click', async () => {
    await saveNow()
    ctx.toast('מכין PDF...')
    try {
      const { buildReportPdf, reportPdfFilename } = await import('./pdf')
      const res = await buildReportPdf(current!)
      const outcome = await shareOrDownload(res.blob, reportPdfFilename(current!), `${template(current!).title_he} — ${current!.context.projectName}`)
      ctx.toast(`${outcomeToast(outcome, 'הדוח')} · ${res.meta.pages} עמ׳`)
    } catch (err) {
      console.error(err)
      ctx.toast('יצירת ה-PDF נכשלה')
    }
  })
}

// ── Signature pad ────────────────────────────────────────────────────────

function openSignaturePad(host: HTMLElement, role: string, onSave: (name: string, dataUrl: string) => void) {
  host.innerHTML = `
    <div class="dialog-backdrop" id="sgBackdrop">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sgTitle">
        <header class="dialog-head"><h2 id="sgTitle">חתימה · ${escapeHtml(role)}</h2></header>
        <div class="field"><label for="sgName">שם מלא</label><input id="sgName" autocomplete="name" /></div>
        <canvas id="sgCanvas" class="sig-canvas" width="600" height="220" aria-label="שטח חתימה"></canvas>
        <div class="row">
          <button class="btn btn-secondary" id="sgClear">נקה</button>
          <button class="btn btn-secondary" id="sgCancel">ביטול</button>
          <button class="btn btn-primary" id="sgSave">שמור חתימה</button>
        </div>
      </div>
    </div>`
  const canvas = host.querySelector<HTMLCanvasElement>('#sgCanvas')!
  const c = canvas.getContext('2d')!
  const reset = () => {
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, canvas.width, canvas.height)
    c.strokeStyle = '#0f1c24'
    c.lineWidth = 3
    c.lineCap = 'round'
    c.lineJoin = 'round'
  }
  reset()
  let drawing = false
  let strokes = 0
  const pos = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect()
    return { x: ((e.clientX - b.left) / b.width) * canvas.width, y: ((e.clientY - b.top) / b.height) * canvas.height }
  }
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true
    strokes++
    const p = pos(e)
    c.beginPath()
    c.moveTo(p.x, p.y)
    canvas.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return
    const p = pos(e)
    c.lineTo(p.x, p.y)
    c.stroke()
  })
  canvas.addEventListener('pointerup', () => (drawing = false))
  const close = () => (host.innerHTML = '')
  host.querySelector('#sgClear')?.addEventListener('click', () => {
    strokes = 0
    reset()
  })
  host.querySelector('#sgCancel')?.addEventListener('click', close)
  host.querySelector('#sgSave')?.addEventListener('click', () => {
    const name = host.querySelector<HTMLInputElement>('#sgName')!.value.trim()
    if (name.length < 2) {
      host.querySelector<HTMLInputElement>('#sgName')!.focus()
      return
    }
    if (!strokes) return
    const dataUrl = canvas.toDataURL('image/png')
    close()
    onSave(name, dataUrl)
  })
  host.querySelector<HTMLInputElement>('#sgName')!.focus()
}
