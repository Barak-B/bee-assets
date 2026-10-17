# -*- coding: utf-8 -*-
HTML = r'''<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>מזכר הבנות — שותפות ברק הנדסת חשמל ושנל אנרגיה (SUNSTOCK)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Frank+Ruhl+Libre:wght@500;700&display=swap" rel="stylesheet" />
  <style>
    @font-face { font-family: "Assistant Local"; src: url(FONTDIR/Assistant.ttf); font-weight: 200 800; }
    @font-face { font-family: "Frank Local"; src: url(FONTDIR/FrankRuhlLibre.ttf); font-weight: 300 900; }
    :root {
      --ink: #0f1a2e; --ink-soft: #3a465c; --paper: #f7f4ef; --panel: #ffffff; --line: #d8d2c8;
      --accent: #c45c26; --navy: #0b1f3a; --green: #1f7a4d; --blue: #1a5f9e;
      --shadow: 0 18px 40px rgba(15, 26, 46, 0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Assistant Local", "Assistant", sans-serif; color: var(--ink); line-height: 1.65;
      background: radial-gradient(ellipse 80% 50% at 100% 0%, rgba(196,92,38,0.08), transparent 50%),
                  radial-gradient(ellipse 60% 40% at 0% 100%, rgba(26,95,158,0.07), transparent 45%),
                  linear-gradient(180deg, #ebe6de 0%, var(--paper) 28%, #f3efe8 100%); }
    .wrap { max-width: 980px; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
    header.hero { padding: 1.5rem 0 1.75rem; border-bottom: 1px solid var(--line); margin-bottom: 2rem; }
    .banner { display: block; width: 100%; max-width: 640px; margin: 0 auto 1.25rem; }
    .sign th img { display: block; height: 44px; margin: 0 auto 0.25rem; }
    .sign th { text-align: center; }
    .kicker { font-size: 0.85rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); font-weight: 700; margin: 0 0 0.5rem; }
    h1 { font-family: "Frank Local", "Frank Ruhl Libre", serif; font-size: clamp(2rem, 4vw, 2.7rem); line-height: 1.15; margin: 0 0 0.75rem; color: var(--navy); }
    .lede { font-size: 1.1rem; color: var(--ink-soft); max-width: 46rem; margin: 0; }
    .meta-bar { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin-top: 1.25rem; font-size: 0.92rem; color: var(--ink-soft); }
    .meta-bar strong { color: var(--ink); font-weight: 700; }
    nav.toc { background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow); padding: 1.25rem 1.5rem; margin-bottom: 2rem; }
    nav.toc h2 { font-family: "Frank Local", "Frank Ruhl Libre", serif; font-size: 1.25rem; margin: 0 0 0.75rem; border: 0; padding: 0; }
    nav.toc ol { margin: 0; padding-inline-start: 1.25rem; columns: 2; gap: 1.5rem; }
    nav.toc a { color: var(--blue); text-decoration: none; font-weight: 600; }
    section { background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow); padding: 1.5rem 1.6rem 1.75rem; margin-bottom: 1.5rem; }
    h2 { font-family: "Frank Local", "Frank Ruhl Libre", serif; font-size: 1.55rem; margin: 0 0 0.85rem; color: var(--navy); padding-bottom: 0.55rem; border-bottom: 2px solid #efe8de; }
    h3 { font-size: 1.1rem; margin: 1.35rem 0 0.55rem; color: var(--ink); }
    p { margin: 0.55rem 0; }
    ul, ol { margin: 0.4rem 0 0.6rem; padding-inline-start: 1.4rem; }
    li { margin: 0.25rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: 0.95rem; margin: 0.75rem 0 0.25rem; }
    th, td { border: 1px solid var(--line); padding: 0.6rem 0.75rem; text-align: right; vertical-align: top; }
    th { background: #f3eee6; font-weight: 700; color: var(--navy); }
    tr:nth-child(even) td { background: #fbf9f6; }
    .ltr { direction: ltr; unicode-bidi: isolate; display: inline-block; }
    .blank { display: inline-block; min-width: 6rem; border-bottom: 1px solid var(--ink-soft); line-height: 1; }
    .badge { display: inline-block; padding: 0.15rem 0.55rem; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.03em; border: 1px solid var(--line); background: #f3eee6; color: var(--ink-soft); }
    .badge.warn { background: #fff3e6; color: var(--accent); border-color: #f0c9a8; }
    .badge.info { background: #e8f1fa; color: var(--blue); border-color: #b7d0ea; }
    .badge.ok { background: #e6f4ec; color: var(--green); border-color: #b7dfc7; }
    .note { border-right: 4px solid var(--accent); background: #fff7f1; padding: 0.75rem 1rem; margin: 0.9rem 0; }
    .sign { margin-top: 1rem; }
    .sign td { height: 2.2rem; }
    footer { margin-top: 0.4rem; padding-top: 0.5rem; page-break-before: avoid; font-size: 0.85rem; color: var(--ink-soft); text-align: center; border-top: 1px solid var(--line); padding-top: 1rem; }
    @media print {
      @page { size: A4; margin: 16mm 14mm; }
      body { background: #fff; }
      .wrap { max-width: none; padding: 0; }
      section, nav.toc { box-shadow: none; border: 1px solid var(--line); page-break-inside: auto; break-inside: auto; }
      section { page-break-before: auto; }
      h2 { page-break-after: avoid; }
      table, tr { page-break-inside: avoid; }
      .sign { page-break-inside: avoid; }
      nav.toc { page-break-after: always; }
      footer { display: none; }
    }
  </style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <img class="banner" src="BANNER" alt="SUNSTOCK · B.E.E × SNL" />
    <p class="kicker">מזכר הבנות · Memorandum of Understanding</p>
    <h1>שותפות ברק הנדסת חשמל ושנל אנרגיה</h1>
    <p class="lede">
      מסמך זה מסכם את עקרונות ההסכמה בין הצדדים להקמת שותפות 50/50 לאספקת ציוד למערכות סולאריות ואגירה,
      ייצור קונסטרוקציה, אחסנה והפצה, לקראת ניסוח הסכם שותפות מפורט על ידי עורכי הדין של הצדדים.
    </p>
    <div class="meta-bar">
      <span><strong>סטטוס:</strong> טיוטה לדיון — לא מחייבת (למעט סעיפי הסודיות והבלעדיות במשא ומתן)</span>
      <span><strong>תאריך:</strong> 17.10.2026</span>
      <span><strong>שם עבודה לשותפות:</strong> SUNSTOCK (סאנסטוק)</span>
      <span><strong>גרסה:</strong> 1.0</span>
    </div>
  </header>

  <nav class="toc" aria-label="תוכן עניינים">
    <h2>תוכן עניינים</h2>
    <ol>
      <li><a href="#s1">הצדדים ורקע</a></li>
      <li><a href="#s2">מהות השותפות</a></li>
      <li><a href="#s3">תרומת שנל אנרגיה — אספקה במחיר עלות ובלעדיות</a></li>
      <li><a href="#s4">תרומת ברק הנדסת חשמל — הקמה ותפעול</a></li>
      <li><a href="#s5">ממשל תאגידי, מימון וחלוקת רווחים</a></li>
      <li><a href="#s6">בלעדיות, אי-תחרות וסודיות</a></li>
      <li><a href="#s7">תקופה, סיום ויישוב סכסוכים</a></li>
      <li><a href="#s8">לוח זמנים, תנאים מתלים וחתימות</a></li>
    </ol>
  </nav>

  <section id="s1">
    <h2>1. הצדדים ורקע</h2>
    <p><strong>ברק הנדסת חשמל</strong> (להלן: "ברק") — חברה העוסקת בתכנון, ביצוע והתקנה של מערכות חשמל ומערכות סולאריות.
      ח.פ.: <span class="blank"></span>. כתובת: אזור התעשייה כוכב יאיר–טירה.</p>
    <p><strong>שנל אנרגיה</strong> (להלן: "שנל") — חברה העוסקת בייבוא, הפצה ושיווק של ציוד סולארי, ובכלל זה פנלים, כבלים ומערכות אגירה.
      ח.פ.: <span class="blank"></span>. כתובת: מושב ורדון.</p>
    <p><strong>הרקע:</strong> ברק מחזיקה ביכולות ביצוע, קונסטרוקציה ושטח. שנל מחזיקה בקשרי ספקים ובהסכמי הפצה למותגים מובילים.
      הצדדים מבקשים לאחד את היכולות הללו תחת שותפות משותפת אחת, שתשלב מפעל קונסטרוקציה, מחסן לוגיסטי ומערך מכירות של ציוד סולארי.</p>
    <p><strong>המטרה:</strong> הקמת גוף משותף שיאפשר לצדדים לרכוש ציוד במחירי עלות, לייצר קונסטרוקציה באופן עצמאי, ולמכור ללקוחות קצה
      ולמתקינים אחרים — תוך שיפור הרווחיות של שני הצדדים ויצירת מקור הכנסה נוסף.</p>
  </section>

  <section id="s2">
    <h2>2. מהות השותפות</h2>
    <p>הצדדים יקימו תאגיד משותף (להלן: "השותפות") שיוחזק בחלקים שווים, 50% לברק ו-50% לשנל.</p>
    <table>
      <thead><tr><th style="width:26%">נושא</th><th>הסכמה</th></tr></thead>
      <tbody>
        <tr><td>צורת ההתאגדות</td><td>חברה בע"מ חדשה או שותפות רשומה — לבחירת הצדדים בייעוץ רו"ח ועו"ד</td></tr>
        <tr><td>שם מוצע</td><td><span class="ltr">SUNSTOCK</span> (סאנסטוק) — שם עבודה מוסכם, בכפוף לבדיקת סימן מסחר, רשם החברות וזמינות דומיין</td></tr>
        <tr><td>אחזקות</td><td>ברק 50% · שנל 50%</td></tr>
        <tr><td>הון ראשוני</td><td>סכום של <span class="blank"></span> ₪, בחלקים שווים, או לפי מפתח השקעות שייקבע בהסכם המפורט</td></tr>
        <tr><td>תחומי פעילות</td><td>(א) ייצור קונסטרוקציה למערכות סולאריות (ב) אחסנה ולוגיסטיקה של ציוד (ג) מכירה והפצה של פנלים, ממירים, כבלים ומערכות אגירה</td></tr>
        <tr><td>קהל יעד</td><td>לקוחות קצה, קבלני חשמל, מתקינים ויזמים סולאריים בישראל</td></tr>
        <tr><td>שטח פעילות</td><td>מדינת ישראל; הרחבה לשווקים נוספים בהסכמת שני הצדדים</td></tr>
      </tbody>
    </table>
    <p><strong>עקרון מנחה:</strong> כל אחד מהצדדים מביא לשותפות את היתרון היחסי שלו — שנל את שרשרת האספקה והמותגים, ברק את ההקמה, התפעול והמכירה בשטח.
      הרווחים והסיכונים מתחלקים שווה בשווה.</p>
  </section>

  <section id="s3">
    <h2>3. תרומת שנל אנרגיה — אספקה במחיר עלות ובלעדיות</h2>
    <p>שנל תספק לשותפות ולברק את הציוד הבא במחיר עלות, ללא מרווח יצרן או יבואן, ותעניק לשותפות בלעדיות כמפורט להלן.</p>
    <table>
      <thead><tr><th>ציוד</th><th>מותג / ספק</th><th>תנאי מחיר</th><th>בלעדיות</th></tr></thead>
      <tbody>
        <tr><td>פנלים סולאריים</td><td><span class="ltr">Aiko</span></td><td>מחיר עלות בפועל (מחיר רכישה מהיצרן + הובלה, מכס, ביטוח)</td><td>בלעדיות לשותפות בתנאי מחיר אלו</td></tr>
        <tr><td>כבלים</td><td>לידר</td><td>מחיר עלות בפועל</td><td>בלעדיות לשותפות בתנאי מחיר אלו</td></tr>
        <tr><td>מערכות אגירה</td><td><span class="ltr">CSEC</span></td><td>מחיר עלות בפועל</td><td>בלעדיות לשותפות בתנאי מחיר אלו</td></tr>
      </tbody>
    </table>
    <p><strong>הגדרת "מחיר עלות":</strong> המחיר ששנל משלמת בפועל ליצרן או לספק, בתוספת עלויות ישירות מתועדות (הובלה ימית, מכס, עמילות, ביטוח, עמלות בנקאיות)
      וללא כל תוספת רווח. שנל תציג לשותפות, לפי דרישה, חשבוניות ספק ומסמכי יבוא לאימות המחיר.</p>
    <h3>היקף הבלעדיות</h3>
    <ul>
      <li>שנל לא תמכור פנלי <span class="ltr">Aiko</span>, כבלי לידר או אגירת <span class="ltr">CSEC</span> במחיר עלות או במחיר נמוך ממנו לכל גורם אחר בישראל.</li>
      <li>שנל תפעל להעביר לשותפות כל הזמנה של לקוח קצה בישראל למוצרים אלה, אלא אם הוסכם אחרת בכתב.</li>
      <li>השותפות תהיה הגורם הבלעדי למכירת המוצרים הללו בישראל, בכפוף להסכמי שנל הקיימים ערב חתימת מסמך זה, שיפורטו בנספח.</li>
    </ul>
    <h3>תנאי אספקה לסיכום בהסכם המפורט</h3>
    <ul>
      <li>זמינות וזמני אספקה: <span class="blank"></span> ימים מהזמנה למלאי בארץ, <span class="blank"></span> ימים להזמנת יבוא.</li>
      <li>תנאי תשלום: <span class="blank"></span> (מוצע: שוטף + 30, או מקדמה חלקית ליבוא).</li>
      <li>אחריות יצרן: תועבר במלואה לשותפות וללקוחותיה; שנל תסייע בטיפול בתביעות מול היצרן.</li>
      <li>מלאי מינימלי: הצדדים יסכמו על רמת מלאי שתוחזק במחסן השותפות.</li>
    </ul>
  </section>

  <section id="s4">
    <h2>4. תרומת ברק הנדסת חשמל — הקמה ותפעול</h2>
    <p>ברק תקים ותתפעל, כחלק מן השותפות ולטובתה, מפעל קונסטרוקציה, מחסן לוגיסטי ומערך מכירות.</p>
    <table>
      <thead><tr><th style="width:24%">תחום</th><th>אחריות ברק</th></tr></thead>
      <tbody>
        <tr><td>מפעל קונסטרוקציה</td><td>איתור ושכירת מבנה, רכישת ציוד ייצור, גיוס כוח אדם, רישוי עסק ותקינה. ייצור קונסטרוקציות לגגות, לקרקע ולסככות חניה</td></tr>
        <tr><td>אחסנה ולוגיסטיקה</td><td>מחסן לפנלים, ממירים, כבלים ואגירה; ניהול מלאי, קבלת סחורה, ביטוח מלאי, הפצה ללקוחות</td></tr>
        <tr><td>מכירה והפצה</td><td>מכירת פנלים, ממירים, מערכות אגירה, כבלים וקונסטרוקציה ללקוחות קצה ולמתקינים; צוות מכירות, תמחור, הצעות מחיר</td></tr>
        <tr><td>הנדסה ושירות</td><td>תכנון מערכות, תמיכה טכנית ללקוחות, טיפול בפניות אחריות מול הלקוח</td></tr>
        <tr><td>ניהול שוטף</td><td>הנהלת חשבונות, גבייה, רישוי ותקינה, בטיחות בעבודה</td></tr>
      </tbody>
    </table>
    <p><strong>בעלות על המפעל והמלאי:</strong> המפעל, הציוד והמלאי יירשמו על שם השותפות. העלויות להקמה ולתפעול ימומנו מהון השותפות לפי תקציב מאושר (סעיף 5).</p>
    <p><strong>דמי ניהול:</strong> ברק תהיה זכאית לדמי ניהול בגין התפעול השוטף בסך <span class="blank"></span> ₪ לחודש, או בשיעור <span class="blank"></span>% מהמחזור,
      כפי שייקבע בהסכם המפורט. דמי הניהול ייחשבו כהוצאה של השותפות לפני חלוקת רווחים.</p>
    <h3>אבני דרך להקמה</h3>
    <ul>
      <li>איתור מבנה למפעל ולמחסן — תוך <span class="blank"></span> ימים מחתימה</li>
      <li>רכישת ציוד ייצור והקמת קו הייצור — תוך <span class="blank"></span> ימים</li>
      <li>קליטת מלאי ראשון משנל — תוך <span class="blank"></span> ימים</li>
      <li>תחילת מכירות ללקוחות חיצוניים — תוך <span class="blank"></span> ימים</li>
    </ul>
  </section>

  <section id="s5">
    <h2>5. ממשל תאגידי, מימון וחלוקת רווחים</h2>
    <p>השותפות תנוהל בשוויון: דירקטוריון של ארבעה חברים, שניים מכל צד, והחלטות מהותיות בהסכמת שני הצדדים.</p>
    <table>
      <thead><tr><th style="width:28%">נושא</th><th>הסדר</th></tr></thead>
      <tbody>
        <tr><td>דירקטוריון</td><td>4 חברים: 2 מטעם ברק, 2 מטעם שנל. יו"ר מתחלף מדי שנה, ללא קול מכריע</td></tr>
        <tr><td>מנכ"ל</td><td>ימונה על ידי ברק (אחראית לתפעול), באישור שנל</td></tr>
        <tr><td>סמנכ"ל רכש וספקים</td><td>ימונה על ידי שנל, באישור ברק</td></tr>
        <tr><td>זכות חתימה</td><td>חתימת נציג אחד מכל צד יחד מעל <span class="blank"></span> ₪; מתחת לסכום זה חתימת המנכ"ל בלבד</td></tr>
        <tr><td>החלטות ברוב רגיל</td><td>תפעול שוטף במסגרת התקציב המאושר</td></tr>
        <tr><td>החלטות בהסכמת שני הצדדים</td><td>תקציב שנתי, הוצאה מעל <span class="blank"></span> ₪ מחוץ לתקציב, נטילת אשראי, הוספת מותגים או ספקים, העסקת בכירים, שינוי תחומי פעילות, צירוף שותף שלישי, עסקה עם בעל עניין</td></tr>
        <tr><td>מימון הקמה</td><td>הון עצמי בחלקים שווים; הלוואות בעלים בתנאים זהים לשני הצדדים; אשראי בנקאי בערבות שווה</td></tr>
        <tr><td>חלוקת רווחים</td><td>50/50 מהרווח הנקי לאחר החזר הלוואות בעלים ויתרת רזרבה תפעולית שתיקבע בדירקטוריון; חלוקה רבעונית או שנתית</td></tr>
        <tr><td>דיווח</td><td>דו"ח כספי חודשי לשני הצדדים; דו"ח שנתי מבוקר על ידי רו"ח מוסכם</td></tr>
      </tbody>
    </table>
    <p><strong>עסקאות עם הצדדים עצמם:</strong> ברק ושנל רשאיות לרכוש ציוד מהשותפות לצורך פרויקטים שלהן במחיר עלות בתוספת <span class="blank"></span>%.
      חברה מהשתיים לא תקבל תנאים עדיפים על פני האחרת.</p>
  </section>

  <section id="s6">
    <h2>6. בלעדיות, אי-תחרות וסודיות</h2>
    <p>כל צד מתחייב שלא לפעול, בעצמו או דרך גוף קשור, בתחומי הפעילות של השותפות מחוץ לשותפות, כל עוד היא קיימת ובמשך <span class="blank"></span> חודשים לאחר יציאתו ממנה.</p>
    <h3>התחייבויות שנל</h3>
    <ul>
      <li>לא תספק פנלי <span class="ltr">Aiko</span>, כבלי לידר או אגירת <span class="ltr">CSEC</span> במחיר עלות לגורם אחר.</li>
      <li>לא תקים ולא תשתתף במפעל קונסטרוקציה או מחסן הפצה מתחרה בישראל.</li>
      <li>תפעל לשמירה על הסכמי ההפצה עם המותגים ותעדכן את ברק על כל שינוי בהם.</li>
    </ul>
    <h3>התחייבויות ברק</h3>
    <ul>
      <li>תרכוש פנלים, כבלים ואגירה לפרויקטיה דרך השותפות, אלא אם לקוח דורש מותג אחר במפורש.</li>
      <li>לא תקים מפעל קונסטרוקציה או מערך מכירות ציוד מקביל מחוץ לשותפות.</li>
      <li>פעילות ההנדסה וההתקנה הקיימת של ברק נשארת בבעלותה המלאה ואינה חלק מהשותפות.</li>
    </ul>
    <p><strong>סודיות:</strong> תנאי מסמך זה, מחירי העלות, הסכמי הספקים, רשימות לקוחות וכל מידע עסקי שיוחלף בין הצדדים הם סודיים.
      החובה חלה מיד עם החתימה על מסמך זה, גם אם לא ייחתם הסכם מפורט, ותעמוד בתוקפה <span class="blank"></span> שנים לאחר סיום השותפות.</p>
    <p><strong>קניין רוחני:</strong> המותג <span class="ltr">SUNSTOCK</span>, סימן המסחר והמוניטין של השותפות יהיו בבעלות השותפות. המותגים הקיימים של כל צד נשארים בבעלותו.</p>
  </section>

  <section id="s7">
    <h2>7. תקופה, סיום ויישוב סכסוכים</h2>
    <p>השותפות מוקמת לתקופה בלתי מוגבלת, עם תקופת נעילה של <span class="blank"></span> שנים שבה אף צד לא יוכל לצאת או למכור את חלקו.</p>
    <table>
      <thead><tr><th style="width:28%">מצב</th><th>מנגנון</th></tr></thead>
      <tbody>
        <tr><td>זכות סירוב ראשונה</td><td>צד המבקש למכור את חלקו יציע אותו תחילה לצד השני, באותם תנאים, לתקופה של 60 יום</td></tr>
        <tr><td>מבוי סתום</td><td>הידברות בין המנכ"לים של שני הצדדים למשך 30 יום; בהיעדר הסכמה — גישור; ואז מנגנון קנייה/מכירה (<span class="ltr">BMBY</span>): צד אחד נוקב מחיר, השני בוחר אם לקנות או למכור במחיר זה</td></tr>
        <tr><td>הפרה יסודית</td><td>התראה בכתב ו-30 יום לתיקון; לא תוקנה — הצד הנפגע רשאי לרכוש את חלק המפר בהנחה של <span class="blank"></span>% משווי הערכה</td></tr>
        <tr><td>הפסקת אספקה משנל</td><td>אי-אספקה במחיר עלות למשך מעל <span class="blank"></span> ימים תיחשב הפרה יסודית, אלא אם נובעת מכוח עליון או מהיצרן</td></tr>
        <tr><td>עזיבת ברק את התפעול</td><td>הודעה מראש של <span class="blank"></span> חודשים ותקופת חפיפה להעברת הניהול</td></tr>
        <tr><td>עריכת שווי</td><td>רו"ח או מעריך בלתי תלוי שייבחר בהסכמה; בהיעדר הסכמה — כל צד ממנה מעריך והשניים ממנים שלישי מכריע</td></tr>
        <tr><td>פירוק</td><td>מכירת המלאי והציוד, פירעון התחייבויות, חלוקת היתרה 50/50</td></tr>
      </tbody>
    </table>
    <p><strong>יישוב סכסוכים:</strong> מחלוקת שלא תיפתר במשא ומתן ישיר תועבר לגישור, ולאחריו לבורר יחיד שימונה בהסכמה או, בהיעדרה, על ידי ראש לשכת עורכי הדין.
      הדין החל הוא הדין הישראלי וסמכות השיפוט הייחודית נתונה לבתי המשפט ב<span class="blank"></span>.</p>
  </section>

  <section id="s8">
    <h2>8. לוח זמנים, תנאים מתלים וחתימות</h2>
    <p>הצדדים יפעלו לחתימת הסכם שותפות מפורט תוך 60 יום מחתימת מסמך זה. עד לחתימתו, רק סעיפי הסודיות והבלעדיות במשא ומתן מחייבים.</p>
    <table>
      <thead><tr><th>שלב</th><th style="width:20%">אחראי</th><th style="width:16%">יעד</th></tr></thead>
      <tbody>
        <tr><td>חתימה על מזכר ההבנות</td><td>שני הצדדים</td><td>31.10.2026</td></tr>
        <tr><td>הצגת הסכמי הספקים עם <span class="ltr">Aiko</span>, לידר ו-<span class="ltr">CSEC</span> וחשבוניות לדוגמה</td><td>שנל</td><td>15.11.2026</td></tr>
        <tr><td>בדיקת נאותות הדדית (כספית ומשפטית)</td><td>שני הצדדים</td><td>30.11.2026</td></tr>
        <tr><td>תכנית עסקית ותקציב הקמה למפעל ולמחסן</td><td>ברק</td><td>30.11.2026</td></tr>
        <tr><td>חתימת הסכם שותפות מפורט ורישום התאגיד</td><td>שני הצדדים</td><td>31.12.2026</td></tr>
      </tbody>
    </table>
    <h3>תנאים מתלים להסכם המפורט</h3>
    <ul>
      <li>אישור בכתב מהמותגים <span class="ltr">Aiko</span>, לידר ו-<span class="ltr">CSEC</span> (או מהמפיצים שלהם) ששנל רשאית להעניק בלעדיות ומחיר עלות לשותפות</li>
      <li>השלמת בדיקת נאותות לשביעות רצון שני הצדדים</li>
      <li>אישור תכנית עסקית ותקציב הקמה על ידי שני הצדדים</li>
      <li>אישורים רגולטוריים נדרשים למפעל (רישוי עסק, תקן מכון התקנים לפי הצורך)</li>
      <li>חוות דעת מיסויית על מבנה התאגיד הנבחר</li>
    </ul>
    <div class="note"><span class="badge warn">לתשומת לב</span>
      מסמך זה אינו מהווה הסכם מחייב למעט סעיפי הסודיות והבלעדיות במשא ומתן. ההסכם המפורט ייערך על ידי עורכי הדין של הצדדים.</div>
    <h3>חתימות</h3>
    <table class="sign">
      <thead><tr><th style="width:22%"></th><th><img src="LOGOBEE" alt="B.E.E" />ברק הנדסת חשמל</th><th><img src="LOGOSNL" alt="SNL Energy" />שנל אנרגיה</th></tr></thead>
      <tbody>
        <tr><td>שם החותם</td><td></td><td></td></tr>
        <tr><td>תפקיד</td><td></td><td></td></tr>
        <tr><td>חתימה וחותמת</td><td></td><td></td></tr>
        <tr><td>תאריך</td><td></td><td></td></tr>
      </tbody>
    </table>
  </section>

  <footer>מזכר הבנות · ברק הנדסת חשמל × שנל אנרגיה · שם עבודה: SUNSTOCK · גרסה 1.0 · 17.10.2026 · טיוטה לדיון</footer>
</div>
</body>
</html>
'''
import sys
fontdir, banner, out, lbee, lsnl = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
open(out,'w',encoding='utf-8').write(HTML.replace('FONTDIR',fontdir).replace('BANNER',banner).replace('LOGOBEE',lbee).replace('LOGOSNL',lsnl))
print('wrote', out)
