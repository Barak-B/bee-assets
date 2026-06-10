# WhatsApp Contacts Export Helper

**Source:** phase-1-final-status.md §Phase 1.5 #3 (fill 21 missing phones in roster)
**Time:** ~1h
**Risk:** 🟢 low (read-only sqlite query on existing workspace.db)
**Output:** CSV/JSON ready to merge into roster.yaml

## ה-context

`roster.yaml.populated` יש 21 phones + 17 emails חסרים אצל contractors. ה-workspace.db של WhatsApp מכיל את כל הצ'אטים — שמות + מספרים. אפשר לחלץ אוטומטית.

⚠️ **Privacy note:** ה-DB מכיל את כל ההיסטוריה. סקריפט זה **לא** קורא תוכן הודעות — רק chat_id (= מספר טלפון) + name (אם מסופק) + last_message_timestamp.

## ה-script

```powershell
# Save as: E:\Desktop\OpenClawAgent\wa-contacts-export.ps1
# Run from: regular PowerShell (not Claude session)

param(
    [string]$WorkspaceDb = "$env:LOCALAPPDATA\hermes\hermes-agent\workspace.db",
    [string]$OutCsv = "$env:USERPROFILE\Desktop\wa-contacts.csv",
    [int]$MinMessages = 5,
    [int]$DaysActive = 365
)

if (-not (Test-Path $WorkspaceDb)) {
    Write-Error "workspace.db not found at $WorkspaceDb"
    exit 1
}

# Make a read-only copy so we don't corrupt live DB
$tempDb = "$env:TEMP\wa-snapshot-$(Get-Date -Format yyyyMMdd-HHmmss).db"
Copy-Item $WorkspaceDb $tempDb

# Query — list contacts (1-on-1 chats), not groups
$query = @"
SELECT
  chat_id,
  COALESCE(display_name, name, chat_id) AS name,
  COALESCE(last_message_at, 0) AS last_msg,
  COALESCE(message_count, 0) AS messages
FROM chats
WHERE chat_id LIKE '%@s.whatsapp.net'    -- 1-on-1 only, not @g.us
  AND chat_id NOT LIKE '%status@%'
  AND COALESCE(message_count, 0) >= $MinMessages
  AND COALESCE(last_message_at, 0) > strftime('%s', 'now') - ($DaysActive * 86400)
ORDER BY last_message_at DESC;
"@

$rows = sqlite3 $tempDb $query | ForEach-Object {
    $parts = $_ -split '\|'
    [PSCustomObject]@{
        chat_id  = $parts[0]
        name     = $parts[1]
        phone_e164 = "+" + ($parts[0] -replace '@s\.whatsapp\.net$', '')
        last_msg = [DateTimeOffset]::FromUnixTimeSeconds([int64]$parts[2]).LocalDateTime
        messages = $parts[3]
    }
}

# Export CSV
$rows | Export-Csv -Path $OutCsv -NoTypeInformation -Encoding UTF8

Write-Host "Exported $($rows.Count) contacts to $OutCsv"
Remove-Item $tempDb

# Optional: filter by name-match against roster TODOs
$rosterTodos = @("Roni", "Haitam", "Fares", "Avraham", "Slava", "Shahar", "Vicky", "Shlomi T", "Dror")
$matches = $rows | Where-Object {
    $name = $_.name
    $rosterTodos | Where-Object { $name -like "*$_*" -or $name -match $_ }
}
if ($matches) {
    Write-Host "`nPossible roster matches:"
    $matches | Format-Table chat_id, name, phone_e164, messages
}
```

## כיצד להריץ

```powershell
cd E:\Desktop\OpenClawAgent
.\wa-contacts-export.ps1
```

**Output:** `~\Desktop\wa-contacts.csv` עם כל ה-1-on-1 contacts פעילים (>5 הודעות, פעילים בשנה האחרונה).

## כיצד למזג ל-roster

### אופציה A: ידני (5-15 דקות)

1. פתח את ה-CSV ב-Excel
2. סנן לפי name match → contractors שב-roster ללא phone
3. העתק phone_e164 → roster.yaml

### אופציה B: סקריפט (יותר אוטומטי)

צור `merge-wa-to-roster.js`:

```javascript
import { readFileSync, writeFileSync } from "node:fs";
import yaml from "yaml";
import { parse } from "csv-parse/sync";

const roster = yaml.parse(readFileSync("roster.yaml", "utf-8"));
const csvText = readFileSync("wa-contacts.csv", "utf-8");
const contacts = parse(csvText, { columns: true });

const todos = [...roster.contractors, ...roster.employees].filter(
  (p) => !p.phone
);

for (const person of todos) {
  // Fuzzy match by Hebrew name
  const match = contacts.find((c) =>
    c.name.includes(person.name_he) ||
    (person.name_en && c.name.toLowerCase().includes(person.name_en.toLowerCase()))
  );
  if (match) {
    person.phone = match.phone_e164;
    person.phone_source = "wa-contacts-export";
    console.log(`Matched: ${person.id} → ${match.phone_e164} (${match.name})`);
  }
}

writeFileSync("roster.yaml", yaml.stringify(roster));
```

הרץ:
```powershell
node merge-wa-to-roster.js
```

## Verification

```powershell
# Count filled phones
$roster = ConvertFrom-Yaml (Get-Content C:\Users\Barak\.openclaw\workspace\roster.yaml -Raw)
$roster.contractors | Where-Object { $_.phone } | Measure-Object | Select-Object -Expand Count
# Expected: was 0, now 5-9 of 9 contractors filled
```

## Rollback

```powershell
# A backup is made by the populated script — restore:
Copy-Item C:\Users\Barak\.openclaw\workspace\roster.yaml.bak `
          C:\Users\Barak\.openclaw\workspace\roster.yaml
```

## Privacy / legal note

The script only reads:
- chat_id (= phone number — already known by Barak as he's the chat participant)
- display_name / name (set by the contact themselves or by Barak)
- message_count + last_message_at (metadata, not content)

This is **internal-only** use (single-user export). NOT external sharing. Under PPL Amendment 13 (Aug 2025), this is fine — no AI training, no cross-border transfer.

Do NOT extend this to read message content without Barak's explicit instruction.

## What this unblocks

After running:
- roster.yaml fills ~9 contractor phones automatically
- alfred-identity.resolveByPhone() works for previously-anonymous incoming WA messages
- entity resolution rate jumps from ~50% to ~85%
- Phase 2's KG :Person seeding becomes 90% covered (vs 50% today)
