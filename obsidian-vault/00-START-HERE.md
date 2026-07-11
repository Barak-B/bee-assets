---
aliases:
  - התחל כאן
  - START
  - Obsidian Bridge
tags:
  - bee
  - onboarding
  - obsidian
---

# התחל כאן — מוח דינמי (BRAIN → Obsidian → Graphify)

המוח: `[[BRAIN]]` · דופק סנכרון: `[[SYNC_STATUS]]`

## מצב נוכחי אצלך (אחרי ההתקנה)

✅ vault mirror רץ · ✅ hook מותקן · 🟡 Graphify דולג בריצה הראשונה (`-SkipGraphify`)

## ודא שהלולאה חיה (העתק־הדבק)

```powershell
cd E:\bee-assets
git pull

# כפיית קבצי קנון (BRAIN/PATHS/protocol_hive/AGENT_CANON) + heartbeat
pwsh -File .\research\scripts\sync-vault-and-graphify.ps1 -SkipPull -ForceCanon

# בדיקת בריאות מלאה (PASS/WARN/FAIL)
pwsh -File .\research\scripts\verify-brain-sync.ps1
```

באובסידיאן: פתח `BRAIN`, ואז `SYNC_STATUS` — אמור להראות זמן סנכרון אחרון.

## Graphify (החלק החסר בלולאה)

אם `verify` אומר ש־graphify חסר / ישן:

```powershell
pip install "graphifyy[anthropic,openai]"
# הגדר DEEPSEEK_API_KEY לסשן (לא User-scope — ראה graphify-deployment README)
pwsh -File .\research\scripts\sync-vault-and-graphify.ps1 -SkipPull -ForceCanon
# בלי -SkipGraphify → extract אינקרמנטלי
```

ברירת המחדל של ה־hook אחרי commit: vault + graphify extract + `-ForceCanon` (בלי cluster היקר).

Vault-only (אם רוצים לחסוך API):

```powershell
setx BEE_HOOK_ARGS "-SkipPull -SkipGraphify -ForceCanon"
```

## סוכנים חיים (Alfred / Hermes) — אופציונלי

עדיין OFF כברירת מחדל. פירוט: `research/scripts/WIRE_AGENTS_TO_CANON.md`

## אל תעשה

- אל תדביק פלט שגיאות / באנרים של PowerShell חזרה לטרמינל
- אל תריץ מ־`C:\Users\Barak` בלי `cd E:\bee-assets`
- אל תריץ `graphify hook install` על הריפו — יש `install-git-hooks.ps1`
