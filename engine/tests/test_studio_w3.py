"""Wave 3: plain-language explanations and one-click fixes on findings, the PV-connection studio example."""
import copy
from pathlib import Path

import yaml

from bee_cad.checks import EXPLAIN, as_dicts, check
from bee_cad.server import EXAMPLE_BRIEFS, analyse
from bee_cad.templates import from_brief

BRIEF = yaml.safe_load((Path(__file__).resolve().parents[1] / "examples" / "brief_pv_commercial.yaml")
                       .read_text(encoding="utf-8"))


def _apply(brief, patch):
    """The studio's applyPatch, in Python: "pv.strings[mppt=5].cable_mm2" / "supply.connection"."""
    obj = brief
    *head, last = patch["path"].split(".")
    for part in head:
        if "[" in part:
            name, cond = part[:-1].split("[")
            key, val = cond.split("=")
            obj = next(x for x in obj[name] if str(x[key]) == val)
        else:
            obj = obj.setdefault(part, {})
    obj[last] = patch["value"]


def test_every_code_is_explained():
    import re

    src = (Path(__file__).resolve().parents[1] / "bee_cad" / "checks.py").read_text(encoding="utf-8")
    codes = set(re.findall(r'Finding\(\s*"(?:error|warn|info)"\s*(?:if [^,]+ else "\w+")?,\s*"([A-Z_0-9]+)"', src))
    codes |= set(re.findall(r'"(?:error|warn|info)" if \w+ else "(?:error|warn|info)", "([A-Z_0-9]+)"', src))
    assert codes and not (codes - set(EXPLAIN)), codes - set(EXPLAIN)
    assert all(d["why"] for d in as_dicts(check(from_brief(BRIEF))))


def test_one_click_fixes_clear_the_error():
    b = copy.deepcopy(BRIEF)
    b["supply"]["connection"] = "3X100A"
    b["pv"]["strings"][0]["modules"] = 22
    b["pv"]["strings"][4]["cable_mm2"] = 1.5
    b["pv"]["strings"][4]["cable_m"] = 150
    bad = [f for f in check(from_brief(b)) if f.level != "info"]
    assert {f.code for f in bad} >= {"CONNECTION", "PV_VOC_COLD", "PV_DC_DU"}
    for _ in range(4):                      # apply every offered fix until none is left
        todo = [f for f in check(from_brief(b)) if f.level != "info" and f.patch]
        if not todo:
            break
        for f in todo:
            _apply(b, f.patch)
    assert b["supply"]["connection"] == "3X160A" and b["pv"]["strings"][0]["modules"] == 20
    assert b["pv"]["strings"][4]["cable_mm2"] >= 6
    assert not [f for f in check(from_brief(b)) if f.level != "info"], [f.line() for f in check(from_brief(b))]


def test_pv_combiner_feeder_is_not_a_selectivity_problem():
    b = copy.deepcopy(BRIEF)
    b["supply"]["connection"] = "3X160A"          # Q-PV 200A sits above a 160A main: it feeds generation
    assert "SELECTIVITY" not in {f.code for f in check(from_brief(b))}


def test_examples_for_both_modes():
    assert set(EXAMPLE_BRIEFS) == {"house-pv", "pv-connection"}
    out = analyse({"brief": BRIEF, "sheets": False})
    assert out["dc"] and all("why" in f for f in out["findings"])
