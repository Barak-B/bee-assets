# גישה ישירה למחשב ברק — כדי שמקס/סוכנים יעשו במקומך

> **המצב היום:** Cloud Agent רץ על VM של Cursor בענן. אין לו `E:\`, אין Tailscale, אין SSH ל-Windows שלך.
> לכן כל `hermes gateway restart` דורש copy-paste.
>
> **היעד:** סוכן עם shell על המכונה שלך — בלי שתעתיק פקודות.

---

## אפשרות A — הכי מהיר (מומלץ עכשיו): Cursor Desktop Agent מקומי

1. במחשב Windows: פתח **Cursor Desktop** (לא cursor.com/agents).
2. Open folder: `E:\bee-assets` (branch `cursor/hive-cortex-platform-634e`).
3. פתח Agent / Chat **מקומי** (לא Cloud).
4. כתוב:  
   `המשך מ-Max: הרץ hermes gateway restart, בדוק פורט 3100, שאל את Alfred על Mercantile/VAT דרך openclaw אם אפשר, דווח PASS/FAIL.`

הסוכן המקומי רואה את הדיסק ומריץ PowerShell אצלך.

**חסרון:** זה סשן נפרד מהענן.  
**יתרון:** עובד מיד, בלי תשתית.

---

## אפשרות B — Cloud Agent שרץ *על* המחשב שלך (Private Worker)

כדי ש-cursor.com/agents ימשיך להיות הענן מבחינתך, אבל הביצוע יהיה על Windows:

1. התקן [Cursor Private Worker / self-hosted cloud agent](https://cursor.com/docs) על ה-PC (אם זמין בחשבון שלך).
2. חבר את ה-Environment `Barak-B/bee-assets` ל-worker המקומי.
3. הריצות הבאות עם worker מקומי יוכלו להריץ `hermes`, `git`, תיקוני YAML.

זה הפתרון הנכון לטווח ארוך ל־"תעשה במקומי מהענן".

---

## אפשרות C — SSH דרך Tailscale (לענן שמחובר ל-tailnet)

רק אם תרצה ש-Cloud VM יתחבר ב-SSH:

### חד-פעמי אצלך (Admin PowerShell)

```powershell
pwsh -File E:\bee-assets\platform\connections\enable-remote-ssh.ps1
```

הסקריפט:
- מתקין/מפעיל OpenSSH Server
- מוודא Tailscale רץ
- מדפיס את כתובת Tailscale + פקודת `ssh` להדבקה ל-Max

### אחרי זה
תשלח לסוכן בענן:  
`ssh Barak@100.x.x.x` (ה-IP שיופיע) + מפתח.

**חשוב:** ה-Cloud VM של Cursor **לא** על Tailscale כרגע — בלי Tailscale על ה-pod או Funnel/Proxy, SSH ל-`100.x` ייכשל (בדקנו: ping ל-`100.90.97.36` נכשל מהענן).  
לכן אפשרות C דורשת גם חיבור הרשת (Tailscale subnet router / Funnel / worker מקומי). בלי זה — A או B.

---

## מה Max מורשה להריץ מרחוק (כשגישה קיימת)

רשימה לבנה — לא הכל:

| פעולה | מותר |
|---|---|
| `hermes gateway restart/stop/run` | ✅ |
| תיקון `config.yaml` + validate | ✅ |
| בדיקת פורטים 3000/3100/18789 | ✅ |
| `git` על `E:\bee-assets` | ✅ |
| קריאת `AGENTS.md` / `BEE_CANON.md` | ✅ |
| שליחת WhatsApp ללקוחות | ❌ Law #1 |
| מחיקת sessions / kill WA bridge בכוח | ❌ בלי אישור |
| שינוי secrets / API keys | ❌ בלי אישור מפורש |

---

## המלצה לברק עכשיו

1. **הערב:** אפשרות A — Agent מקומי ב-Cursor Desktop שיסיים `hermes gateway restart` + שאלת Alfred.  
2. **השבוע:** אפשרות B — Private Worker על ה-PC.  
3. אפשרות C — רק אם רוצים SSH אמיתי לענן (דורש רשת).

---

*נכתב אחרי שבדקנו: egress ענן פתוח לאינטרנט, אבל אין מסלול ל-Tailscale CGNAT מה-pod.*
