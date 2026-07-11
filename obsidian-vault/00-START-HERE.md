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

## חשוב: לא מ־`C:\Users\Barak`

הסקריפטים חיים **בתוך** ה־clone של `bee-assets`. אם אתה ב־home folder, PowerShell לא מוצא אותם.

נתיב קנוני (מ־[[PATHS]]): `E:\bee-assets`

## צעדים (העתק־הדבק)

### אפשרות מהירה (מומלץ) — מכל מקום

```powershell
pwsh -File E:\bee-assets\research\scripts\connect-brain-to-obsidian.ps1
```

אם ה־clone במקום אחר:

```powershell
pwsh -File E:\bee-assets\research\scripts\connect-brain-to-obsidian.ps1 -RepoRoot "D:\path\to\bee-assets"
```

### ידני

```powershell
cd E:\bee-assets
git fetch origin
git checkout cursor/brain-obsidian-bridge-436d
git pull
pwsh -File .\research\scripts\sync-vault-and-graphify.ps1 -SkipGraphify
pwsh -File .\research\scripts\install-git-hooks.ps1
```

בדיקה יבשה לפני כתיבה ל־vault:

```powershell
cd E:\bee-assets
pwsh -File .\research\scripts\sync-vault-and-graphify.ps1 -DryRun -SkipGraphify
```

2. באובסידיאן, תחת `3-Projects/BEE/`, פתח **`BRAIN`** (או חפש `מוח`).
3. גרף הקישורים (`Graph view`) אמור להראות את `BRAIN` כמרכז.

## מה זה הסנכרון?

| מקור | יעד |
|---|---|
| `bee-assets/research/**/*.md` | vault → `3-Projects/BEE/` |
| `[[BRAIN]]` | hub / MOC |
| Graphify | `research/graphify-out/` (אופציונלי; דורש `graphify` + מפתח) |

פרטים מלאים: [[README]] בתיקייה הזו · [[PATHS]] · [[protocol_hive]]

## אל תעשה

- אל תריץ את הסקריפט מ־`C:\Users\Barak` בלי `cd` לריפו
- אל תנחש נתיבים — רק מ־[[PATHS]]
- אל תמחק עריכות ידניות ב־vault בלי לבדוק — הסקריפט שומר קבצים חדשים יותר ב־vault
- אל תריץ `graphify hook install` על הריפו הזה — יש hook מותאם (`install-git-hooks.ps1`)
