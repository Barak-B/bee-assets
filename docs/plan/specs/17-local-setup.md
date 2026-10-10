# 17 — עבודה מהמחשב המקומי: סביבה, Claude Code, staging ובטיחות נתונים

| | |
|---|---|
| גרסה | 0.1 — טיוטה (2026-10-10) |
| מקור | handoff bee-live (23.09.2026) §2–§6; HANDOFF ספריית בלוקים; תוכנית האב §4.2, §15, §16; `research/05-crm-workflow.md` §8–§9; מפרט 16 |
| קהל | ברק ונרי, על מחשב Windows עם Git Bash ו-Claude Code; כל סשן Claude Code מקומי (דרך הסקיל `bee-engine`, מפרט 18) |
| כלל | אין סודות במסמך זה. שמות משתני סביבה בלבד; ערכים ב-`.env` מקומי (לא ב-git) ובסודות השרת |

---

## A. מאגרים ותיקיות

### A.1 מפת תיקיות מומלצת (Windows)

| נתיב | מה | מקור / הערות |
|---|---|---|
| `E:\bee-live` | **הקו החי** — קלון של `BarakElectric/B.E.E` (`origin/main` של נרי). כל קוד המנוע נכנס לכאן (`server/src/modules/*`, `packages/*`, `apps/*`, `services/*`, `workers/*`, `ops/*`) | handoff §1; תוכנית האב §4.2 |
| `E:\bee-assets` | קלון של מאגר התכנון (זה): `docs/plan/**`, `apps/bee-solar-survey`, `platform/schema` | מקור האמת של חבילת התכנון |
| `E:\bee-live\docs\engine-plan\` | **עותק מסונכרן** של `E:\bee-assets\docs\plan\` (ראו A.2) — כדי שסשן Claude Code שפתוח על bee-live יראה את המפרטים בלי לצאת מהמאגר | לא submodule, לא junction (ראו D) |
| `E:\bee-build` | הקו הישן (SQLite) עם מחולל הדוחות ב-`merge/neri-phase1`. **קריאה בלבד** עד הפורט ב-M5 (WP-M5-05). לא להריץ ממנו שרת במקביל על אותם פורטים | handoff §2, §3 |
| `E:\bee-status\` | קבצי סטטוס של משימות ה-PC (`jobs.json`, `prod-alert-pending.txt`) | handoff §3 |
| `E:\bee-cad\` (חדש) | עבודה של ה-worker: `jobs\`, `out\`, `logs\`, `cad-worker.log` | מפרט 15, B.6 |
| `C:\Users\<user>\.claude\skills\` | סקילים של Claude Code: `electrical-drawing-sets\` (כולל `generator\eplan-generator.zip`), `bee-block-library\`, `bee-engine\` (חדש, מפרט 18) | HANDOFF ספריית בלוקים §1 |
| `C:\Users\<user>\.claude\projects\...\memory\` | זיכרון פרויקט של Claude Code (`project_bee_live_control.md` וכו') | handoff §4 |
| `E:\bee-live\services\cad\eplan\` | **eplan vendored**: תוכן ה-zip (113 קבצים, Python ≥3.11) כחבילה בתוך השירות. הסקיל נשאר ב-`.claude\skills` ל"שיטת העבודה"; הקוד חי במאגר | WP-M4-01 |
| `E:\bee-live\workers\cad-windows\blocks\` | עותק של `bee-block-library\{blocks,dynamic,index.json}` (או משתנה `BEE_BLOCK_LIBRARY_DIR` שמצביע על תיקיית הסקיל) | WP-M4-06 |

> **עברית בנתיבים:** להימנע לחלוטין מנתיבים עם תווים עבריים לכל דבר שעובר דרך Git Bash / כלי CLI (ראו D.2). קבצי לקוח עם שמות עבריים נשמרים ב-R2/MinIO עם key אנגלי (uuid) ושם מקורי בשדה `original_name`.

### A.2 סנכרון חבילת התכנון ל-bee-live

מומלץ **העתקה חד-כיוונית** (bee-assets → bee-live) בסקריפט קטן, לא junction (נכשל ב-Git Bash לפי ה-handoff) ולא submodule (מסרבל את `deploy.sh`):

```powershell
# E:\bee-live\scripts\sync-plan.ps1  (PowerShell, לא Bash — בגלל backslashes)
robocopy E:\bee-assets\docs\plan E:\bee-live\docs\engine-plan /MIR /XD .git
```

- מריצים אחרי כל `git pull` ב-bee-assets. ב-`E:\bee-live\docs\engine-plan\README.md` כותבים: "עותק; מקור האמת ב-bee-assets, commit `<sha>`".
- ה-`.gitignore` של bee-live: **לא** להתעלם מהתיקייה — רוצים שהמפרטים יהיו בקוד (ל-PR review ול-CI). חריג: אם המאגר הציבורי `bee-assets` יכיל בעתיד מידע רגיש — לעבור ל-submodule פרטי.

### A.3 ענפים ונקודת מוצא

- `main` = מה שמותקן ב-prod (handoff: `main` = מותקן + ops). עבודה רק בענפי feature (ראו C.4).
- לפני כל חבילת עבודה: `git fetch && git switch main && git pull --ff-only`, ואז ענף חדש. בלי worktrees אלא אם חייבים (ראו D.3).

---

## B. סביבת פיתוח

### B.1 גרסאות כלים

| כלי | גרסה | הערה |
|---|---|---|
| Node | **לפי `engines` ב-`E:\bee-live\package.json`** (לנעול עם `.nvmrc`/volta אם אין) | לא לנחש; ה-CI משתמש באותה גרסה |
| מנהל חבילות | **לפי `packageManager` ב-package.json** — כיום ה-handoff מתאר `npm install`; אם המונורפו עובר ל-pnpm workspaces (מומלץ עם `services/` ו-`apps/` מרובים) — להצהיר ב-README ולעדכן `deploy.sh` | WP-M0-01 |
| Python | ≥ 3.11 (eplan); `py -3.11` ב-Windows, venv ב-`services\cad\.venv` | מקומי רק ל-worker ולבדיקות; השירות רץ ב-Docker |
| Docker Desktop | עדכני, WSL2 backend | ל-postgres/minio/docgen/cad מקומיים |
| Git Bash | מגיע עם Git for Windows | טרמינל של Claude Code |
| gh CLI | עדכני; `gh auth status`; scope `workflow` אם נוגעים ב-`.github/workflows` (D.6) | |
| GstarCAD 2027 | רישיון המשרד/הקונסטרוקטור (§17(3) בתוכנית האב; V19) | רק על מחשב ה-worker |

### B.2 Postgres מקומי / רפליקה

שתי אפשרויות, לפי החבילה:

1. **DB מקומי ריק (ברירת מחדל לפיתוח):** `docker compose -f docker-compose.dev.yml up postgres` → `DATABASE_URL=postgres://bee:<pw>@localhost:5433/bee_dev`. migrations + seed (rules, stages, calendar, demo data מוסווה). **כאן כותבים טסטים.**
2. **עותק של staging (לבדיקות על נתונים אמיתיים):** `refresh-staging-db.sh` מרענן את bee-lab מגיבוי prod עם ניקוי credentials; מקומית — `pg_dump` **מ-bee-lab** (לא מ-prod) ל-`bee_lab_copy`. ה-handoff מזכיר `.env` מקומי עם "רפליקה" — לוודא שזו רפליקה לקריאה / עותק ולא חיבור ל-prod (ראו F).

pg-boss משתמש **באותו Postgres** (schema `pgboss`) — אין Redis, אין שירות נוסף.

### B.3 משתני סביבה (שמות בלבד; ערכים ב-`server/.env`, לא ב-git)

**קיימים ב-bee-live (לפי ה-handoff):**
`DATABASE_URL` · `PORT` (מקומי 3021) · `JWT_SECRET` (**≥ 32 תווים; מומלץ 64** — אחרת השרת מת בשקט, D.4) · `BEE_BACKGROUND_WORKERS` (`off` מקומית) · `API_PROXY_TARGET` (ל-Vite) · `SOLAREDGE_API_VERSION` · `PUPPETEER_SKIP_DOWNLOAD` (=1 בהתקנה מקומית אם לא מריצים docgen מקומית).

**חדשים למנוע (מוצעים; שם סופי במפרט 10/13/15):**

| קבוצה | שמות |
|---|---|
| דגלים | `BEE_FEATURES` (רשימה: `projects,documents,jobs,rules,calendar,surveys,catalog,pricing,quotes,docgen,comms,submissions,design,cad,scheduling,procurement,field,inspections,handover,om,portal,ai`) · `BEE_ENGINE_WORKERS` (worker של pg-boss למנוע, נפרד מהניטור) |
| אחסון | `S3_ENDPOINT` · `S3_REGION` · `S3_BUCKET` · `S3_ACCESS_KEY_ID` · `S3_SECRET_ACCESS_KEY` · `S3_FORCE_PATH_STYLE` (MinIO=true, R2=false) · `DOCS_PRESIGN_TTL_SECONDS` |
| שירותים פנימיים | `DOCGEN_URL` (`http://docgen:3031`) · `CAD_SERVICE_URL` (`http://cad:3041`) · `PGBOSS_SCHEMA` (`pgboss`) |
| worker Windows | `CAD_WORKER_TOKEN` (שרת: `CAD_WORKER_TOKENS`) · `CAD_API_BASE` (`https://…/api` דרך Tailscale) · `BEE_BLOCK_LIBRARY_DIR` · `GSTARCAD_EXE` · `CAD_CTB_PATH` · `CAD_WORK_DIR` (`E:\bee-cad`) |
| תקשורת | `META_WA_ACCESS_TOKEN` · `META_WA_PHONE_NUMBER_ID` · `META_WA_VERIFY_TOKEN` · `SMS_PROVIDER` (`inforu|019`) · `SMS_API_KEY` · `SMS_SENDER` · `EMAIL_PROVIDER` · `EMAIL_API_KEY` · `EMAIL_FROM_DOMAIN` |
| הנה"ח/תשלום | `MORNING_CLIENT_ID` · `MORNING_CLIENT_SECRET` · `PAYMENT_PROVIDER` (`grow|cardcom`) · `PAYMENT_API_KEY` · `PAYMENT_WEBHOOK_SECRET` |
| Google | `GOOGLE_OAUTH_CLIENT_ID` · `GOOGLE_OAUTH_CLIENT_SECRET` · `GOOGLE_CALENDAR_IDS` · `GOOGLE_WEBHOOK_URL` |
| AI | `ANTHROPIC_API_KEY` · `AI_COST_TIER_MAX` · `AI_PII_REDACT` (=1 תמיד ב-dev) |
| ops | `GLITCHTIP_DSN` · `UPTIME_KUMA_PUSH_URL_<name>` · `WALG_S3_PREFIX` (+ credentials של B2) |
| מפות/תפוקה | `MAPTILER_KEY` (אופציונלי) · `PVGIS_CACHE_DIR` · `GOOGLE_SOLAR_API_KEY` (רק אחרי V15) |

כלל: **לכל משתנה חדש** מוסיפים שורה ל-`server/.env.example` ול-`ops/staging/.env.example` עם ערך דמה, באותו PR.

### B.4 מוסכמת פורטים

| מה | מקומי | הערה |
|---|---|---|
| bee-live server (tsx watch) | **3021** | מה-handoff; לא 3001 (תפוס ע"י bee-build של הסשן המקביל) |
| bee-live web (Vite) | **3011** | `API_PROXY_TARGET=http://localhost:3021`; לא 5173 |
| docgen | 3031 | רק ברשת docker; מקומית לחשיפה לבדיקות |
| cad (python) | 3041 | |
| postgres (docker dev) | 5433 | 5432 נשאר להתקנה מקומית אם קיימת |
| minio | 9000 (API) / 9001 (console) | |
| n8n (אופציונלי) | 5678 | |
| GlitchTip (staging בלבד) | 8000 | |
| bee-build (הקו הישן, לא לגעת) | 3001 / 5173 | handoff |
| staging bee-lab | `http://100.90.97.36:8080` (Tailscale) | handoff |
| prod Caddy | קשור ל-`100.90.97.36:80` בלבד + Cloudflare tunnel; `/status/*` Tailscale-only | handoff |

לפני הרצה: `netstat -ano | findstr :3021` (PowerShell) — פורט תפוס = שרת אחר, לא "השרת שלי עלה" (D.5).

### B.5 Docker Compose — שירותים להוספה

קובץ `docker-compose.dev.yml` (dev) + הרחבת `ops/staging/docker-compose.yml` ו-`/srv/bee/docker-compose.yml` (prod) באותו דפוס:

| שירות | image/בנייה | הערות |
|---|---|---|
| `postgres` | postgres 16 (לפי הקיים) | `PGDATA=/var/lib/postgresql/data/pgdata` (לקח מה-handoff); pg-boss באותו DB |
| `minio` | minio/minio (dev/staging בלבד; prod = R2) | bucket `bee-docs`, versioning on; `mc` ליצירת bucket ב-init |
| `docgen` | `services/docgen/Dockerfile`: Node + Chromium (Puppeteer/Playwright image) + **גופנים** Rubik, Noto Sans Hebrew, Noto Color Emoji + LibreOffice headless + python3-pypdf | `mem_limit` (למשל 1.5g); `shm_size: 1g` ל-Chromium; לא חשוף החוצה |
| `cad` | `services/cad/Dockerfile`: python 3.11 + eplan + pvlib + shapely + ezdxf + PyMuPDF + python-bidi + גופנים (Rubik, heb.shx) | `mem_limit`; volume ל-`PVGIS_CACHE_DIR` |
| `n8n` | n8nio/n8n (אופציונלי, קצוות: webhooks Meta/Gmail) | prod בלבד אם מחליטים |
| `glitchtip` + `glitchtip-worker` + `redis` | staging/prod | WP-M0-12; 4 קונטיינרים |
| `uptime-kuma` | louislam/uptime-kuma:2 | push monitors: pg-boss heartbeat, cad worker |
| `walg` (sidecar) / cron ב-host | WAL-G → B2 | WP-M0-12 |

Caddy: route חדש לכל אפליקציה (`apps/portal` → `portal.…`), ותמיד `handle_path` כשמורידים קידומת (D.8). השירותים הפנימיים (docgen/cad) **לא** מקבלים route.

### B.6 התקנת worker ה-CAD על Windows (מחשב המשרד)

(פירוט מלא במפרט 15; כאן צעדי ההתקנה.)

1. **רישיון ו-API:** GstarCAD 2027 מותקן ומופעל (מי מחזיק רישיון — §17(3) בתוכנית האב). לבדוק איזה API זמין: .NET (`NETLOAD` של DLL שלנו) או Python (GstarCAD Python API / `cad-pyrx`) — **V19, לא אומת**. להתחיל בבדיקה ידנית של 5 דקות: INSERT בלוק דינמי מ-`bee-block-library\dynamic\_test_in_autocad\…` ולראות גריפ visibility (HANDOFF §3).
2. **חשבון ייעודי:** משתמש Windows מקומי `bee-cad` (לא admin), עם GstarCAD מופעל בפרופיל שלו; תיקיות `E:\bee-cad\{jobs,out,logs}` עם הרשאות לאותו משתמש.
3. **Python:** `py -3.11 -m venv E:\bee-cad\.venv` → `pip install -r E:\bee-live\workers\cad-windows\requirements.txt` (requests, ezdxf, pywin32/comtypes אם COM).
4. **קונפיג:** `E:\bee-cad\worker.env` (לא ב-git): `CAD_API_BASE`, `CAD_WORKER_TOKEN`, `GSTARCAD_EXE`, `BEE_BLOCK_LIBRARY_DIR`, `CAD_CTB_PATH`, `CAD_WORK_DIR`, `UPTIME_KUMA_PUSH_URL_cad`.
5. **רשת:** המחשב ב-Tailscale (כמו הגישה ל-`/status/*`); ה-API של התור (`/api/cad-jobs/*`) חשוף רק ל-Tailscale ב-Caddy, לא דרך Cloudflare.
6. **Pull queue:** `poller.py` כל 30 שניות: `GET /cad-jobs/next` → הורדת DXF+JSON → הרצה → `POST /cad-jobs/:id/result` (DWG, PDF, לוג, sha256) → heartbeat. כשלון = `POST …/fail` + retry עד 3 → DLQ.
7. **כשירות:** Task Scheduler — "At log on" של `bee-cad`, "Run whether user is logged on or not" **לא** (GstarCAD צריך desktop session) → השארת המשתמש מחובר עם auto-logon + נעילת מסך, או שימוש ב-`accoreconsole`-דומה אם GstarCAD מציע (לאימות). רישום כמו `BEE Prod Alert` ב-`E:\bee-status\jobs.json` (handoff) — **לכתוב JSON דרך Write/PowerShell, לא heredoc** (D.1).
8. **בדיקה:** job בדיקה מ-bee-lab (`cad-jobs/test`) → DWG נפתח ב-GstarCAD, בלוק דינמי פעיל, PDF לפי CTB; Kuma מראה heartbeat.

---

## C. עבודה עם Claude Code מקומית

### C.1 תוספות ל-`E:\bee-live\CLAUDE.md` (כללי קבע)

להוסיף בלוק (הטקסט מוכן להעתקה; לשמור דרך Write):

```markdown
## B.E.E Engine — כללי קבע לסשנים
- תשובות בעברית, מזהים באנגלית. כל תשובה מסתיימת ב-STATUS / RESULT / NEXT.
- חבילת התכנון: docs/engine-plan/ (עותק של bee-assets/docs/plan). קריאה לפני קוד: 00-master-plan.md §2, §4.2, §5; specs/16-execution-plan.md (חבילת העבודה הנוכחית); המפרט הרלוונטי (10–15).
- סשן = חבילת עבודה אחת (WP-M<n>-<nn>). לא מתחילים חבילה אחרת בלי לסגור PR.
- שער אמון: אין קוד ששולח ללקוח/ספק בלי approvals.decided_by. אין "שליחה לבדיקה" אמיתית מסביבת dev.
- כל מספר/סף/תעריף/SLA נכנס לטבלה עם source + verification; unverified מסומן "לאימות". אין קבועים עסקיים בקוד.
- טסטים לפני push: npm test ירוק מקומית; חבילת shared-schemas נבנית (npm run build:schemas); bundle budget של apps/web לא נשבר.
- מכונת מצבים: רק דרך transition(); שלבים S01–S12 לפי docs/engine-plan/01-lifecycle-stages.json.
- מסמכים לעולם לא נמחקים; גרסאות שנשלחו/נחתמו נעולות.
- קבצים עם backslashes / JSON / עברית: Write tool, לא heredoc. נתיבים עבריים לא עוברים דרך Bash.
- אין נגיעה ב-prod DB; staging = bee-lab בלבד; PII לא נכנס ל-fixtures.
- פורטים: server 3021, web 3011 (לא 3001/5173). JWT_SECRET ≥ 32 תווים.
- לפני סיום: עדכון docs/ (runbook/dev-local) אם השתנה משהו תפעולי; gh pr view --json state לאימות מצב PR.
```

### C.2 סקילים להתקנה ב-`C:\Users\<user>\.claude\skills\`

| סקיל | תפקיד | מקור |
|---|---|---|
| `electrical-drawing-sets` | שיטת העבודה לתכנון, כללי משרד, מפרט YAML, מחולל eplan (zip) | קיים |
| `bee-block-library` | 186 בלוקים + דינמיים + index.json; הרכבת ארונות | HANDOFF; `pip install ezdxf` |
| `bee-engine` (**חדש**) | מצביע על `docs/engine-plan` (או `E:\bee-assets\docs\plan`), סדר קריאה, מוסכמות, DoD, פורמט תשובה | מפרט 18 — להעתיק כ-`bee-engine\SKILL.md` |

אימות: לפתוח Claude Code ב-`E:\bee-live`, להקליד `/` ולחפש `bee-engine`.

### C.3 סשן = חבילת עבודה אחת

1. **פתיחה:** `claude` ב-`E:\bee-live`; הודעה ראשונה: "השתמש ב-bee-engine. חבילת העבודה: WP-M0-03. קרא את המפרט הרלוונטי והצג תוכנית לפני קוד." (הסקיל מגדיר את סדר הקריאה.)
2. **תוכנית:** Claude מציג: קבצים שייגעו, טבלאות, טסטים, מה לא בהיקף. **מאשרים** לפני קוד (plan mode).
3. **קוד + טסטים** בענף (C.4). Claude מריץ `npm test` ו-`build:schemas` מקומית.
4. **PR:** Claude פותח PR עם תבנית (C.4), מחכה ל-CI (לולאת המתנה — `gh pr checks` חוזר מיד עם "no checks reported" אם ה-CI טרם נרשם; D.7), ולא ממזג בלי אישור.
5. **סיום:** STATUS/RESULT/NEXT + רשימת החלטות פתוחות למפרטים. **לא** מתחילים WP נוסף באותו סשן (הקשר מתבלבל; handoff מעיד).
6. **אם נתקעים:** לרשום ב-`docs/engine-plan/specs/<nn>` הערת "אי-התאמה" או שאלה לברק — לא לנחש ערך עסקי.

### C.4 ענפים, קומיטים ו-PR

- ענף: `feat/m0-wp03-state-machine` · `fix/…` · `ops/…` · `docs/…`.
- קומיט: `feat(projects): transition() with exit-condition guards (WP-M0-03)`; הודעות באנגלית; גוף יכול להיות בעברית.
- PR title: `M0-WP03: state machine from lifecycle JSON`; PR body: מטרה · מפרט/סעיף · מה נבדק (פקודות) · flags · migration? · PII? · screenshots ל-UI · "DoD items touched".
- CI חייב ירוק; review של האדם השני (נרי↔ברק) לכל PR שנוגע ב-DB/ops/שער אמון; PR של UI בלבד — self-merge מותר אחרי CI.
- מיזוג: squash; אחרי `gh pr merge` **תמיד** `gh pr view --json state,mergedAt` (D.7).
- אין push ישיר ל-`main`; אין `--force`.

---

## D. מלכודות ידועות (מה-handoffs)

| # | מלכודת | מה קורה | מה עושים |
|---|---|---|---|
| D.1 | **heredoc ב-Bash tool בולע backslashes** | `"\\n"` הופך ל-newline; `E:\bee-*` → `E:<BS>ee-*` (נכנס פעמיים ל-`jobs.json`) | קבצים/JSON/PowerShell/נתיבי Windows — **Write tool** או קובץ `.py`/`.ps1` שנכתב ב-Write; ב-Bash לנתיבים להשתמש ב-`/e/bee-live/...` |
| D.2 | **נתיבים עבריים ב-Git Bash** | `pdftotext` נכשל (`L:/?????...`); `sys.argv` בעברית נשבר | PyMuPDF (`fitz`) עם הנתיב כליטרל בתוך קובץ Python; להימנע מנתיבים עבריים בכלל (A.1) |
| D.3 | **worktree + `npm install`** | junction (`cmd //c mklink /J`) נכשל מ-Git Bash; worktree דורש `node_modules` משלו (~3 דק') | `npm install --prefer-offline` עם `PUPPETEER_SKIP_DOWNLOAD=1`; עדיף ענף רגיל במקום worktree |
| D.4 | **`JWT_SECRET` קצר מ-32** | השרת מת בשקט, לוג ריק; נראה כאילו "עלה" כי פורט אחר ענה | סוד באורך 64 ב-`.env`; smoke: `curl localhost:3021/health` |
| D.5 | **התנגשות פורטים** | 3001/5173 של bee-build (סשן מקביל) נראים כמו השרת שלך | 3011/3021; `netstat -ano | findstr :<port>` לפני "עלה" |
| D.6 | **`gh` ללא scope `workflow`** | push עם שינוי ב-`.github/workflows/*` נדחה | `gh auth refresh -h github.com -s workflow`; או להפריד שינוי CI ל-PR נפרד |
| D.7 | **`gh pr merge` "הצליח" אבל ה-PR פתוח** | הודעת "To use administrator privileges…" + echo מטעה; `gh pr checks --watch` חוזר מיד ב-"no checks reported" | `gh pr view --json state`; לולאת המתנה ל-checks לפני `--watch` |
| D.8 | **Caddy `handle` מול `handle_path`** | `handle /status/*` לא מוריד קידומת → 404 | `handle_path`; `docker exec … caddy reload` לא תמיד מחיל → `docker compose restart caddy` |
| D.9 | **`rsync` לא קיים ב-PC** | `install-ops.sh` נכשל | `scp` (כבר ב-`install-ops.sh`) |
| D.10 | **`@bee/shared-schemas` כמקור TS** | `ERR_MODULE_NOT_FOUND …/index.js`, `ERR_PACKAGE_PATH_NOT_EXPORTED` | החבילה נבנית ל-`dist` (`npm run build:schemas`); טסטים `.mts`; `apps/web` מייבא תת-נתיבים (bundle budget) |
| D.11 | **Chromium לא נסגר בטסט PDF** | טסט "עובר" אבל התהליך תקוע 5 דק' | `closeBrowserPool()` ב-`after()` + `onClose` של Fastify; ב-docgen — pool עם timeout |
| D.12 | **staging compose** | `container name already in use` (פרויקט אחר); `initdb: directory exists` (volume ישן); Caddy בלי `http://` → auto-TLS; dump עם `GRANT … n8n_reader` | `-p <project>`; `PGDATA=…/pgdata`; `http://100.90.97.36:8080 {`; ליצור role לפני restore; `source.old-*` + clone נקי על "dubious ownership" |
| D.13 | **`healthcheck.sh` על `127.0.0.1:80`** | Caddy קשור ל-Tailscale IP בלבד → כל deploy מתגלגל אחורה | הכתובת הנכונה כבר ב-ops; לא לשנות |
| D.14 | **WebFetch לאתרי docs של ספקים** | מחזיר כותרת בלבד (JS app) | firecrawl/קוד קהילתי; לסמן "לא אומת" |
| D.15 | **killing תהליך `tsx watch` של סשן אחר** | ה-watch לא חוזר לבד | לא לגעת בתהליכים של `E:\bee-build`; אם קרה — להפעיל ידנית ולתעד |
| D.16 | **"Foreign DWG" ב-GstarCAD/AutoCAD** | קבצי ODA מציגים אזהרה | "Continue"/"Always open" — תקין (HANDOFF) |

---

## E. לולאת staging/deploy לכל אבן דרך

(משתמשת אך ורק בסקריפטים הקיימים ב-`E:\bee-live\ops\` — handoff §3.)

```
ענף → PR → CI ירוק → review → squash-merge ל-main
   │
   ▼
ops/staging/deploy-staging.sh           # bee-lab: bee-lab-{postgres,server,caddy}(+docgen,cad,minio)
ops/staging/refresh-staging-db.sh       # DB = גיבוי prod עדכני, credentials מנוקים, workers off
BEE_FEATURES=<flags של אבן הדרך> ב-/srv/bee-lab/.env   # דולק רק ב-staging
   │
   ▼  ברק עובר על ה-DoD של אבן הדרך (מפרט 16) על bee-lab; תרחיש אמיתי (מוסווה); חותם ב-PR/issue "M<n> approved"
   │
   ▼
ops/prod/deploy.sh                      # גיבוי + תיוג sha + שער בריאות + rollback אוטומטי על כשל
   (BEE_FEATURES ב-prod: כבוי, או דולק ל-role=owner בלבד לפיילוט)
ops/prod/canary.sh                      # cron */10 — לעקוב 24–48 שעות; "stale-sites" בלילה = תקין
ops/prod/healthcheck.sh · morning-report.sh
   │
   ▼  תקלה → ops/prod/rollback.sh (deploys.log) ; GlitchTip לשגיאות ; Kuma לזמינות
   │
   ▼  אחרי שבוע ירוק: הדלקת ה-flag לכל התפקידים ב-prod (PR קטן ב-.env/טבלת flags) → אבן הדרך "ב-prod"
```

כללים:
- **migrations** רצות ב-`deploy.sh` לפני החלפת הקונטיינר, תמיד **אחורה-תואמות** (expand/contract): עמודה חדשה nullable → קוד → ניקוי ב-PR הבא. ככה rollback לא דורש migration down.
- **שירותים חדשים (docgen/cad/minio)** נכנסים ל-compose של staging קודם, ול-prod רק עם `mem_limit` ובדיקת RAM.
- **worker Windows** מצביע ל-bee-lab עד שאבן הדרך מאושרת, ואז ל-prod (שני `worker.env`).
- **לוג deploy:** `deploys.log` + שורה ב-`docs/ops-runbook.md` (קיים) לכל אבן דרך: sha, flags, תאריך, מי אישר.

---

## F. בטיחות נתונים

1. **לעולם לא בודקים על prod DB.** אין `DATABASE_URL` של prod ב-`.env` מקומי. אם יש צורך בנתונים אמיתיים — `refresh-staging-db.sh` ל-bee-lab, ו-`pg_dump` **מ-bee-lab** לעותק מקומי. גם "רפליקה" לקריאה — רק אם היא read-only ברמת ה-role.
2. **credentials של אינטגרציות** (SolarEdge/Sungrow/Meta/Morning) מנוקים ב-staging (הסקריפט כבר עושה זאת) ולעולם לא בעותק מקומי. סודות ב-DB מוצפנים (כמו `apiKeyV2`); ברשומות רק `credentialRef`.
3. **PII ב-dev:** fixtures וטסטים עם נתונים מומצאים (שמות/טלפונים/כתובות); ייצוא Monday ל-dry-run — רק על staging; לוגים עם `pino` redact לשדות `phone,email,address,id_number`; `AI_PII_REDACT=1` בכל קריאה ל-LLM מ-dev (ובכלל: לא שולחים ת"ז/צילומי זהות ל-LLM — תוכנית האב §15, מחקר 05 §8.3).
4. **קבצי לקוח** (חשבונות חשמל, ת"ז) לא נשמרים על הדיסק המקומי מחוץ ל-`E:\bee-cad\jobs` זמני (worker) ו-MinIO dev; מחיקה בסיום. צילומי ת"ז — לא נשמרים כלל (מזעור).
5. **גיבויים:** WAL-G/pg_dump מוצפנים; תרגול שחזור רבעוני **ל-staging בלבד**; מפתחות ב-secret store של השרת, לא ב-`ops/`.
6. **מאגר ציבורי:** `bee-assets` ציבורי — אין בו נתוני לקוח, מחירונים אמיתיים, הצעות אמיתיות או מפתחות; קבצי כיול (§19 בתוכנית האב) נשמרים ב-Drive/`E:\bee-live` פרטי, לא כאן.
7. **audit:** כל גישה לרשומת לקוח במנוע נרשמת (RLS + audit log, WP-M0-06); בסביבת dev אותו קוד, כדי שהטסטים יכסו.
