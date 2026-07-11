# Phase 1 Action #5 — Gmail OAuth Recovery (Dual Account)

**Source:** master-plan-v1-v20.md v17 14.A.1 + v20 17.B (Q74 = "OAuth issue")  
**Time:** ~3h  
**Risk:** 🟡 medium — requires browser interaction, careful OAuth scope review

## ה-context

ה-`gmail-morning-digest` cron מנוטרל בגלל **OAuth issue** (Q74 confirmed by Barak).

ב-BEE יש 2 חשבונות Gmail (per v17 14.A.1):
1. **Primary** — 56K messages indexed (already wired in Alfred OAuth, currently broken)
2. **Secondary** — `barak-barzel@barak-e.com` (not wired yet — Action #16 in v17)

המטרה: לתקן את ה-primary + לחבר את ה-secondary.

---

## שלב 1: Diagnose מה בדיוק נשבר (15 min)

```powershell
# 1. בדוק קיום credentials
ls C:\Users\Barak\.openclaw\credentials\
ls C:\Users\Barak\.openclaw\secrets\

# 2. בדוק expiry של ה-token
# בוא נראה מה יש בקבצי credentials
Get-Content C:\Users\Barak\.openclaw\credentials\gmail-token.json | ConvertFrom-Json | Format-List

# Look for:
# - access_token (probably expired — that's OK, refresh_token should auto-renew)
# - refresh_token (CRITICAL — if missing/invalid, full reauth needed)
# - expiry (timestamp)

# 3. נסה ידני
cd E:\Desktop\OpenClawAgent
node alfred-gmail.js unread --max 3
# Expected output if OAuth OK: 3 unread messages or "no unread"
# Expected output if broken:
#   - "Token has been expired or revoked"
#   - "invalid_grant"
#   - 401 Unauthorized
#   - "Refresh token not found"
```

**Decision tree:**

| Symptom | Cause | Fix |
|---|---|---|
| `invalid_grant` | Refresh token revoked (e.g., password changed, 6m inactive) | Full reauth (שלב 2) |
| `access_denied` | Scope or consent revoked | Full reauth + re-consent |
| `quota_exceeded` | Hit Gmail API rate limit | Wait 24h + reduce poll frequency |
| 401 with valid refresh_token | Code bug in token refresh logic | Patch (שלב 4) |
| "Refresh token not found" | Lost token file | Full reauth |

---

## שלב 2: Full reauth — Primary account (45 min)

### 2.1 Backup existing tokens (just in case)

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item C:\Users\Barak\.openclaw\credentials\ -Destination "C:\backup\openclaw-credentials-$timestamp\" -Recurse
```

### 2.2 Verify Google Cloud Console state

1. Open https://console.cloud.google.com/
2. Select project (probably "bee-alfred" or similar)
3. APIs & Services → Credentials
4. Find OAuth 2.0 Client ID used by Alfred
5. Verify:
   - **Authorized redirect URIs** includes `http://localhost:8080` (or whatever Alfred listens on)
   - **OAuth consent screen** is in "Testing" or "Production" mode
   - **Test users** include `barak@bee.co.il` (your primary email)
6. Verify **Gmail API** enabled: APIs & Services → Library → search "Gmail API" → status "Enabled"

### 2.3 Trigger reauth flow

```powershell
cd E:\Desktop\OpenClawAgent

# If alfred-gmail.js has a built-in auth command:
node alfred-gmail.js auth

# OR if not, run a small auth helper:
node -e "
const {OAuth2Client} = require('google-auth-library');
const fs = require('fs');
const path = require('path');

const SECRETS = JSON.parse(fs.readFileSync('secrets/google-oauth-client.json'));
const oauth = new OAuth2Client(
  SECRETS.installed.client_id,
  SECRETS.installed.client_secret,
  'http://localhost:8080'
);

const url = oauth.generateAuthUrl({
  access_type: 'offline',          // CRITICAL — gets refresh_token
  prompt: 'consent',                // CRITICAL — forces fresh refresh_token
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify',
  ],
});

console.log('Open in browser:');
console.log(url);
console.log('After consent, paste code here:');

process.stdin.once('data', async (data) => {
  const code = data.toString().trim();
  const {tokens} = await oauth.getToken(code);
  fs.writeFileSync(
    'credentials/gmail-token.json',
    JSON.stringify(tokens, null, 2)
  );
  console.log('Saved:', tokens);
});
"
```

### 2.4 Verify

```powershell
node alfred-gmail.js unread --max 3
# Should now return messages, no errors
```

---

## שלב 3: Add Secondary account — `barak-barzel@barak-e.com` (45 min)

Two strategies:

### Option A: Same OAuth client, multiple tokens

```javascript
// Modify alfred-gmail.js to support multiple accounts
const ACCOUNTS = {
  primary: {
    label: "barak@bee.co.il",
    token_path: "credentials/gmail-token-primary.json",
  },
  secondary: {
    label: "barak-barzel@barak-e.com",
    token_path: "credentials/gmail-token-secondary.json",
  },
};

async function getMailClient(accountKey) {
  const account = ACCOUNTS[accountKey];
  const token = JSON.parse(fs.readFileSync(account.token_path));
  oauth.setCredentials(token);
  return google.gmail({ version: "v1", auth: oauth });
}

// Iterate both for unread digest:
for (const accountKey of Object.keys(ACCOUNTS)) {
  const gmail = await getMailClient(accountKey);
  const unread = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread newer_than:1d",
  });
  // Aggregate into single digest with account label
}
```

Rerun the OAuth flow from שלב 2.3 — BUT login to **barak-barzel@barak-e.com** when prompted instead of barak@bee.co.il. Save to `gmail-token-secondary.json`.

### Option B: Separate OAuth clients per Google account

Only needed if barak-barzel@barak-e.com is on a different Google Workspace org. Probably not — both are Barak's. Option A simpler.

---

## שלב 4: Update alfred-gmail.js (30 min)

If reauth fixes everything, no code changes needed. If you find refresh-logic bugs:

```javascript
// In alfred-gmail.js — robust refresh
async function ensureValidToken(oauth, tokenPath) {
  const expiry = oauth.credentials.expiry_date;
  if (!expiry || expiry < Date.now() + 5 * 60 * 1000) {
    // Less than 5min left — proactively refresh
    try {
      const { credentials } = await oauth.refreshAccessToken();
      fs.writeFileSync(tokenPath, JSON.stringify(credentials, null, 2));
      oauth.setCredentials(credentials);
    } catch (err) {
      if (err.message.includes("invalid_grant")) {
        throw new Error(
          `Refresh token revoked. Re-run OAuth flow: node alfred-gmail.js auth`
        );
      }
      throw err;
    }
  }
}
```

---

## שלב 5: Re-enable cron (5 min)

```powershell
openclaw cron enable gmail-morning-digest

# Verify
openclaw cron list | findstr gmail

# Manual trigger to test (don't wait until 08:00):
openclaw cron run gmail-morning-digest
```

---

## שלב 6: Verification (30 min)

| Check | Expected |
|---|---|
| `node alfred-gmail.js unread --max 5` | Returns 5 messages from primary |
| `node alfred-gmail.js unread --account secondary --max 5` | Returns from secondary (after Option A) |
| Next-day 08:00 digest arrives in self-chat | ✅ digest with unread count from both accounts |
| Log file `gmail-digest.log` | No errors |
| Cost monitor | Shows Gmail polling (~free, but logs API calls) |

---

## Rollback

```powershell
# Disable cron again
openclaw cron disable gmail-morning-digest

# Restore old credentials backup
Copy-Item C:\backup\openclaw-credentials-<timestamp>\* -Destination C:\Users\Barak\.openclaw\credentials\ -Recurse
```

---

## Notes

- **Gmail API quota:** Default 1B units/day per user — far more than 56K messages need.
- **Polling frequency:** Don't poll more often than every 5 minutes (rate limit + Google ToS).
- **Privacy:** OAuth scopes `gmail.readonly` + `gmail.modify` allow Alfred to read all your email + mark as read. **Never grant `gmail.send` without explicit need** (constitutional law: no outbound mass actions).
- **Multi-account warning:** Gmail OAuth tokens are per-Google-account, not per-app. Make sure refresh_tokens are stored separately.

---

## Next: Phase 2 Action #14

After Gmail working → in Phase 2 you'll wire Gmail messages to write back to BEE app (the paradigm shift from v19): each customer email auto-creates/updates `:Customer.last_contact` + extracts action items → `:Job` records.

For now: just get the digest flowing. Email → BEE pipeline is Phase 2+.
