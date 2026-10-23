# הודעה לנרי — בקשת שיתוף קוד

**יעד:** Neri Lederberg (`lederbergneri@gmail.com`)
**ערוץ מומלץ:** קבוצת `120363425994041413@g.us` (Neri sync group) או DM ישירות
**תאריך:** 2026-05-26

---

## גרסה קצרה (להעתקה ל-WhatsApp):

```
היי נרי, ראיתי את ה-HTML של הארכיטקטורה ששלחת — מטורף! 🔥

יש לי 4 רכיבים שאני רוצה לשלב אצלי בסוכן ב-OpenClawAgent:

1. `bridge.js` — שלך מטפל ב-quoted/reply + media חי. שלי לא רואה reply בכלל.
2. `document-worker` — ה-PDF + OCR + תיקון כיווניות עברית.
3. `media_batch.py` — קיבוץ תמונות לקבוצה אחת לפני PDF.
4. `conversation_context.py` + Live State Markdown לכל צ'אט.

האם תוכל לשתף repo (GitHub/private)? או לחילופין zip של 4 הקבצים האלה?

תרצה לחזור על המעבר ב-zoom 30 דקות שאוכל לראות חי איך זה מתחבר? יותר מהיר ממה שאני אעבור עליו לבד.

תודה ענק 🙏
```

---

## גרסה ארוכה יותר (אם נרי מבקש פירוט):

```
נרי, סקרתי את ה-HTML של "ארכיטקטורת סוכן WhatsApp פרטי" — אסטרטגיה מצוינת. אצלי במקביל יש Alfred על OpenClaw + Hermes Agent (Python) שעובדים בפדרציה אבל יש 4 פערים שהארכיטקטורה שלך פותרת:

**הפערים אצלי:**
1. **תמונות:** Alfred לא יודע לקרוא תמונה. אני עכשיו בונה wrapper סביב Gemini 2.5 Pro Vision, אבל ראיתי שאצלך זה רץ דרך document-worker עם תיקון כיווניות עברית.
2. **PDFs:** מהנדס שולח חוזה PDF — Alfred לא מסכם, רק שומר את הקובץ. אצלך זה Document Worker.
3. **Reply/quote:** רוב הצ'אט בWA הוא reply להודעה ישנה ("תקן את זה"). Alfred לא רואה את ה-quoted message — כל reply עובר אצלו כהודעה רגילה. אצלך bridge.js מחלץ את זה.
4. **Voice:** Alfred מתמלל voice (Groq Whisper) ושם בקבוצת תמלולים, אבל לא ממשיך לסיווג כוונה ולהצעת פעולה. אצלך התמלול נכנס לזיכרון השיחה כאילו נכתב.

**מה אני מבקש:**
- **GitHub access** ל-repo שלך (אני אקרא, לא אערוך), או
- **zip** של 4 קבצים: `bridge.js`, `document-worker/`, `media_batch.py`, `conversation_context.py`
- **אופציה ג'** — Zoom 30 דק': תראה לי את ה-flow חי, אני אצלם, אעשה integration בעצמי.

**מה אני יכול לתת בחזרה:**
- מה שיש לי שאולי אין לך:
  - 4-destinations constitutional sendPolicy (alfred-handle.js)
  - BEE Operations DB integration (137 לקוחות, 255 אתרים, snapshot חי)
  - Learning loops infrastructure (correction-detector + few-shot examples + self-improving skill)
  - Hermes Agent federation (Python workhorse עם 85 כלים + Curator + holographic memory)
  - Smart routing chain (deepseek→google→anthropic with auto-fallback)
- אם רוצה — אני אשתף את כל ה-bee-assets repo שלי איתך.

מה הכי קל לך?
```

---

## טכני: מה אני בעיקר אחפש בקוד של נרי

עבור claude code/ה-agents שלי בעתיד שיעבדו על integration:

**ב-`bridge.js`:**
- איך הוא מחלץ `quotedMessageId` ו-`quotedBody` מ-Baileys envelope?
- איך הוא מבחין בין `audio` (voice note) ל-`image` ל-`document`?
- האם יש `pending_media` queue (קבצים ללא הוראה)?
- איך הוא מסמן batch של תמונות שנשלחו ברצף?

**ב-`document-worker`:**
- איזה ספריות PDF? `pdf-parse`, `pdfjs-dist`, Gemini Vision?
- איך הוא מטפל ב-RTL עברית בטקסט מחולץ?
- האם יש OCR לתמונות בתוך PDF (scanned)?

**ב-`media_batch.py`:**
- מה ה-batch window (זמן בין תמונות = אותו batch)?
- איך הוא מבחין בין "batch אחרון" ל"כל התמונות מהשיחה"?
- מה הפלט — PDF מקומי? מאוחסן באיזה דיר?

**ב-`conversation_context.py`:**
- מה ה-schema של SQLite (טבלאות, אינדקסים)?
- מה ה-Live State Markdown structure (כל שיחה = קובץ אחד? קובץ לפי תקופה?)
- האם יש "rolling summary" — וכל כמה הודעות הוא מתעדכן?
- איך הוא בונה את ה-context pack (אילו שדות, באיזה סדר, באיזה כמות)?

---

## מה לעשות אחרי שנרי עונה

1. אם הוא משתף repo → `git clone` ל-`E:\bee-neri\`, קרא בעיון.
2. אם הוא משתף zip → unzip ל-`E:\bee-neri\`, קרא בעיון.
3. אם הוא רוצה Zoom → לקבוע, להקליט, לתמלל אחרי.
4. ל-cross-reference עם 4 ה-capability tasks שאני בונה כרגע (alfred-vision.js, alfred-pdf.js, reply-context-in-router, voice-action-loop) — לא לבזבז עבודה כפולה.
5. לעדכן את `research/agent-architecture.html` עם השכבות החדשות שילובו.

---

*נכתב 2026-05-26 17:30. ההודעה הקצרה היא הברירת מחדל לשליחה — אם נרי מבקש פירוט נשלח את הארוכה.*
