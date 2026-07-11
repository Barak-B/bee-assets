# חיבור המוח (BRAIN) לאובסידיאן

חבילת הגשר שמחברת את `research/BRAIN.md` (מקור האמת בגיט) אל ה־vault החי של ברק.

## מה כבר קיים

לולאת הסנכרון מוגדרת ב־`protocol_hive.md §6`:

```
git (research/**/*.md)  →  Obsidian vault (wikilinks)  →  Graphify (research/graphify-out/)
```

- **המוח / hub:** `[[BRAIN]]` — `research/BRAIN.md`
- **יעד ב־vault:** `3-Projects\BEE\` בתוך
  `E:\Desktop\ברק\תוכנות\תכנות וAI\obsidian\Barak-v-obsidian\`
  (ראו `research/PATHS.md` — לעולם לא לנחש נתיב)
- **סקריפט Windows:** `research/scripts/sync-vault-and-graphify.ps1`
- **סקריפט Bash/WSL:** `research/scripts/sync-vault-and-graphify.sh`
- **Hook אחרי commit:** `research/scripts/install-git-hooks.ps1` (פעם אחת במחשב המקומי)

## התקנה חד־פעמית (במחשב של ברק)

### אפשרות A — vault הקיים (מומלץ)

1. ודא שה־vault נפתח באובסידיאן בנתיב מ־`PATHS.md`.
2. מתוך clone של `bee-assets`:

```powershell
cd E:\bee-assets   # או הנתיב האמיתי של ה-clone
git pull
pwsh research/scripts/sync-vault-and-graphify.ps1 -DryRun   # בדיקה
pwsh research/scripts/sync-vault-and-graphify.ps1 -SkipGraphify
pwsh research/scripts/install-git-hooks.ps1                  # סנכרון אוטומטי אחרי כל commit
```

3. באובסידיאן: חפש `BRAIN` / `מוח` → פתח את הערה → זה ה־MOC.

אם הנתיב בעברית מציק ל־encoding, הגדר override:

```powershell
setx BEE_VAULT_BEE_DIR "E:\Desktop\...\Barak-v-obsidian\3-Projects\BEE"
```

### אפשרות B — vault נייד מהריפו

התיקייה הזו (`obsidian-vault/`) כוללת הגדרות `.obsidian` מינימליות.
אחרי סנכרון אפשר גם לפתוח באובסידיאן את תיקיית היעד המקומית
(או mirror זמני) שנוצרת ע״י הסקריפט.

```bash
# WSL / Linux — dry-run (לא נוגע ב-E:\)
export BEE_VAULT_BEE_DIR="/tmp/bee-obsidian-mirror"
bash research/scripts/sync-vault-and-graphify.sh --skip-graphify
```

## כללי בטיחות

- **גיט הוא מקור האמת.** עריכות באובסידיאן שנשמרו מאוחר יותר מהקובץ בריפו **לא נדרסות** — הסקריפט משאיר אותן ומזהיר.
- עריכות שרוצים לשמור → להעתיק חזרה ל־`research/` ולבצע commit.
- הענן (cloud cortex) **לא יכול** להגיע ל־vault — רק לכתוב לגיט. הסנכרון רץ מקומית.

## קישורי hub מהמוח

אחרי הסנכרון, מ־`[[BRAIN]]` אמורים להיפתח:

- `[[protocol_hive]]` · `[[PATHS]]` · `[[AGENT_CANON]]`
- `[[Wave_53_Unified_Data_Spine]]` · `[[MVP_Build_Plan]]` · `[[decisions-2026-06-16]]`
- LLDs · knowledge-base · Graphify / Alfred / Hermes

ראה גם: `00-START-HERE.md` · `research/scripts/WIRE_AGENTS_TO_CANON.md`
