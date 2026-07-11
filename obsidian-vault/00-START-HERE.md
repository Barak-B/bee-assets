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

## חשוב

1. **לא מ־`C:\Users\Barak`** — הסקריפטים בתוך `E:\bee-assets`.
2. אם `git checkout` נכשל בגלל שינויים מקומיים — קודם **stash**, אחר כך checkout.

## אם אתה תקוע עכשיו (העתק־הדבק את כל הבלוק)

```powershell
cd E:\bee-assets

# שומר את השינויים המקומיים בצד (graphify-out / protocol_hive וכו')
git stash push -u -m "pre-brain-obsidian"

# עובר לענף עם הגשר + המוח
git fetch origin
git checkout cursor/brain-obsidian-bridge-436d
git pull origin cursor/brain-obsidian-bridge-436d

# מסנכרן ל־vault ומתקין hook
pwsh -File .\research\scripts\sync-vault-and-graphify.ps1 -SkipPull -SkipGraphify
pwsh -File .\research\scripts\install-git-hooks.ps1
```

אחרי זה באובסידיאן: חפש **`BRAIN`** או **`מוח`**.

לבדוק מה נשמר ב־stash:

```powershell
git stash list
# אם תרצה להחזיר (זהירות — עלול להתנגש):
# git stash pop
```

## אחרי שהענף כבר אצלך

```powershell
pwsh -File E:\bee-assets\research\scripts\connect-brain-to-obsidian.ps1
```

## מה זה הסנכרון?

| מקור | יעד |
|---|---|
| `bee-assets/research/**/*.md` | vault → `3-Projects/BEE/` |
| `[[BRAIN]]` | hub / MOC |
| Graphify | `research/graphify-out/` (אופציונלי) |

פרטים: [[README]] · [[PATHS]] · [[protocol_hive]]

## אל תעשה

- אל תריץ מ־home בלי `cd E:\bee-assets`
- אל תדביק מילולית `<הנתיב-שמצאת>` — זה היה placeholder
- אל תריץ `graphify hook install` על הריפו הזה — יש `install-git-hooks.ps1`
