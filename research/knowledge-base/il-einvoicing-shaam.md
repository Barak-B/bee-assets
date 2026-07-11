# חשבוניות ישראל / מספר הקצאה — e-Invoicing Allocation Numbers

> Researched 2026-06-15 (cloud session, WebSearch). Confidence tags per `README.md`.
> **Direct relevance to BEE:** Invoice Maven outputs invoices; above the threshold each tax invoice needs an allocation number (מספר הקצאה) from רשות המסים or the customer cannot deduct input VAT. This is a HARD compliance gate. Feeds Wave 53 bank-receipts reconciliation + `alfred-deadlines.js`.

## What it is

`[SECONDARY]` מספר הקצאה = a digital stamp / unique serial issued by רשות המסים via the **חשבוניות ישראל** online system after the transaction is reported. It must appear on the original tax invoice. Without it, when required, the invoice is **not valid for the customer's input-VAT (קיזוז מס תשומות) deduction** — even if the transaction genuinely happened.
Sources: [greeninvoice](https://www.greeninvoice.co.il/magazine/israel-invoice/), [iCount](https://www.icount.co.il/blog/invoice-israel/), [govextra (official)](https://govextra.gov.il/taxes/innovation/home/israel-invoices/)

## Threshold schedule (NIS, before VAT) — ⚠️ CONFLICT

`[CONFLICT]` Two reputable secondary sources disagree on the 2026 figure. **Do NOT set BEE's invoice automation threshold from this file — confirm with Barak's רו"ח first.**

| Date | Source A (invoice4u/greeninvoice) | Source B (grow.business aggregation) |
|---|---|---|
| 2024 | first year, requests auto-approved | 25,000 |
| 2025 | — | 20,000 |
| **1.1.2026** | **10,000** | 15,000 |
| **1.6.2026** | **5,000** | — |
| 2027 | — | 10,000 |
| 2028 | — | 5,000 |

- Source A: [invoice4u](https://www.invoice4u.co.il/blog/חשבוניות-לישראל/) — "מ-1.1.2026 חובת ההקצאה חלה על כל חשבונית מעל 10,000 ₪ לפני מע"מ, ומ-1.6.2026 הסף יורד ל-5,000 ₪"
- Source B: [grow.business](https://grow.business/israel-invoice/) — "2026 – 15,000 ₪ ... 2027 – 10,000 ₪ ... 2028 – 5,000 ₪"
- ynet (2024 launch): ["מסכום של 25 אלף שקל"](https://www.ynet.co.il/economy/article/3ugy2cbdu) — corroborates Source A's 2024=25,000 start.

**`[ASSUMPTION — UNVERIFIED, do NOT hardcode]` Working assumption for BEE (lowest-risk):** treat **5,000 ₪** as the binding threshold from mid-2026 onward — i.e., assume the stricter interpretation so no invoice is under-protected. **This number is NOT `[VERIFIED]`; the sources CONFLICT (above). Do not set BEE's threshold constant from this line — confirm exact dates + amount with רו"ח first.** Mitigating fact: most of BEE's commercial invoices (avg deal ~₪40K) are well above *any* candidate threshold, so **in practice nearly every BEE tax invoice needs an allocation number in 2026** regardless of which threshold is correct — which is why the system flags by allocation-number presence, not by a hardcoded amount.

## Approval process

`[SECONDARY]`
- 2024: every allocation request auto-approved (grace year).
- From 2025: each request evaluated against criteria to confirm it's a real transaction.
- Mechanism: accounting software (Invoice Maven, iCount, Green Invoice, SUMIT, Cardcom) connects to רשות המסים via the מערכת חשבוניות ישראל API and pulls the number automatically at invoice issue time.
Source: [SUMIT — automatic allocation-number connection guide](https://help.sumit.co.il/he/articles/8267195)

## BEE action items

- `[OPEN]` **Verify Invoice Maven supports SHAAM allocation numbers** and is connected to the API. If it doesn't, every above-threshold BEE invoice in 2026 risks rejection for the customer's VAT deduction → migration needed (this is the long-standing open question from master-plan v4).
- `[OPEN]` Confirm exact 2026 threshold + dates with רו"ח (resolves the CONFLICT above).
- `[OPEN]` Research the SHAAM API spec → so Wave 53 bank-receipts reconciliation can match `invoiceMavenId` ↔ allocation number ↔ bank receipt.

## Sources
- [Green Invoice — מודל חשבוניות ישראל (2026)](https://www.greeninvoice.co.il/magazine/israel-invoice/)
- [invoice4u — מספר הקצאה 2026](https://www.invoice4u.co.il/blog/מתי-חשבונית-חייבת-במספר-הקצאה/)
- [govextra (רשות המסים, official)](https://govextra.gov.il/taxes/innovation/home/israel-invoices/)
- [iCount — חשבוניות ישראל](https://www.icount.co.il/blog/invoice-israel/)
- [SUMIT — automatic allocation](https://help.sumit.co.il/he/articles/8267195)
- [ynet — 2024 launch at ₪25K](https://www.ynet.co.il/economy/article/3ugy2cbdu)
