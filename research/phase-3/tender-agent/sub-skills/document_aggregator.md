# sub-skill: document_aggregator

**Parent:** tender-agent (FULL)
**Purpose:** Build the required-documents checklist for a tender, gather what BEE already has, flag what's missing.

## Inputs

```json
{
  "tender_id": "tender_xyz",
  "required_documents": ["company registration", "professional insurance",
    "electrical contractor license", "3 reference letters", "financial statements 2y",
    "ISO certificates", "tax clearance (אישור ניכוי מס)"]
}
```

## Process

```
1. For each required doc, check BEE document store:
   - ~/.openclaw/workspace/docs/legal/ (company registration, licenses)
   - ~/.openclaw/workspace/docs/insurance/ (current policies)
   - ~/.openclaw/workspace/docs/financials/ (statements)
   - Google Drive bee-shared/legal/
   - BEE app document attachments

2. Validity check:
   - Insurance: not expired? coverage >= tender minimum?
   - Tax clearance (אישור ניכוי מס): issued within validity window (usually 1y)?
   - License: current?

3. Reference letters:
   - Pull candidate references from KG :Customer (high health score, completed projects)
   - Suggest 3 best (Rafael Solar, Palar, חכל שדרות — large, satisfied)
   - Draft request message if letter not on file

4. Auto-generatable docs:
   - Cover letter → draft_preparer
   - Capability statement → generate from KG project history
   - Bid bond → flag (Barak arranges with bank)

5. Output gathered package + gap list
```

## Output

```json
{
  "tender_id": "tender_xyz",
  "checklist": [
    {"doc": "company registration", "status": "on-file", "path": "docs/legal/reg.pdf", "valid": true},
    {"doc": "professional insurance", "status": "on-file", "valid": true,
     "expires": "2026-11-30", "coverage_nis": 4000000, "meets_min": true},
    {"doc": "electrical contractor license", "status": "on-file", "valid": true},
    {"doc": "tax clearance", "status": "EXPIRED", "valid": false,
     "action": "Request fresh אישור ניכוי מס from accountant"},
    {"doc": "3 reference letters", "status": "partial", "have": 1, "need": 2,
     "suggested": ["Rafael Solar", "Palar"], "action": "Request letters"},
    {"doc": "financial statements 2y", "status": "on-file", "valid": true},
    {"doc": "ISO certificates", "status": "MISSING", "valid": false,
     "action": "BEE not ISO certified — check if mandatory or scored"}
  ],
  "package_folder": "tender-<id>-package/",
  "ready_docs": 4,
  "missing_or_expired": 3,
  "barak_actions": [
    "Get fresh tax clearance (אישור ניכוי מס) from accountant",
    "Request 2 reference letters (Rafael Solar + Palar)",
    "Decide ISO gap: disqualifying or just scored?"
  ]
}
```

## Approval gate

Agent gathers + drafts requests. Barak sends reference-letter requests (relationship-sensitive) + obtains tax clearance (accountant). No auto-send to customers for references without Barak.

## Tests
1. Full checklist for a real tender → status per doc
2. Expired insurance → flagged with action
3. Reference letter suggestions → top 3 by health score
4. Tax clearance validity window check
5. Missing ISO → flagged, asks if mandatory
6. Package folder assembled with available docs
