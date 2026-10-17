# sub-skill: draft_preparer

**Parent:** tender-agent (FULL)
**Purpose:** Draft a Hebrew RFP response from BEE's capabilities + the tender requirements. Barak finalizes + signs.

## Inputs

```json
{
  "tender_id": "tender_xyz",
  "tender_requirements": "<parsed from RFP doc — scope, specs, eval criteria>",
  "bee_capabilities": "<from a capabilities profile — past projects, certs, capacity>",
  "similar_won_tenders": "<from KG — previous winning responses>"
}
```

## Process

```
1. Parse RFP into requirement checklist:
   - Technical scope (what system, what capacity)
   - Eligibility (certifications, insurance, past experience minimums)
   - Evaluation criteria (price weight vs quality weight)
   - Submission format (forms, appendices)

2. Map BEE capabilities to each requirement:
   - "מינימום 5 פרויקטים מעל 100kWp" → cite Rafael Solar (10.7MW), Palar (5.6MW)
   - "רישיון חשמלאי בודק" → Barak's license
   - "ביטוח אחריות מקצועית" → from document_aggregator
   - Gaps → flag to Barak ("we don't meet requirement X")

3. Draft technical response (Hebrew):
   - Methodology section
   - Proposed solution (link to engineering-agent design if site known)
   - Team + qualifications
   - Past performance (cite KG :Project history)
   - Timeline

4. Draft commercial response:
   - Pull pricing from proposal-generator engine
   - Format per tender's required price breakdown
   - ⚠️ Pricing = DRAFT — Barak finalizes (binding offer)

5. Assemble per tender's required format:
   - Fill official forms (if fillable PDF)
   - Order appendices as specified
   - Generate cover letter (Hebrew)
```

## Output

```json
{
  "tender_id": "tender_xyz",
  "requirement_coverage": [
    {"req": "5 projects >100kWp", "met": true, "evidence": "Rafael, Palar, חכל שדרות"},
    {"req": "professional insurance ₪2M", "met": "pending", "evidence": "document_aggregator gathering"},
    {"req": "ISO 9001", "met": false, "evidence": "BEE not ISO certified — GAP, flag Barak"}
  ],
  "draft_documents": {
    "technical_response_docx": "tender-<id>-technical.docx",
    "commercial_response_docx": "tender-<id>-commercial.docx",
    "cover_letter_docx": "tender-<id>-cover.docx"
  },
  "pricing_draft": {
    "total_bid_nis": 890000,
    "DRAFT": "Barak must finalize — binding offer",
    "margin_at_this_price_pct": 22
  },
  "gaps_flagged": ["ISO 9001 not held — may disqualify or need waiver"],
  "barak_action_required": "Review technical + FINALIZE pricing + sign + submit"
}
```

## Approval gate

The whole point: agent **drafts**, Barak **commits**. A tender response is a
**legally binding offer**. The agent never submits, never finalizes price.

## Hebrew quality

Uses Claude Sonnet (high-quality routing). RFP responses are formal Hebrew —
must be polished. NOT DeepSeek-flash for this.

## Learning loop

Won tenders → their winning responses stored in KG → future drafts reference
what worked. Lost tenders → reason analyzed (price? missing cert? weak technical?)
→ improve next draft.

## Tests
1. Parse a real Kiryat Gat RFP → requirement checklist
2. Map BEE capabilities → coverage report with gaps
3. Draft Hebrew technical response → formal, complete
4. Pricing draft → clearly marked DRAFT, Barak-finalize
5. Gap detection → flags ISO/cert it doesn't have
6. Assembles per required submission format
