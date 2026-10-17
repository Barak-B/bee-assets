# sub-skill: bom_generator

**Parent:** engineering-agent
**Purpose:** Produce a costed Bill of Materials (Hebrew xlsx) from completed design, with supplier price comparison.

## Inputs

```json
{
  "design_spec": "<combined pv_design + wire_sizing + protection outputs>",
  "customer_tier": "tier_1" | "tier_2" | "tier_3",
  "prefer_supplier": null | "prime_energy"
}
```

## Algorithm

```
1. Enumerate line items from design:
   - Panels (count, model)
   - Inverter(s)
   - Mounting rails + clamps (calc from panel_count + roof_type)
   - DC cable (meters from wire_sizing)
   - AC cable
   - String fuses + holders
   - DC isolator
   - AC breaker + RCD type B
   - SPDs (DC + AC)
   - Earthing electrodes + bonding cable
   - Monitoring (SolarEdge gateway / Sungrow WiNet / etc.)
   - Optional: battery (premium scenario)
   - Labor (estimated hours × rate)

2. Price each item:
   - Query BEE pricebook (8 panels + 9 batteries + inverters)
   - For each, check supplier options: Prime Energy / Solar-Space / Deye / Eliran
   - Pick cheapest meeting spec (unless prefer_supplier set)
   - Note lead time per supplier (KG :Supplier.delivery_days)

3. Apply markup per customer_tier:
   - tier_1 (Rafael/Palar): 25-30% (volume, lower margin)
   - tier_2: 35%
   - tier_3 (retail): 40-45%

4. Compute:
   - total_cost_nis (BEE's cost)
   - quoted_price_nis (cost × (1 + markup))
   - estimated_install_days (from capacity + complexity)
   - payment milestones (30/40/30 split typical)
```

## Output

```json
{
  "line_items": [
    {"category": "panels", "desc": "Jinko Tiger Neo 580W", "qty": 86,
     "unit_cost_nis": 420, "total_cost_nis": 36120,
     "supplier": "solar_space", "lead_days": 14},
    {"category": "inverter", "desc": "Sungrow SG50CX", "qty": 1,
     "unit_cost_nis": 11500, "total_cost_nis": 11500,
     "supplier": "prime_energy", "lead_days": 7},
    "... (full list)"
  ],
  "totals": {
    "equipment_cost_nis": 71200,
    "labor_cost_nis": 18000,
    "total_cost_nis": 89200,
    "markup_pct": 30,
    "quoted_price_nis": 115960,
    "estimated_install_days": 4
  },
  "payment_milestones": [
    {"trigger": "חתימה", "pct": 30, "amount_nis": 34788},
    {"trigger": "אישור חיבור", "pct": 40, "amount_nis": 46384},
    {"trigger": "השלמת התקנה", "pct": 30, "amount_nis": 34788}
  ],
  "supplier_breakdown": {
    "solar_space": 36120, "prime_energy": 23500, "deye": 11580
  },
  "xlsx_path": "reports/bom-<project_id>-<date>.xlsx",
  "writes_to_bee": "bee.attachBom(project_id, ...)"
}
```

## Supplier comparison logic

For each fungible item (e.g., panels), the agent shows the cheapest valid
option but lists alternatives so Barak can choose (e.g., prefer faster lead
time over $50 savings). Output highlights:
- Cheapest combo
- Fastest-delivery combo
- Single-supplier combo (simpler logistics)

## Writeback (Q78)

```javascript
await bee.attachBom({
  id: project_id,
  bom: line_items,
  total_cost_nis: totals.total_cost_nis,
  quoted_price_nis: totals.quoted_price_nis,
  xlsx_url: uploaded_xlsx_url,
});
```

## Tests
1. 50kWp BOM → ~25 line items, all priced
2. Supplier comparison → cheapest panel source identified
3. tier_1 customer → 25-30% markup applied
4. Premium scenario → battery line added
5. xlsx renders Hebrew RTL with ₪ columns
6. Writeback populates project.bom in BEE app
