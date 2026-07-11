# sub-skill: protection_coordination

**Parent:** engineering-agent
**⚠️ SAFETY + LEGAL CRITICAL — output MUST be signed off by Barak (licensed inspector).**
**Purpose:** Select DC isolators, fuses, AC breakers, RCD, surge + lightning protection per IEC + תקנות חשמל.

## Inputs

```json
{
  "string_configuration": "<from pv_design_calc>",
  "wire_sizing": "<from wire_sizing>",
  "inverter_specs": {"max_dc_current_a": 40, "max_ac_current_a": 80, "grid_phases": 3},
  "module_isc_a": 13.8,
  "site_lightning_exposure": "low" | "medium" | "high",
  "grid_connection": "net-metering" | "feed-in" | "off-grid-hybrid"
}
```

## Algorithm

```
DC protection:
1. String fuse (if parallel_strings >= 3 per IEC 62548):
     fuse_rating = 1.5 * Isc, rounded to standard (15A, 20A, 25A)
     fuse_type: gPV (PV-specific)
2. DC isolator (disconnect):
     rating >= 1.25 * I_string_total, voltage >= Voc_cold * 1.2
     Required at inverter input (IEC 60364-7-712)
3. SPD (surge protection device) DC side:
     Type 2 SPD if lightning_exposure medium+; Type 1+2 if high

AC protection:
1. AC circuit breaker (MCB):
     rating: I_ac < In <= ampacity_of_AC_cable
     curve: C-curve (handles inverter inrush)
     poles: 4P for 3-phase (3L+N)
2. RCD (residual current device):
     ⚠️ Type B REQUIRED for most PV inverters (DC fault current detection)
     30mA for personnel protection, or 300mA for fire if no direct contact risk
     Per IEC 60364-7-712 + תקנות חשמל
3. AC SPD: Type 2 at consumer unit

Lightning / earthing:
- LPS (lightning protection system) if exposure high
- Equipotential bonding all metal: frames, rails, inverter chassis
- Earth resistance target <10Ω (sandy Negev soil may need multiple electrodes)

Anti-islanding:
- Inverter must have certified anti-islanding (grid-tie safety)
- Verify inverter holds Israeli grid-code certification (חברת החשמל)
```

## Output

```json
{
  "dc_protection": {
    "string_fuse": {"required": true, "rating_a": 20, "type": "gPV"},
    "dc_isolator": {"rating_a": 50, "voltage_v": 1000},
    "dc_spd": {"type": "Type 2", "required": true}
  },
  "ac_protection": {
    "mcb": {"rating_a": 80, "poles": 4, "curve": "C"},
    "rcd": {"type": "B", "sensitivity_ma": 30, "REQUIRED": true},
    "ac_spd": {"type": "Type 2"}
  },
  "earthing": {
    "equipotential_bonding": "all metal frames + rails + chassis",
    "earth_resistance_target_ohm": 10,
    "electrodes_estimated": 2
  },
  "lightning_protection": {"lps_required": false, "reason": "low exposure"},
  "anti_islanding": {"inverter_certified": true, "grid_code": "IEC 62116 + IEC standard"},
  "SIGN_OFF_REQUIRED": "ברק (בודק חשמל מוסמך) — חובה לאשר לפני התקנה",
  "code_refs": ["IEC 60364-7-712", "IEC 62548", "IEC 62116", "תקנות החשמל פרק ח"]
}
```

## Why human sign-off is non-negotiable

1. **Legal:** Israeli code requires licensed electrical inspector certification.
2. **Safety:** wrong RCD type (A instead of B) → undetected DC faults → fire risk.
3. **Liability:** if AI-designed protection fails → BEE liable. Human certifies.

The agent **drafts a defensible starting point**; Barak validates against the
actual install + signs. Never auto-issue protection plans.

## Tests
1. 50kWp 3-phase → Type B RCD 30mA + 4P MCB 80A + DC isolator
2. 3+ parallel strings → string fuses required
3. High lightning exposure (open field) → LPS required
4. Verify inverter model has Israeli grid certification
5. Output always carries SIGN_OFF_REQUIRED flag
