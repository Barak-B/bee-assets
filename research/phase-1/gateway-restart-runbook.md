# Gateway Restart Runbook — Fix DEEPSEEK_API_KEY env-var trap

**זמן:** ~5 דקות
**סיכון:** 🟡 משבית את ה-gateway ל-30 שניות. cron jobs באותה דקה ידחו ל-קצה הבא.
**מתי לעשות:** **לא בעת cron עמוס** — עדיף לפני 06:00 או אחרי 23:30 (אז מעט אקטיביות).

## למה זה דרוש

ה-gateway (PID 22916, חי מ-2026-05-24) יורש `DEEPSEEK_API_KEY=...5d56` ב-Process scope מ-Claude PowerShell session ישן. זה key לא תקין שגורם ל-401 על DeepSeek בכל cron, וגם משפיע על routing fallback.

המסלול החדש של ה-router (Action #1) מתמודד עם זה אוטומטית (יפול ל-Google → Anthropic), אבל זה overhead מיותר. **תיקון אמיתי = להריץ את ה-gateway מ-shell בלי env trap.**

## בדיקה לפני

```powershell
# Confirm the env-var trap is still there:
Get-Process node | Where-Object { $_.Id -eq 22916 } | Select-Object Id, ProcessName, StartTime
# אם PID 22916 לא קיים — gateway רץ מאז עם PID חדש. בדוק:
netstat -ano | findstr ":18789"
# המספר האחרון בכל שורה = PID. נשתמש בו ב-Stop-Process.
```

## ביצוע (העתק-הדבק לתוך PowerShell **שאינו** Claude)

⚠️ **חשוב:** הרץ את זה ב-PowerShell **רגיל** (Start → Windows PowerShell), **לא** דרך Claude Code, כדי שה-env לא יזדהם שוב.

```powershell
# Step 1: Find the gateway PID
$gatewayPid = (Get-NetTCPConnection -LocalPort 18789 -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1
if (-not $gatewayPid) { "Gateway not running. Skip to Step 3."; return }
"Gateway PID: $gatewayPid"

# Step 2: Stop the old gateway
Stop-Process -Id $gatewayPid -Force
Start-Sleep -Seconds 2
"Gateway stopped."

# Step 3: Verify no DEEPSEEK_API_KEY in your shell (the new spawn point)
$env:DEEPSEEK_API_KEY
# אם יוצא טקסט — לנקות:
Remove-Item Env:DEEPSEEK_API_KEY -ErrorAction SilentlyContinue
# Verify clean:
"DEEPSEEK env: '$env:DEEPSEEK_API_KEY' (should be empty)"

# Step 4: Spawn fresh gateway with logging
$logPath = "$env:LOCALAPPDATA\Temp\openclaw\openclaw-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"
New-Item -ItemType Directory -Path (Split-Path $logPath) -Force | Out-Null

Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList @(
    "C:\Users\Barak\AppData\Roaming\npm\node_modules\openclaw\dist\index.js",
    "gateway",
    "--port", "18789"
  ) `
  -WindowStyle Hidden `
  -PassThru `
  -RedirectStandardOutput $logPath `
  -RedirectStandardError "$logPath.err"

Start-Sleep -Seconds 12
"Gateway restarted. Log: $logPath"

# Step 5: Health check
$health = Invoke-RestMethod -Uri "http://127.0.0.1:18789/health" -TimeoutSec 5
$health
```

## אימות הצלחה

אחרי הרסטרט (תוך 30 שניות):

```powershell
# בדוק שה-cron הראשון רץ הצלחה (יקח כמה דקות עד שיריץ):
openclaw cron runs --id 57700646-79dc-4449-ab58-c1f01ad8a6d7 --last 1
# אמור להחזיר "status: ok" ב-23:55

# בדוק שהאחזור עבר ל-anthropic תחילה (אם הסרת DeepSeek מ-env מצליח):
$jobs = Get-Content "C:\Users\Barak\.openclaw\cron\jobs.json" -Raw | ConvertFrom-Json
$jobs.jobs | Where-Object { $_.state.lastError -match "5d56" } | Measure-Object | Select-Object -ExpandProperty Count
# אמור להיות 0 (לא יותר 401-errors עם key 5d56)
```

## אם משהו נשבר

Rollback מהיר — gateway autostarts מ-Start Menu shortcut:

```powershell
# Open the Startup folder
Start-Process explorer.exe -ArgumentList "shell:Startup"
# Double-click "OpenClaw Gateway.cmd" — מתחיל את ה-gateway מחדש (אבל גם זה עלול לרשת env מהtemp Claude session...)
```

## מסקנה

זה תיקון 5-דקות אבל שובר 30 שניות של availability. עדיף לעשות מתי שלא אקטיבי. אחרי הרסטרט — ה-5 crons שהפעלתי יעבדו עם DeepSeek ישירות במקום fallback chain.

---

*נכתב 2026-05-26 — Phase 1 followup. Blocker B1 fix.*
