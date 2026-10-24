/**
 * "תיק הגשה" in the job drawer: the steps and documents of the job's
 * regulatory track (src/submission.ts), ticked with a date and, where it
 * matters, a reference. Shown once the customer approved.
 */
import { israelToday } from '../dates'
import { escapeAttr, escapeHtml } from '../html'
import { STAGES, type Stage } from '../stage'
import { ACTOR_HE, DOC_NAME_HE, OPTIONAL_PHASES, PHASE_LABEL_HE, SIGNED_BY_HE, STEP_MILESTONE, STEP_REF_HE, TRACKS, submissionProgress, trackPhases, type Phase, type SubmissionMark, type SubmissionRecord } from '../submission'
import { ApiError, type Api, type OfficeJob } from './api'

interface Loaded {
  record: SubmissionRecord | null
  suggested: { id: string; why_he: string }
}

const cache = new Map<string, Loaded | 'loading' | 'error'>()

export const submissionSlot = (j: OfficeJob) => (STAGES.indexOf(j.stage) >= STAGES.indexOf('accepted') ? '<section class="o-sub" id="oSub"></section>' : '')

export function forgetSubmissions() {
  cache.clear()
}

/** The phase to open: where the job is now. */
function openPhase(stage: Stage): Phase {
  return stage === 'inspection' || stage === 'grid' || stage === 'handover' || stage === 'service' ? 'insp' : 'pre'
}

const empty = (track: string): SubmissionRecord => ({ track, steps: {}, docs: {}, na: [], updated_at: '', updated_by: '' })

export function mountSubmission(el: HTMLElement, j: OfficeJob, deps: { api: Api; toast: (s: string) => void; reload: () => Promise<void> }) {
  const c = cache.get(j.id)
  if (!c) {
    cache.set(j.id, 'loading')
    deps.api.submission(j.id).then(
      (r) => cache.set(j.id, { record: r.submission, suggested: r.suggested }),
      () => cache.set(j.id, 'error'),
    ).finally(() => el.isConnected && mountSubmission(el, j, deps))
  }
  if (!c || c === 'loading') return void (el.innerHTML = '<h3>תיק הגשה</h3><div class="meta">טוען…</div>')
  if (c === 'error') return void (el.innerHTML = '<h3>תיק הגשה</h3><div class="meta">התיק לא נטען.</div>')

  const rec = c.record ?? empty(c.suggested.id)
  const prog = submissionProgress(rec)
  const open = openPhase(j.stage)
  const fee = (n: number | null | undefined) => (typeof n === 'number' ? ` · <bdi>${Math.round(n).toLocaleString('en-US')} ₪</bdi>` : '')
  const row = (attr: string, id: string, m: SubmissionMark | undefined, label: string, refLabel?: string) => `
      <div class="o-ms-row" ${attr}="${escapeAttr(id)}">
        <label class="o-ms-check"><input type="checkbox" data-s-on ${m ? 'checked' : ''} /> <span>${label}</span></label>
        <input type="date" data-s-date max="${israelToday()}" value="${escapeAttr(m?.date ?? '')}" />
        ${refLabel ? `<input data-s-ref dir="ltr" maxlength="24" placeholder="${escapeAttr(refLabel)}" value="${escapeAttr(m?.ref ?? '')}" />` : ''}
      </div>`

  el.innerHTML = `
    <h3>תיק הגשה</h3>
    <label class="o-sub-track">מסלול
      <select data-s-track>${TRACKS.map((t) => `<option value="${t.id}" ${t.id === rec.track ? 'selected' : ''}>${escapeHtml(t.name_he)}</option>`).join('')}</select>
    </label>
    <div class="meta">${c.record ? `עודכן ע״י ${escapeHtml(rec.updated_by)}` : `הוצע לפי ההצעה: ${escapeHtml(c.suggested.why_he)}`}${rec.track !== c.suggested.id && c.record ? ` · ההצעה מציעה: ${escapeHtml(TRACKS.find((t) => t.id === c.suggested.id)?.name_he ?? '')}` : ''}</div>
    <div class="o-sub-progress"><b>${prog.stepsDone}/${prog.steps}</b> שלבים · <b>${prog.docsDone}/${prog.docs}</b> מסמכים</div>
    ${prog.missingDocs.length ? `<details class="o-sub-missing"><summary>חסרים ${prog.missingDocs.length} מסמכים</summary><ul>${prog.missingDocs.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul></details>` : ''}
    ${trackPhases(rec.track)
      .map((p) => {
        const na = rec.na.includes(p.phase)
        const done = p.steps.filter((s) => rec.steps[s.id]).length
        return `<details class="o-sub-phase ${na ? 'na' : ''}" data-s-phase="${p.phase}" ${p.phase === open && !na ? 'open' : ''}>
          <summary>${escapeHtml(PHASE_LABEL_HE[p.phase])} <span class="meta">${na ? 'לא רלוונטי' : `${done}/${p.steps.length}`}</span></summary>
          ${OPTIONAL_PHASES.has(p.phase) ? `<label class="o-sub-na"><input type="checkbox" data-s-na="${p.phase}" ${na ? 'checked' : ''} /> לא רלוונטי לעבודה הזו</label>` : ''}
          <h5>שלבים</h5>
          ${p.steps
            .map((s) =>
              row(
                'data-s-step',
                s.id,
                rec.steps[s.id],
                `${escapeHtml(s.name_he)} <span class="badge o-actor">${escapeHtml(ACTOR_HE[s.actor] ?? s.actor)}</span>${fee(s.fee?.expected_amount_ils)}${STEP_MILESTONE[s.id] ? ' <span class="meta">· מסמן גם אבן דרך</span>' : ''}`,
                STEP_REF_HE[s.id],
              ),
            )
            .join('')}
          ${p.docs.length ? '<h5>מסמכים</h5>' : ''}
          ${p.docs
            .map((d) => row('data-s-doc', d.kind, rec.docs[d.kind], `${escapeHtml(DOC_NAME_HE[d.kind] ?? d.kind)}${d.required ? '' : ' <span class="meta">(אם נדרש)</span>'}${d.signed_by && SIGNED_BY_HE[d.signed_by] ? ` <span class="badge o-actor">${escapeHtml(SIGNED_BY_HE[d.signed_by])}</span>` : ''}`))
            .join('')}
        </details>`
      })
      .join('')}
    <button class="btn btn-primary" id="oSaveSub">שמור תיק הגשה</button>`

  const save = async (body: Record<string, unknown>) => {
    try {
      const r = await deps.api.saveSubmission(j.id, body)
      cache.set(j.id, { record: r.submission, suggested: c.suggested })
      // A milestone may have moved the stage; the timeline has new lines either way.
      // The reload re-renders the screen, so the toast comes after it.
      await deps.reload()
      deps.toast(r.office ? 'נשמר · גם אבן הדרך סומנה' : 'נשמר')
    } catch (err) {
      deps.toast(err instanceof ApiError ? err.message : 'השמירה נכשלה')
    }
  }

  el.querySelector<HTMLSelectElement>('[data-s-track]')!.onchange = (e) => void save({ track: (e.target as HTMLSelectElement).value })
  el.onclick = (e) => {
    const t = e.target as HTMLElement
    const on = t.closest<HTMLInputElement>('[data-s-on]')
    if (on?.checked) {
      // Ticking means today, unless a date is already there.
      const date = on.closest('.o-ms-row')!.querySelector<HTMLInputElement>('[data-s-date]')!
      if (!date.value) date.value = israelToday()
      return
    }
    if (!t.closest('#oSaveSub')) return
    const diff = (attr: 'data-s-step' | 'data-s-doc', have: Record<string, SubmissionMark>) => {
      const out: Record<string, SubmissionMark | null> = {}
      for (const r of el.querySelectorAll<HTMLElement>(`[${attr}]`)) {
        const id = r.getAttribute(attr)!
        const checked = r.querySelector<HTMLInputElement>('[data-s-on]')!.checked
        const date = r.querySelector<HTMLInputElement>('[data-s-date]')!.value
        const ref = r.querySelector<HTMLInputElement>('[data-s-ref]')?.value.trim() ?? ''
        const prev = have[id]
        if (!checked) {
          if (prev) out[id] = null
        } else if (!date) throw new Error('חסר תאריך לשורה שסומנה')
        else if (!prev || prev.date !== date || (prev.ref ?? '') !== ref) out[id] = { date, ...(ref ? { ref } : {}) }
      }
      return out
    }
    try {
      const steps = diff('data-s-step', rec.steps)
      const docs = diff('data-s-doc', rec.docs)
      const na = [...el.querySelectorAll<HTMLInputElement>('[data-s-na]')].filter((x) => x.checked).map((x) => x.dataset.sNa as Phase)
      const naChanged = na.length !== rec.na.length || na.some((p) => !rec.na.includes(p))
      const body: Record<string, unknown> = {}
      if (Object.keys(steps).length) body.steps = steps
      if (Object.keys(docs).length) body.docs = docs
      if (naChanged || !c.record) body.na = na
      if (!c.record) body.track = rec.track
      if (!Object.keys(body).length) return deps.toast('אין שינוי')
      void save(body)
    } catch (err) {
      deps.toast((err as Error).message)
    }
  }
}
