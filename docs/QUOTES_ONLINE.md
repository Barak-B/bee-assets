# הצעות מחיר אונליין תחת הדומיין של B.E.E

> **מטרה:** כל הצעה שיוצאת ללקוח היא קישור בצורה `https://app.barak-e.com/q/<קוד>` — לא `http://127.0.0.1:…/q/…`.
> **קוד:** `apps/bee-solar-survey/functions/` (Cloudflare Pages Functions) · `packages/quote-core/src/public.ts` · `apps/bee-solar-survey/src/publish.ts`

## למה הופיע `http://127.0.0.1:50973/q/…`

קישור כזה נוצר כשהשרת בונה את הקישור מהכתובת של עצמו (שרת מקומי על פורט אקראי) במקום מכתובת ציבורית מוגדרת. הוא נפתח רק על אותו מחשב — לקוח שמקבל אותו רואה שגיאה.

כאן זה לא יכול לקרות, בשתי שכבות:

1. **בשרת** — הקישור נבנה רק מ-`PUBLIC_BASE_URL`. אם הכתובת אינה `https` על דומיין ציבורי (כולל `127.x`, `localhost`, `10.x`, `192.168.x`, `172.16–31.x`, `*.local`, שם מחשב בלי נקודה) — הפרסום נכשל עם הודעה ברורה.
2. **באפליקציה** — גם אם שרת כלשהו מחזיר קישור מקומי, האפליקציה מסרבת לשמור או להציג אותו (נבדק ב-E2E).

## איך זה עובד

```
אפליקציית הסקר  ──(Bearer PUBLISH_KEY)──▶  POST /api/quotes   ──▶  R2: quotes/<token>/quote.json + quote.pdf
   "קישור ללקוח"                                  │
                                                  └──▶ { url: "https://app.barak-e.com/q/<token>" }
לקוח  ──▶  GET /q/<token>       דף הצעה בעברית (ללא עלויות/מרווחים/מק״טים)
      ──▶  GET /q/<token>/pdf   ה-PDF ללקוח (ללא סימן "טיוטה")
ברק   ──▶  GET /api/quotes/<token>    כמה פעמים נפתח ומתי
      ──▶  DELETE /api/quotes/<token> ביטול הקישור
```

- **רק הצעה מתומחרת מלאה מתפרסמת.** הצעה עם שורות "לאימות" או בלי סה״כ — הכפתור חסום עם הסבר.
- **מה הלקוח רואה** נקבע במקום אחד: `toPublicQuote()` — שם, כתובת, מערכת, שורות עם מחיר ללקוח, סה״כ, מע״מ, לוח תשלומים, תנאים. עלות, מרווח, שער מט״ח, מק״ט, דגלים ומקור כמות לא יוצאים (נבדק).
- **הקוד** הוא 128 ביט אקראי (22 תווים) — לא ניתן לנחש. הדף מסומן `noindex` כדי שלא ייכנס לגוגל.
- **Law #2:** האפליקציה לא שולחת ללקוח. "שתף קישור" פותח את חלון השיתוף של הטלפון, וברק בוחר למי.
- גרסה חדשה של הצעה = קישור חדש. קישור ישן נשאר עד שמבטלים אותו.

## הפעלה (פעם אחת) — דורש חשבון Cloudflare של החברה

1. **פרויקט Pages:** Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → `Barak-B/bee-assets`.
   - Root directory: `apps/bee-solar-survey`
   - Build command: `npm run build`
   - Output: `dist`
2. **אחסון:** R2 → Create bucket → `bee-quotes`. בפרויקט: Settings → Functions → R2 bindings → `QUOTES` → `bee-quotes`.
3. **דומיין:** בפרויקט → Custom domains → `app.barak-e.com` (או `quotes.barak-e.com`). אם `barak-e.com` מנוהל ב-Cloudflare, ה-DNS נוצר אוטומטית.
4. **משתנים:** Settings → Variables:
   - `PUBLIC_BASE_URL` = `https://app.barak-e.com` (בדיוק הדומיין משלב 3)
   - `PUBLISH_KEY` = מחרוזת אקראית ארוכה, כ-**Secret** (למשל פלט של `openssl rand -base64 32`)
5. **באפליקציה:** מחירון → "שרת החברה — הצעות אונליין וגיבוי" → כתובת האתר (`https://app.barak-e.com`) ומפתח השרת → שמור. אותם פרטים מפעילים גם את גיבוי הסקרים ([`SURVEY_SYNC.md`](SURVEY_SYNC.md)).

במקום שלבים 1–4 אפשר מהמחשב: `npx wrangler r2 bucket create bee-quotes`, `npx wrangler pages secret put PUBLISH_KEY --project-name bee-solar-survey`, `npm run pages:deploy`. הקובץ `apps/bee-solar-survey/wrangler.toml` כבר מגדיר את ה-binding ואת `PUBLIC_BASE_URL`.

## פיתוח מקומי

```bash
cd apps/bee-solar-survey
npm run build
printf 'PUBLISH_KEY=local-dev-key\nPUBLIC_BASE_URL=http://127.0.0.1:8788\nALLOW_LOCAL_LINKS=1\n' > .dev.vars   # לא נכנס ל-git
npm run pages:dev     # http://127.0.0.1:8788 — אפליקציה + /api + /q
```

`ALLOW_LOCAL_LINKS=1` קיים רק לפיתוח מקומי. **אסור להגדיר אותו בפרויקט האמיתי.**

## בדיקות

| מה | איפה |
|---|---|
| מודל ציבורי, חסימת כתובות מקומיות, קודים | `packages/quote-core/src/public.test.ts` |
| API ודף הלקוח (R2 בזיכרון): פרסום, דף, PDF, צפיות, ביטול, 401/503/400, סירוב ל-127.0.0.1 | `apps/bee-solar-survey/functions/quotes.test.ts` |
| אפליקציה: פרסום → קישור בדומיין, סירוב לקישור מקומי מהשרת, אי-שמירת כתובת מקומית | `apps/bee-solar-survey/e2e/smoke.spec.ts` |
| בניית ה-Functions ב-Wrangler | CI: `npm run functions:check` |
