# Claudex Loop — בדיקה והתקנה (2026-10-24)

מקור: <https://github.com/chaseai-yt/claudex-loop> (Chase AI, רישיון MIT, גרסה 2.1.0, commit `53cddc4`).

## מה זה

פלאגין ל-Claude Code ול-Codex שמריץ תכנון ובנייה עם **שני מודלים משני ספקים**: המודל בסשן הנוכחי כותב תוכנית, הספק השני סוקר אותה (APPROVED / REVISE / BLOCKED), ואחרי הבנייה הספק שלא בנה בודק את הקוד בסשן נקי. אישור תוכנית נקשר ל-SHA256 של הקובץ, כך ששינוי בתוכנית מבטל את האישור.

ארבעה skills:

| Skill | מה עושה | דורש |
|---|---|---|
| `claudex-route` | ממליץ איזה מודל/ספק מתאים למשימה ומבצע handoff אחד תחום | רק ה-CLI של הספק שנבחר, ורק אם מבקשים ביצוע |
| `claudex-loop` | הלופ המלא: דרישות → סקירת תוכנית → בנייה → בדיקה צולבת | Claude Code + Codex CLI מחוברים, Python 3.10+ |
| `codex-review` | כניסה מפורשת: Codex סוקר תוכנית קיימת | כמו `claudex-loop` |
| `codex-build` | כניסה מפורשת: Codex בונה, Claude בודק | כמו `claudex-loop` |

## מה נבדק לפני ההתקנה

- **אין hooks, אין שרתי MCP, אין binaries** — רק 4 קבצי SKILL.md, קובץ Python אחד (`runner.py`, ספרייה סטנדרטית בלבד) ומסמכי עזר. עלות הקשר קבועה: ~357 טוקנים לסשן.
- **אין רשת**: ה-runner לא פותח חיבורים ולא שולח נתונים לשום מקום. הוא רק מריץ את `claude` / `codex` כתהליכי בן עם stdin, ומריץ `git` לקריאת diff.
- **הרשאות**: סוקר Claude רץ עם `--safe-mode`, בלי MCP ועם `Read,Glob,Grep` בלבד. סוקר Codex רץ `exec -s read-only` עם plugins/apps/MCP מנוטרלים. אין שום `--dangerously-skip-permissions` או bypass; דחיית הרשאה נרשמת ככישלון ולא עוקפים אותה.
- **בדיקות**: `scripts/validate.py` עבר, ו-37 בדיקות יחידה (`python -m unittest discover -s tests`) עברו מקומית. `claude plugin validate` על העותק המותקן: עבר עם אזהרות בלבד.
- **מה כן נכתב מחוץ לפרויקט**: תיקיית אבחון זמנית (prompt, stdout, stderr, result.json) תחת temp של המערכת. לא להכניס אותה ל-git — היא עשויה להכיל קוד או תוכניות.

## מה הותקן בריפו

`.claude/settings.json` מצהיר על marketplace בשם `claudex-loop` ומפעיל את הפלאגין ברמת פרויקט. הפלאגין **נעוץ ל-commit שנבדק** (`53cddc42e39346fb8c6d5d612281a3b1add14e66`) דרך marketplace מסוג `settings` עם מקור `github` + `sha`. כך שינוי עתידי בריפו של המחבר לא נכנס לבד: מה שמותקן הוא בדיוק הקוד שנקרא כאן. (marketplace מסוג `github` מקבל רק branch או tag, ולריפו אין tags, ולכן לא היה אפשר לנעוץ אותו ישירות.)

**עדכון גרסה:** לקרוא את ה-diff בין ה-SHA הנוכחי לחדש ב-upstream, להחליף את `sha` (ואת `version` אם השתנה) ב-`.claude/settings.json`, ולעדכן את הסעיף "מה נבדק" כאן. לא להפעיל auto-update.

### התקנה במחשב מקומי (פעם אחת לכל מחשב)

1. לפתוח סשן Claude Code בתיקיית bee-assets ולאשר את דיאלוג ה-trust. הסשן רושם את ה-marketplace מתוך `.claude/settings.json` (בלי trust הוא לא נרשם).
2. להריץ:

```bash
claude plugin install claudex-loop@claudex-loop --scope project
```

3. לוודא: `claude plugin list` מציג `claudex-loop@claudex-loop`, גרסה 2.1.0, `enabled`.

נבדק על מחשב נקי (Claude Code 2.1.310): בלי שלב 1 ההתקנה נכשלת עם `Plugin "claudex-loop" not found in marketplace`; אחרי שלב 1 היא עוברת, וההתקנה נרשמת עם `gitCommitSha` של ה-commit הנעוץ והקבצים זהים ל-upstream.

התקנה אישית בכל פרויקט (במקום רק ב-bee-assets). שימו לב: הדרך הזו **לא נעוצה** ועוקבת אחרי ה-branch הראשי של המחבר:

```text
/plugin marketplace add chaseai-yt/claudex-loop
/plugin install claudex-loop@claudex-loop
```

ב-Codex: `cp -R skills/. ~/.agents/skills/` מתוך clone של הריפו (או ה-PowerShell המקביל מה-README).

הערה: בסשנים בענן (claude.ai/code) אין Codex CLI מחובר, ולכן הלופ המלא מיועד למחשב המקומי.

## איך זה משתלב במוח (תרשים הכוורת) בלי לשרוף טוקנים

הפלאגין הוא כלי **בקרת איכות** למשימות פיתוח של המוח, לא סוכן שרץ כל הזמן. עלות קבועה: רק תיאורי ה-skills (~357 טוקנים לסשן); גוף ה-skill נטען רק כשמפעילים אותו. העלות האמיתית היא כל קריאה ל-CLI של הספק השני (סשן מלא עם קריאת קוד), ולכן:

- **ניתוב (`claudex-route`) כברירת מחדל**: מחליט איזה מודל/ספק מתאים למשימה בלי להריץ CLI חיצוני, אלא אם מבקשים ביצוע. זה החלק שמתאים ל"מלכה" שמחלקת משימות לסוכנים.
- **סקירת תוכנית בלבד (`mode=review`)** לתוכניות עם סיכון: מנוע ה-CAD, הגשות לחח"י, מודל הנתונים, שינויים ב-CRM. עם `rounds=2` במקום ברירת המחדל 5.
- **לופ מלא (בנייה + בדיקה צולבת)** רק לשינויים שקשה לבדוק ידנית ושטעות בהם יקרה. ברירות המחדל `MAX_FIX_ROUNDS=2` ו-`MAX_INSPECTION_ROUNDS=2` כבר חוסמות לולאות אינסופיות.
- **לא להשתמש** למשימות שגרה של הכוורת (תיוג, סיכומים, עדכוני סטטוס, מסמכים קצרים): שם סקירה של מודל שני מכפילה עלות בלי תועלת.
- מודל ומאמץ: לא לנעוץ מודל יקר כברירת מחדל. לתת `reviewer_model` / `*_effort` רק כשהמשימה מצדיקה.

## שימוש

- המלצת ניתוב בלבד: `השתמש ב-claudex-route כדי להחליט מי יטפל ב-X`
- סקירת תוכנית קיימת: `claudex-loop mode=review plan=docs/plan/xx.md`
- לופ מלא עם בנייה ובדיקה צולבת: `claudex this plan` או `claudex-loop` עם `rounds=3`, `builder=codex` לפי הצורך.

לפני הרצה ראשונה במחשב המקומי: לוודא ש-`codex --version` ו-`claude --version` עובדים ושניהם מחוברים (login). הגרסה שנבדקה על ידי המחבר: Codex CLI 0.153.4, Claude Code 2.1.261.
