import './style.css'
import {
  deletePhoto,
  deleteProject,
  exportBackup,
  getProject,
  getSurveyors,
  importBackup,
  listPhotos,
  listProjects,
  rememberSurveyor,
  savePhoto,
  saveProject,
  type StoredPhoto,
} from './db'
import { buildHiveExportBundle, downloadJson } from './hive'
import { buildSurveyPdf, downloadBlob } from './pdf'
import { fileToSurveyPhoto, getCurrentGps } from './photos'
import { assessCompleteness, emptyProject, parseGps } from './schema'
import {
  BREAKER_OPTIONS,
  PHOTO_FIELD_LABELS,
  type CustomField,
  type PhotoFieldKey,
  type SiteSurveyProject,
} from './types'

type Screen = 'list' | 'form'

const app = document.querySelector<HTMLDivElement>('#app')!

let screen: Screen = 'list'
let editing: SiteSurveyProject = emptyProject()
let photos: StoredPhoto[] = []
let search = ''
let toastTimer = 0
let autoSaveTimer = 0
let drawTarget: StoredPhoto | null = null

function toast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200)
}

function scheduleAutoSave() {
  window.clearTimeout(autoSaveTimer)
  autoSaveTimer = window.setTimeout(async () => {
    if (!editing.projectName.trim()) return
    await persistCurrent()
    const ind = document.getElementById('autosave')
    if (ind) {
      ind.textContent = 'נשמר אוטומטית ✓'
      ind.classList.remove('hidden')
    }
  }, 800)
}

async function persistCurrent() {
  const gpsParsed = parseGps(editing.gps)
  editing.lat = editing.lat ?? gpsParsed.lat
  editing.lon = editing.lon ?? gpsParsed.lon
  editing.updatedAt = new Date().toISOString()
  editing.hiveReady = assessCompleteness(editing, photos).readyForWave54
  await saveProject(editing)
  if (editing.surveyor) await rememberSurveyor(editing.surveyor)
}

function readFormIntoEditing() {
  const g = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)?.value ?? ''
  editing.projectName = g('f_projectName')
  editing.surveyDate = g('f_date')
  editing.surveyor = g('f_surveyor')
  editing.gps = g('f_gps')
  editing.address = g('f_address')
  editing.mainBreaker = g('f_mainBreaker')
  editing.panelSpace = g('f_panelSpace') as SiteSurveyProject['panelSpace']
  editing.solarBreaker = g('f_solarBreaker')
  editing.meterNumber = g('f_meterNumber')
  editing.meterType = g('f_meterType') as SiteSurveyProject['meterType']
  editing.meterLocation = g('f_meterLocation')
  editing.cableLengthM = g('f_cableLength')
  editing.cableNotes = g('f_cableNotes')
  editing.roofTypeHe = g('f_roofType') as SiteSurveyProject['roofTypeHe']
  editing.inverterLocation = g('f_inverterLocation')
  editing.usableAreaM2 = g('f_usableArea')
  editing.azimuthDeg = g('f_azimuth')
  editing.tiltDeg = g('f_tilt')
  editing.annualConsumptionKwh = g('f_consumption')
  editing.targetKwp = g('f_targetKwp')
  editing.budgetIls = g('f_budget')
  editing.inverterBrandPref = g('f_inverterBrand') as SiteSurveyProject['inverterBrandPref']
  editing.includeBattery = (document.getElementById('f_battery') as HTMLInputElement | null)?.checked ?? false
  editing.generalNotes = g('f_generalNotes')
}

function options(list: readonly string[], selected: string): string {
  return [`<option value="">בחר...</option>`, ...list.map((v) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v}</option>`)].join('')
}

function photoBlock(field: PhotoFieldKey, required = false): string {
  const list = photos.filter((p) => p.field === field)
  return `
    <div class="photo-block" data-field="${field}">
      <h3>${PHOTO_FIELD_LABELS[field]}${required ? ' <span class="req">*</span>' : ''} <span class="meta">(${list.length}/10)</span></h3>
      <div class="photo-actions">
        <button type="button" class="btn btn-secondary" data-action="camera" data-field="${field}">מצלמה</button>
        <button type="button" class="btn btn-secondary" data-action="gallery" data-field="${field}">גלריה</button>
      </div>
      <div class="thumbs">
        ${list
          .map(
            (p) => `
          <div class="thumb" data-photo="${p.id}">
            <img src="${p.dataUrl}" alt="" />
            <button type="button" title="מחק" data-action="del-photo" data-id="${p.id}">×</button>
          </div>`,
          )
          .join('')}
      </div>
    </div>`
}

function completenessBox(): string {
  const c = assessCompleteness(editing, photos)
  return `
    <div class="completeness">
      <strong>מוכנות כוורת → Wave 54: ${c.readyForWave54 ? 'מוכן' : 'חסר'} · ציון ${c.score}</strong>
      <div class="score-bar"><span style="width:${c.score}%"></span></div>
      ${
        c.missingRequired.length
          ? `<div>חובה: <ul>${c.missingRequired.map((x) => `<li>${x}</li>`).join('')}</ul></div>`
          : '<div>כל שדות החובה מלאים.</div>'
      }
      ${
        c.missingRecommended.length
          ? `<div>מומלץ: <ul>${c.missingRecommended.map((x) => `<li>${x}</li>`).join('')}</ul></div>`
          : ''
      }
      ${c.warnings.map((w) => `<div class="meta">${w}</div>`).join('')}
    </div>`
}

async function render() {
  if (screen === 'list') {
    const projects = await listProjects()
    const filtered = projects.filter((p) => {
      const q = search.trim()
      if (!q) return true
      return [p.projectName, p.address, p.surveyor].join(' ').includes(q)
    })

    app.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">BEE</div>
          <div class="brand-text">
            <strong>ברק אלקטריק אנג׳ינירינג</strong>
            <span>Hive Collect · סקר אתר</span>
          </div>
        </div>
      </header>
      <main class="shell">
        <section class="hero-strip">
          <h1>B.E.E · סקר אתר סולארי</h1>
          <p>איסוף שטח לפי מודל הכוורת: Collect → Edit → Dispatch. הפלט נכנס ל־Wave 54 כטיוטה לאישור ברק — לא נשלח ללקוח.</p>
          <div class="hive-pills">
            <span class="hive-pill">collect.site-survey</span>
            <span class="hive-pill">edit.normalize</span>
            <span class="hive-pill">dispatch.draft · Law #2</span>
          </div>
        </section>
        <button class="btn btn-primary btn-block" id="btnNew">+ סקר חדש</button>
        <div class="row">
          <button class="btn btn-secondary" id="btnBackup">גיבוי</button>
          <button class="btn btn-secondary" id="btnRestore">שחזור</button>
        </div>
        <input class="search" id="search" placeholder="חיפוש פרויקט..." value="${escapeAttr(search)}" />
        <div class="project-list">
          ${
            filtered.length === 0
              ? `<div class="empty">אין סקרים עדיין. התחל בסקר חדש מהשטח.</div>`
              : filtered
                  .map(
                    (p, i) => `
            <article class="project-item" style="animation-delay:${i * 40}ms" data-open="${p.id}">
              <h3>${escapeHtml(p.projectName || 'ללא שם')}</h3>
              <div class="meta">
                <span>${escapeHtml(p.surveyDate || '')}</span>
                <span>${escapeHtml(p.surveyor || '')}</span>
                <span>${escapeHtml(p.address || '')}</span>
                <span class="badge ${p.hiveReady ? 'badge-ok' : 'badge-warn'}">${p.hiveReady ? 'מוכן ל־54' : 'טיוטה'}</span>
              </div>
              <div class="item-actions">
                <button class="btn btn-secondary" data-edit="${p.id}">עריכה</button>
                <button class="btn btn-secondary" data-hive="${p.id}">ייצוא כוורת</button>
                <button class="btn btn-secondary" data-pdf="${p.id}">PDF</button>
                <button class="btn btn-danger" data-del="${p.id}">מחק</button>
              </div>
            </article>`,
                  )
                  .join('')
          }
        </div>
      </main>
      <div class="toast" id="toast"></div>`

    document.getElementById('btnNew')?.addEventListener('click', () => {
      editing = emptyProject()
      photos = []
      screen = 'form'
      void render()
    })
    document.getElementById('search')?.addEventListener('input', (e) => {
      search = (e.target as HTMLInputElement).value
      void render()
    })
    document.getElementById('btnBackup')?.addEventListener('click', async () => {
      const data = await exportBackup()
      downloadJson(`bee-survey-backup-${new Date().toISOString().slice(0, 10)}.json`, data)
      toast('הגיבוי הורד')
    })
    document.getElementById('btnRestore')?.addEventListener('click', () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        const data = JSON.parse(await file.text())
        const n = await importBackup(data)
        toast(`שוחזרו ${n} פרויקטים`)
        void render()
      }
      input.click()
    })

    app.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = (btn as HTMLElement).dataset.edit!
        await openEditor(id)
      }),
    )
    app.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = (btn as HTMLElement).dataset.del!
        if (!confirm('למחוק את הסקר?')) return
        await deleteProject(id)
        toast('נמחק')
        void render()
      }),
    )
    app.querySelectorAll('[data-hive]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        await exportHiveFor((btn as HTMLElement).dataset.hive!)
      }),
    )
    app.querySelectorAll('[data-pdf]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        await exportPdfFor((btn as HTMLElement).dataset.pdf!)
      }),
    )
    app.querySelectorAll('[data-open]').forEach((el) =>
      el.addEventListener('click', async () => {
        await openEditor((el as HTMLElement).dataset.open!)
      }),
    )
    return
  }

  if (screen === 'form') {
    const surveyors = await getSurveyors()
    app.innerHTML = `
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">BEE</div>
          <div class="brand-text">
            <strong>סקר אתר</strong>
            <span id="autosave" class="hidden">נשמר אוטומטית ✓</span>
          </div>
        </div>
        <div class="topbar-actions">
          <button class="icon-btn" id="btnBack">חזרה</button>
        </div>
      </header>
      <main class="shell">
        ${completenessBox()}

        <section class="section">
          <h2>פרטים כלליים</h2>
          <p class="hint">Collect — קלט שטח בסיסי</p>
          <div class="field"><label>שם הפרויקט <span class="req">*</span></label><input id="f_projectName" value="${escapeAttr(editing.projectName)}" /></div>
          <div class="grid-2">
            <div class="field"><label>תאריך בדיקה</label><input type="date" id="f_date" value="${escapeAttr(editing.surveyDate)}" /></div>
            <div class="field"><label>שם הסוקר</label><input id="f_surveyor" list="surveyorsList" value="${escapeAttr(editing.surveyor)}" /><datalist id="surveyorsList">${surveyors.map((s) => `<option value="${escapeAttr(s)}"></option>`).join('')}</datalist></div>
          </div>
          <div class="field"><label>כתובת <span class="req">*</span></label><input id="f_address" value="${escapeAttr(editing.address)}" /></div>
          <div class="field"><label>GPS</label><div class="gps-row"><input id="f_gps" value="${escapeAttr(editing.gps)}" placeholder="31.77, 35.21" /><button type="button" class="btn btn-secondary" id="btnGps">GPS</button></div></div>
        </section>

        <section class="section">
          <h2>חשמל ומונים</h2>
          <p class="hint">קלט הנדסי ל־protection / wire_sizing</p>
          <div class="grid-2">
            <div class="field"><label>מפסק ראשי במתקן</label><select id="f_mainBreaker">${options(BREAKER_OPTIONS, editing.mainBreaker)}</select></div>
            <div class="field"><label>מקום בלוח למפסק סולארי</label><select id="f_panelSpace">${options(['כן', 'לא', 'דורש בדיקה'], editing.panelSpace)}</select></div>
            <div class="field"><label>מפסק ראשי סולארי</label><select id="f_solarBreaker">${options(BREAKER_OPTIONS, editing.solarBreaker)}</select></div>
            <div class="field"><label>סוג מונה סולארי</label><select id="f_meterType">${options(['ישיר', 'ארון מניה'], editing.meterType)}</select></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>מספר מונה</label><input id="f_meterNumber" value="${escapeAttr(editing.meterNumber)}" /></div>
            <div class="field"><label>מיקום מונה</label><input id="f_meterLocation" value="${escapeAttr(editing.meterLocation)}" /></div>
          </div>
          <div class="grid-2">
            <div class="field"><label>אורך כבל AC משוער (מ׳)</label><input id="f_cableLength" inputmode="decimal" value="${escapeAttr(editing.cableLengthM)}" /></div>
            <div class="field"><label>מיקום קיר ממירים</label><input id="f_inverterLocation" value="${escapeAttr(editing.inverterLocation)}" /></div>
          </div>
          <div class="field"><label>תוואי כבילה — הערות</label><textarea id="f_cableNotes">${escapeHtml(editing.cableNotes)}</textarea></div>
          ${photoBlock('electricalPanel', true)}
          ${photoBlock('busbars')}
          ${photoBlock('cableRoute')}
        </section>

        <section class="section">
          <h2>גג · גיאומטריה · יעד (Wave 54)</h2>
          <p class="hint">שדות DesignSuiteReq.site / target</p>
          <div class="field"><label>סוג גג <span class="req">*</span></label><select id="f_roofType">${options(['בטון', 'רעפים', 'פנל מבודד', 'איסכורית', 'קרקע', 'אחר'], editing.roofTypeHe)}</select></div>
          <div class="grid-2">
            <div class="field"><label>שטח שימושי (מ״ר)</label><input id="f_usableArea" inputmode="decimal" value="${escapeAttr(editing.usableAreaM2)}" /></div>
            <div class="field"><label>אזימוט (180=דרום)</label><input id="f_azimuth" inputmode="decimal" value="${escapeAttr(editing.azimuthDeg)}" /></div>
            <div class="field"><label>שיפוע (°)</label><input id="f_tilt" inputmode="decimal" value="${escapeAttr(editing.tiltDeg)}" /></div>
            <div class="field"><label>צריכה שנתית kWh</label><input id="f_consumption" inputmode="decimal" value="${escapeAttr(editing.annualConsumptionKwh)}" /></div>
            <div class="field"><label>יעד kWp</label><input id="f_targetKwp" inputmode="decimal" value="${escapeAttr(editing.targetKwp)}" /></div>
            <div class="field"><label>תקציב ₪</label><input id="f_budget" inputmode="decimal" value="${escapeAttr(editing.budgetIls)}" /></div>
          </div>
          <div class="field"><label>העדפת ממיר (צי B.E.E)</label><select id="f_inverterBrand">${options(['SolarEdge', 'KStar', 'ABB', 'Deye'], editing.inverterBrandPref)}</select></div>
          <label class="checkbox-row"><input type="checkbox" id="f_battery" ${editing.includeBattery ? 'checked' : ''}/> לכלול סוללה בתכנון</label>
          ${photoBlock('roof', true)}
          ${photoBlock('siteOverview')}
          ${photoBlock('inverterLocation')}
          ${photoBlock('craneAccess')}
        </section>

        <section class="section">
          <h2>הערות</h2>
          <div class="field"><label>הערות כלליות</label><textarea id="f_generalNotes">${escapeHtml(editing.generalNotes)}</textarea></div>
          <div id="customFields"></div>
          <button type="button" class="btn btn-ghost" id="btnAddCustom">+ הוסף שדה</button>
        </section>
      </main>
      <div class="sticky-actions">
        <button class="btn btn-secondary" id="btnCancel">ביטול</button>
        <button class="btn btn-secondary" id="btnHive">ייצוא כוורת</button>
        <button class="btn btn-primary" id="btnSave">שמור סקר</button>
      </div>
      <div class="toast" id="toast"></div>
      <div id="drawHost"></div>`

    bindFormEvents()
    renderCustomFields()
    return
  }
}

function renderCustomFields() {
  const host = document.getElementById('customFields')
  if (!host) return
  host.innerHTML = editing.customFields
    .map(
      (f, idx) => `
    <div class="grid-2" data-cf="${f.id}">
      <div class="field"><label>תווית</label><input data-cf-label="${idx}" value="${escapeAttr(f.label)}" /></div>
      <div class="field"><label>ערך</label><div class="gps-row"><input data-cf-value="${idx}" value="${escapeAttr(f.value)}" /><button type="button" class="btn btn-danger" data-cf-del="${idx}">×</button></div></div>
    </div>`,
    )
    .join('')

  host.querySelectorAll('[data-cf-label]').forEach((el) =>
    el.addEventListener('input', () => {
      const i = Number((el as HTMLElement).dataset.cfLabel)
      editing.customFields[i]!.label = (el as HTMLInputElement).value
      scheduleAutoSave()
    }),
  )
  host.querySelectorAll('[data-cf-value]').forEach((el) =>
    el.addEventListener('input', () => {
      const i = Number((el as HTMLElement).dataset.cfValue)
      editing.customFields[i]!.value = (el as HTMLInputElement).value
      scheduleAutoSave()
    }),
  )
  host.querySelectorAll('[data-cf-del]').forEach((el) =>
    el.addEventListener('click', () => {
      const i = Number((el as HTMLElement).dataset.cfDel)
      editing.customFields.splice(i, 1)
      renderCustomFields()
      scheduleAutoSave()
    }),
  )
}

function bindFormEvents() {
  document.getElementById('btnBack')?.addEventListener('click', async () => {
    readFormIntoEditing()
    if (editing.projectName.trim()) await persistCurrent()
    screen = 'list'
    void render()
  })
  document.getElementById('btnCancel')?.addEventListener('click', () => {
    screen = 'list'
    void render()
  })
  document.getElementById('btnSave')?.addEventListener('click', async () => {
    readFormIntoEditing()
    if (!editing.projectName.trim()) {
      toast('חובה שם פרויקט')
      return
    }
    await persistCurrent()
    toast('הסקר נשמר')
    screen = 'list'
    void render()
  })
  document.getElementById('btnHive')?.addEventListener('click', async () => {
    readFormIntoEditing()
    await persistCurrent()
    const bundle = buildHiveExportBundle(editing, photos)
    downloadJson(`hive-site-survey-${editing.id.slice(0, 8)}.json`, bundle)
    toast(bundle.jobs.length === 3 ? 'ייצוא כוורת מלא' : 'ייצוא חלקי — חסרים שדות')
  })
  document.getElementById('btnGps')?.addEventListener('click', async () => {
    try {
      const g = await getCurrentGps()
      editing.gps = g.gps
      editing.lat = g.lat
      editing.lon = g.lon
      const input = document.getElementById('f_gps') as HTMLInputElement
      input.value = g.gps
      toast('GPS נקלט')
      scheduleAutoSave()
    } catch {
      toast('לא הצלחתי לקבל GPS')
    }
  })
  document.getElementById('btnAddCustom')?.addEventListener('click', () => {
    const field: CustomField = {
      id: crypto.randomUUID(),
      section: 'notes',
      label: '',
      value: '',
    }
    editing.customFields.push(field)
    renderCustomFields()
  })

  app.querySelectorAll('input, select, textarea').forEach((el) => {
    el.addEventListener('change', () => {
      readFormIntoEditing()
      scheduleAutoSave()
      // refresh completeness without full remount of photos handlers complexity — soft update
      const box = app.querySelector('.completeness')
      if (box) box.outerHTML = completenessBox()
    })
    el.addEventListener('input', () => {
      readFormIntoEditing()
      scheduleAutoSave()
    })
  })

  app.querySelectorAll('[data-action="camera"], [data-action="gallery"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = (btn as HTMLElement).dataset.field as PhotoFieldKey
      const camera = (btn as HTMLElement).dataset.action === 'camera'
      pickFiles(field, camera)
    })
  })

  app.querySelectorAll('[data-action="del-photo"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = (btn as HTMLElement).dataset.id!
      await deletePhoto(id)
      photos = photos.filter((p) => p.id !== id)
      readFormIntoEditing()
      await render()
    })
  })

  app.querySelectorAll('.thumb img').forEach((img) => {
    img.addEventListener('click', () => {
      const id = (img.closest('.thumb') as HTMLElement).dataset.photo!
      const ph = photos.find((p) => p.id === id)
      if (ph) openDrawEditor(ph)
    })
  })
}

function pickFiles(field: PhotoFieldKey, camera: boolean) {
  const existing = photos.filter((p) => p.field === field).length
  if (existing >= 10) {
    toast('מקסימום 10 תמונות לשדה')
    return
  }
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.multiple = !camera
  if (camera) input.setAttribute('capture', 'environment')
  input.onchange = async () => {
    const files = [...(input.files ?? [])].slice(0, 10 - existing)
    for (const file of files) {
      const base = await fileToSurveyPhoto(file, field)
      const stored: StoredPhoto = { ...base, projectId: editing.id }
      await savePhoto(stored)
      photos.push(stored)
    }
    readFormIntoEditing()
    await persistCurrent()
    await render()
    toast('תמונות נוספו')
  }
  input.click()
}

function openDrawEditor(photo: StoredPhoto) {
  drawTarget = photo
  const host = document.getElementById('drawHost')
  if (!host) return
  host.innerHTML = `
    <div class="draw-modal">
      <div class="draw-toolbar">
        <button type="button" data-tool="pen" class="active">קו</button>
        <button type="button" data-tool="text">טקסט</button>
        <button type="button" id="drawUndo">בטל</button>
        <button type="button" id="drawClear">נקה</button>
        <button type="button" id="drawClose">סגור</button>
        <button type="button" id="drawSave">שמור</button>
      </div>
      <div class="draw-canvas-wrap"><canvas id="drawCanvas"></canvas></div>
    </div>`

  const canvas = document.getElementById('drawCanvas') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')!
  const img = new Image()
  const history: ImageData[] = []
  let tool: 'pen' | 'text' = 'pen'
  let drawing = false

  img.onload = () => {
    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0)
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
  }
  img.src = photo.dataUrl

  host.querySelectorAll('[data-tool]').forEach((b) =>
    b.addEventListener('click', () => {
      host.querySelectorAll('[data-tool]').forEach((x) => x.classList.remove('active'))
      b.classList.add('active')
      tool = (b as HTMLElement).dataset.tool as 'pen' | 'text'
    }),
  )

  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e)
    if (tool === 'text') {
      const t = prompt('טקסט לסימון')
      if (!t) return
      ctx.fillStyle = '#f0c14b'
      ctx.font = `${Math.max(24, canvas.width * 0.03)}px Heebo, Arial`
      ctx.fillText(t, p.x, p.y)
      history.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
      return
    }
    drawing = true
    ctx.strokeStyle = '#f0c14b'
    ctx.lineWidth = Math.max(3, canvas.width * 0.004)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  })
  canvas.addEventListener('pointerup', () => {
    if (!drawing) return
    drawing = false
    history.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
  })

  document.getElementById('drawUndo')?.addEventListener('click', () => {
    if (history.length <= 1) return
    history.pop()
    ctx.putImageData(history[history.length - 1]!, 0, 0)
  })
  document.getElementById('drawClear')?.addEventListener('click', () => {
    if (!history.length) return
    ctx.putImageData(history[0]!, 0, 0)
    history.length = 1
  })
  document.getElementById('drawClose')?.addEventListener('click', () => {
    host.innerHTML = ''
    drawTarget = null
  })
  document.getElementById('drawSave')?.addEventListener('click', async () => {
    if (!drawTarget) return
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    drawTarget.dataUrl = dataUrl
    drawTarget.annotated = true
    drawTarget.mimeType = 'image/jpeg'
    await savePhoto(drawTarget)
    host.innerHTML = ''
    drawTarget = null
    toast('סימון נשמר')
    await render()
  })
}

async function openEditor(id: string) {
  const p = await getProject(id)
  if (!p) return
  editing = p
  photos = await listPhotos(id)
  screen = 'form'
  await render()
}

async function exportHiveFor(id: string) {
  const p = await getProject(id)
  if (!p) return
  const ph = await listPhotos(id)
  const bundle = buildHiveExportBundle(p, ph)
  downloadJson(`hive-site-survey-${id.slice(0, 8)}.json`, bundle)
  toast(bundle.jobs.some((j) => j.loop === 'dispatch.draft') ? 'ייצוא כוורת מלא' : 'ייצוא חלקי')
}

async function exportPdfFor(id: string) {
  const p = await getProject(id)
  if (!p) return
  const ph = await listPhotos(id)
  const c = assessCompleteness(p, ph)
  toast('מכין PDF...')
  const blob = await buildSurveyPdf(p, ph, c)
  downloadBlob(blob, `bee-survey-${(p.projectName || id).replace(/\s+/g, '_')}.pdf`)
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

void render()
