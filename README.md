# B.E.E Public Assets

Public assets for email signatures and external use.

## Apps

- [`apps/bee-solar-survey`](apps/bee-solar-survey) — סקר אתר סולארי (Hive Collect → Wave 54), PWA אופליין עם דוח PDF עברי והצעת מחיר ראשונית. See [`docs/BEE_SOLAR_SURVEY_HIVE.md`](docs/BEE_SOLAR_SURVEY_HIVE.md).
- [`engine/`](engine) — **bee-cad**: מנוע CAD (מודל לוח אחד → DXF: חד-קווי + מבנה לוח, בלוקי IEC 60617, גופנים עבריים). מחקר ותוכנית: [`docs/DESIGN_ENGINE_RESEARCH_2026-10-17.md`](docs/DESIGN_ENGINE_RESEARCH_2026-10-17.md), תצוגה מקדימה: [`docs/engine-preview/`](docs/engine-preview).

## Packages

- [`packages/quote-core`](packages/quote-core) — `@bee/quote-core`: מנוע הצעת מחיר ראשונית (TypeScript טהור, תת-קבוצה של מפרט 12). קטלוג וכללי תמחור כזרע — ברק ממלא מחירים.

## Docs

- [`docs/QUOTES_ONLINE.md`](docs/QUOTES_ONLINE.md) — הצעות מחיר אונליין תחת הדומיין (`/q/<קוד>`), הפעלה ב-Cloudflare.
- [`docs/FIELD_REPORTS.md`](docs/FIELD_REPORTS.md) — דוחות שטח: יומי, צ׳קליסט התקנה, בדיקת 62446-1, ליקויים, מסירה — מנוע אחד ו-PDF אחד.
- [`docs/OFFICE.md`](docs/OFFICE.md) — מסך משרד (`/office`), כרטיס לקוח, שלב לכל עבודה ומפתח אישי לכל סוקר.
- [`docs/SURVEY_SYNC.md`](docs/SURVEY_SYNC.md) — גיבוי סקרים, תמונות והצעות לשרת, תור אופליין, שחזור לטלפון חדש ו-feed לכוורת.
- [`docs/REVIEW-2026-10-13-quotes-reports.md`](docs/REVIEW-2026-10-13-quotes-reports.md) — סקירת הצעות מחיר ודוחות ותוכנית שלב-שלב.

## Packages

- [`packages/quote-engine`](packages/quote-engine) — ליבת מנוע הצעות המחיר (M1: קטלוג, ערכות, כללים ותמחור) לפי `docs/plan/specs/12`.

## Logos

- [`logos/bee-logo.png`](logos/bee-logo.png) — **הלוגו הרשמי של B.E.E לשימוש בכל חומר** (סמל + B.E.E + סלוגן, רקע שקוף). המקור: [`logos/bee-logo-source.jpg`](logos/bee-logo-source.jpg) ופריים החתימה ב-`bee-signature-card-light.gif`.
- [`logos/bee-logo-full.jpg`](logos/bee-logo-full.jpg) / [`logos/bee-logo-full-transparent.png`](logos/bee-logo-full-transparent.png) — גרסה ישנה יותר של הלוגו (ללא הטבעת), נשמרת לארכיון.
- [`logos/bee-symbol.png`](logos/bee-symbol.png) — הסמל בלבד.

## Partnership (B.E.E + SNL Energy)

- [`partnership/bee-snl-joint-logo-1024.png`](partnership/bee-snl-joint-logo-1024.png) — לוגו משותף ריבועי לקבוצת וואטסאפ. מקור: `partnership/bee-snl-joint-logo.html`.
- [`partnership/bee-snl-joint-banner-1600x600.png`](partnership/bee-snl-joint-banner-1600x600.png) — באנר רוחבי למסמכים ולכותרות. מקור: `partnership/bee-snl-joint-banner.html`.
- [`partnership/snl-energy-logo.png`](partnership/snl-energy-logo.png) — לוגו SNL (נחתך מצילום מסך; להחליף בקובץ מקור כשיתקבל).

## SUNSTOCK (שם העבודה של השותפות)

- [`partnership/sunstock/sunstock-badge-1024.png`](partnership/sunstock/sunstock-badge-1024.png) — הלוגו הראשי (ריבועי, רקע לבן). גרסאות: `-mono` (חד-צבעי), `-reverse` (רקע כהה).
- [`partnership/sunstock/sunstock-lockup-1800x600.png`](partnership/sunstock/sunstock-lockup-1800x600.png) — פריסה רוחבית לנייר מכתבים, כותרות וחתימות מייל (+ `-reverse`).
- [`partnership/sunstock/sunstock-icon-600.png`](partnership/sunstock/sunstock-icon-600.png) — הסמל בלבד, לאייקונים ולתמונות פרופיל.
- [`partnership/sunstock/sunstock-brand-sheet.png`](partnership/sunstock/sunstock-brand-sheet.png) — דף מותג: שם, סלוגנים, משמעות הסמל, גרסאות, צבעים וגופן.
- מקור: `gen_sunstock.py` מייצר את קובצי ה-HTML/SVG, `render.mjs` מייצא PNG דרך Playwright.

## Planning

- [`docs/plan/00-master-plan.md`](docs/plan/00-master-plan.md) — תוכנית אב ל-B.E.E Engine (הצעות, כתבי כמויות, תוכניות, הגשה לחח"י, CRM מחזור חיים) + דוחות מחקר ב-`docs/plan/research/`.

## Tooling

- [`docs/CLAUDEX_LOOP.md`](docs/CLAUDEX_LOOP.md) — פלאגין **Claudex Loop** (תכנון ובדיקה צולבת Claude ↔ Codex): מה נבדק, איך מתקינים ואיך משתמשים במוח בלי לשרוף טוקנים. ההגדרה ברמת הריפו (נעוצה ל-commit שנבדק): `.claude/settings.json`.
