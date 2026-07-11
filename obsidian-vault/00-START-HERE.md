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

# התחל כאן — חיבור המוח לאובסידיאן

זה דף הכניסה לחבילת הגשר. **המוח עצמו** הוא הערה `[[BRAIN]]`.

## צעדים (פעם אחת)

1. הרץ סנכרון מקומי (Windows):

```powershell
pwsh research/scripts/sync-vault-and-graphify.ps1 -DryRun
pwsh research/scripts/sync-vault-and-graphify.ps1 -SkipGraphify
pwsh research/scripts/install-git-hooks.ps1
```

2. באובסידיאן, תחת `3-Projects/BEE/`, פתח **`BRAIN`**.
3. גרף הקישורים (`Graph view`) אמור להראות את `BRAIN` כמרכז.

## מה זה הסנכרון?

| מקור | יעד |
|---|---|
| `bee-assets/research/**/*.md` | vault → `3-Projects/BEE/` |
| `[[BRAIN]]` | hub / MOC |
| Graphify | `research/graphify-out/` (אופציונלי; דורש `graphify` + מפתח) |

פרטים מלאים: [[README]] בתיקייה הזו · [[PATHS]] · [[protocol_hive]]

## אל תעשה

- אל תנחש נתיבים — רק מ־[[PATHS]]
- אל תמחק עריכות ידניות ב־vault בלי לבדוק — הסקריפט שומר קבצים חדשים יותר ב־vault
- אל תריץ `graphify hook install` על הריפו הזה — יש hook מותאם (`install-git-hooks.ps1`)
