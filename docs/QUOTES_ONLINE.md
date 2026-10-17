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
לקוח  ──▶  POST /q/<token>/accept     "אני מאשר/ת את ההצעה" (שם + 4 ספרות + סימון)
ברק   ──▶  GET /api/quotes/<token>    כמה פעמים נפתח ומתי, והאם אושר
      ──▶  DELETE /api/quotes/<token> ביטול הקישור
```

- **רק הצעה מתומחרת מלאה מתפרסמת.** הצעה עם שורות "לאימות" או בלי סה״כ — הכפתור חסום עם הסבר.
- **מה הלקוח רואה** נקבע במקום אחד: `toPublicQuote()` — שם, כתובת, מערכת, שורות עם מחיר ללקוח, סה״כ, מע״מ, לוח תשלומים, תנאים. עלות, מרווח, שער מט״ח, מק״ט, דגלים ומקור כמות לא יוצאים (נבדק).
- **הקוד** הוא 128 ביט אקראי (22 תווים) — לא ניתן לנחש. הדף מסומן `noindex` כדי שלא ייכנס לגוגל.
- **Law #2:** האפליקציה לא שולחת ללקוח. "שתף קישור" פותח את חלון השיתוף של הטלפון, וברק בוחר למי.
- גרסה חדשה של הצעה = קישור חדש. קישור ישן נשאר עד שמבטלים אותו.

## אישור ההצעה ע״י הלקוח (מפרט 12 §7.1, שלב א' — בלי SMS)

בתחתית דף ההצעה יש טופס **"אישור ההצעה"**: שם מלא, 4 ספרות אחרונות של ת״ז / ח״פ, וסימון "קראתי את ההצעה ואני מאשר/ת אותה". הטופס עובד בלי JavaScript.

- **מה נשמר** (`quotes/<קוד>/acceptance.json`): שם, 4 ספרות, זמן, IP, דפדפן, מספר הצעה וגרסה, אסמכתא (קצה ה-hash של הגרסה), סה״כ, sha256 של ה-PDF שהוצע, ועותק של מה שהלקוח ראה.
- **אישור אחד לקישור.** אם הלקוח שולח שוב, הרשומה הראשונה נשארת.
- **חסימות:**
  - ההצעה פגה (`valid_until`) → 410;
  - הקישור בוטל → 404;
  - הגרסה התחלפה מאז שהדף נפתח → הלקוח מתבקש לעבור על המעודכנת;
  - שליחה מאתר אחר → 403 (`Sec-Fetch-Site` / `Origin`).
- **ביטול קישור לא מוחק אישור.** הרשומה נשמרת כתיעוד.
- **בדיקת ת״ז:** כשבסקר יש ת״ז / ח״פ של הלקוח, 4 הספרות חייבות להתאים. אחרי 5 ניסיונות שגויים האישור ננעל לקישור הזה ([`OFFICE.md`](OFFICE.md)).
- **באפליקציה:** בחלון ההצעות מופיע "✓ הלקוח אישר את ההצעה: <שם> · <זמן>", וברשימה הסקר עובר ל"הלקוח אישר". במסך המשרד רואים את האישור ליד העבודה.
- **לכוורת:** `GET /api/hive/jobs` מחזיר `events` מסוג `quote.accepted` (עם `requiresHumanPick: true`). הצעד הבא, הכנת ההסכם, נשאר אצל ברק.
- **נוסח:** הטופס מנוסח כ**אישור עקרוני** — "ההסכם עצמו ותנאיו ייחתמו בנפרד". זו לא חתימה אלקטרונית לפי חוק חתימה אלקטרונית. לפני שהופכים את זה לחתימה מחייבת (OTP ב-SMS, דף תעודה, נוסח ביטול עסקה) צריך אישור עו״ד (מפרט 12 §7.1, V17).

## הפעלה (פעם אחת) — דורש חשבון Cloudflare של החברה

### הדרך הקצרה: פקודה אחת

1. **טוקן:** Cloudflare Dashboard → My Profile → API Tokens → Create Token → Custom, עם ההרשאות:
   - Account → **Cloudflare Pages: Edit**
   - Account → **Workers R2 Storage: Edit**
2. **מזהה חשבון (Account ID):** מופיע בדף הבית של החשבון בדשבורד.
3. **הרצה:**

   ```bash
   cd apps/bee-solar-survey
   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… npm run setup:cloudflare -- --domain app.barak-e.com
   ```

**ב-Windows (PowerShell)** התחביר `VAR=… command` לא עובד. במקומו:

```powershell
# פעם אחת: Git ו-Node.js 22 LTS (https://nodejs.org) מותקנים
cd $HOME
git clone https://github.com/Barak-B/bee-assets.git
cd bee-assets
git checkout claude/dazzling-pasteur-17ua3g   # עד שה-PR ימוזג ל-main
cd apps\bee-solar-survey
npm install

chcp 65001                                     # שהעברית תוצג נכון בחלון
$env:CLOUDFLARE_API_TOKEN = "<הטוקן>"
$env:CLOUDFLARE_ACCOUNT_ID = "<מזהה החשבון>"
node scripts\setup-cloudflare.mjs --dry-run --domain app.barak-e.com   # רק מראה מה ייעשה
node scripts\setup-cloudflare.mjs --domain app.barak-e.com             # מבצע
```

ב-PowerShell עדיף `node scripts\setup-cloudflare.mjs` ולא `npm run setup:cloudflare --`, כי PowerShell לפעמים בולע את ה-`--`.

הסקריפט (`scripts/setup-cloudflare.mjs`) בודק כל שלב ויוצר רק מה שחסר: bucket ‏`bee-quotes`, פרויקט Pages, מפתח ראשי, בנייה ופריסה, דומיין, ובסוף `GET /api/health`.
- המפתח הראשי נוצר בסקריפט ו**מוצג פעם אחת**. אם כבר יש מפתח, הסקריפט לא נוגע בו (להחלפה: `--rotate-key`).
- אפשר להריץ שוב בלי חשש.
- `--dry-run` מראה מה ייעשה בלי לשנות כלום.
- אם `--domain` לא תואם ל-`PUBLIC_BASE_URL` שב-`wrangler.toml`, הסקריפט עוצר לפני שמתחיל.

אפשר גם לתת לסוכן לעשות את זה: מוסיפים `CLOUDFLARE_API_TOKEN` ו-`CLOUDFLARE_ACCOUNT_ID` כ-secrets בסביבת הענן, והוא מריץ את הפקודה.

### הדרך הידנית (דשבורד)

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

6. **מפתחות לסוקרים:** היכנסו ל-`https://app.barak-e.com/office` עם `PUBLISH_KEY`, ובלשונית "מפתחות" צרו מפתח לכל סוקר. כל סוקר מקבל מפתח משלו, ו-`PUBLISH_KEY` נשאר רק אצלכם ([`OFFICE.md`](OFFICE.md)).

7. **בדיקה:** באותו מסך, לחצו "בדיקת חיבור לשרת". האפליקציה פונה ל-`GET /api/health` ומציגה ✓ או ✗ לכל שלב:
   - אחסון R2 מחובר;
   - `PUBLIC_BASE_URL` ציבורי;
   - `PUBLISH_KEY` מוגדר;
   - המפתח באפליקציה תקין, ושל מי הוא;
   - כתיבה ל-R2 עובדת.

   אם אין תשובה בכלל, ההודעה אומרת אם הדומיין עוד לא מחובר או שחסר `ALLOWED_ORIGINS`. השרת לא מחזיר את ערך המפתח, ובלי המפתח הנכון הוא לא כותב לאחסון.

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
