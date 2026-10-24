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

סיכון שנותר: auto-update של ה-marketplace כבוי כברירת מחדל ל-marketplaces חיצוניים, ועדיף להשאיר כך ולעדכן ידנית אחרי קריאת ה-diff.

## מה הותקן בריפו

`.claude/settings.json` מצהיר על ה-marketplace ומפעיל את הפלאגין ברמת פרויקט. כל מי שפותח את bee-assets ב-Claude Code במחשב שלו צריך להריץ **פעם אחת**:

```bash
claude plugin install claudex-loop@claudex-loop --scope project
```

(ההצהרה בריפו מדליקה את הפלאגין אבל לא מורידה אותו; הפקודה מורידה.)

התקנה אישית בכל פרויקט (במקום רק ב-bee-assets):

```text
/plugin marketplace add chaseai-yt/claudex-loop
/plugin install claudex-loop@claudex-loop
```

ב-Codex: `cp -R skills/. ~/.agents/skills/` מתוך clone של הריפו (או ה-PowerShell המקביל מה-README).

הערה: סשנים בענן (claude.ai/code) לא טוענים פלאגינים מ-`.claude/settings.json` של הריפו, ו-Codex CLI לא מותקן שם. הלופ המלא מיועד למחשב המקומי.

## שימוש

- המלצת ניתוב בלבד: `השתמש ב-claudex-route כדי להחליט מי יטפל ב-X`
- סקירת תוכנית קיימת: `claudex-loop mode=review plan=docs/plan/xx.md`
- לופ מלא עם בנייה ובדיקה צולבת: `claudex this plan` או `claudex-loop` עם `rounds=3`, `builder=codex` לפי הצורך.

לפני הרצה ראשונה במחשב המקומי: לוודא ש-`codex --version` ו-`claude --version` עובדים ושניהם מחוברים (login). הגרסה שנבדקה על ידי המחבר: Codex CLI 0.153.4, Claude Code 2.1.261.
