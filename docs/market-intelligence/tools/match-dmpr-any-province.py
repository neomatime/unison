#!/usr/bin/env python3
"""Second-pass match of research mines to the DMPR D1 directory WITHOUT the province restriction.

The first pass (match-dmpr-directory.py) only looks inside the province worked out from the mine's coordinates, so a mine
near a border, or filed under another province in the directory, is missed. This pass looks at every entry (mines, works
and prospects) and scores each candidate:
  +3 a shared farm name       +3 the same name, or one name inside the other (filler words removed)
  +1 a distinctive shared word (5+ letters)   +1 the owner's name appears in the entry's name or owner   +1 same province
A candidate is "probable" only with a farm or name match, a fitting commodity and a score of 4 or more, otherwise
"possible" at 2 or more. It lists up to three candidates, and never changes anything.

Usage: match-dmpr-any-province.py DIRECTORY_JSON IMPORT_CSV STAGING_CSV FIRST_PASS_CSV OUTPUT_CSV
Only the mines the first pass called "none" are searched. Standard library only.
"""
import csv, importlib.util, json, re, sys
from pathlib import Path
_spec = importlib.util.spec_from_file_location("first_pass", Path(__file__).with_name("match-dmpr-directory.py"))
first = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(first)
tokens, province_of, farms, COMMODITY = first.tokens, first.province_of, first.farms, first.COMMODITY


def main(directory_json, import_csv, staging_csv, first_csv, out_csv):
    directory = json.load(open(directory_json, encoding="utf-8"))
    for e in directory:
        e["prov"], e["tokens"], e["farm_set"] = province_of(e["district_province"]), tokens(e["name"]), farms(e["farms"])
        e["owner_tokens"] = tokens(e["owner"])
    staging = {r["source_id"]: r for r in csv.DictReader(open(staging_csv, encoding="utf-8-sig"))}
    mines = {re.search(r"FID (\d+)", r["source_reference"]).group(1): r for r in csv.DictReader(open(import_csv, encoding="utf-8-sig"))}
    todo = [r["fid"] for r in csv.DictReader(open(first_csv, encoding="utf-8-sig")) if r["class"] == "none" and r["fid"] != "231"]
    out = []
    for fid in todo:
        mine = mines[fid]
        my_tokens, my_farms = tokens(mine["operation_name"]), farms(staging.get("cole_2024:" + fid, {}).get("farm_names", ""))
        owner_tokens = {t for t in tokens(mine["organisation_name"]) if len(t) >= 5}
        commodity = mine["primary_commodity"].lower()
        found = []
        for e in directory:
            shared = my_farms & e["farm_set"]
            name_close = bool(my_tokens & e["tokens"]) and (my_tokens <= e["tokens"] or e["tokens"] <= my_tokens)
            distinctive = any(len(t) >= 5 for t in my_tokens & e["tokens"])
            owner_hit = bool(owner_tokens & (e["tokens"] | e["owner_tokens"]))
            fits = any(w in e["commodity"].upper() for w in COMMODITY.get(commodity, [commodity.upper()]))
            score = 3 * bool(shared) + 3 * name_close + distinctive + owner_hit + (e["prov"] == mine["province"])
            if score < 2 or not (shared or name_close or distinctive or owner_hit):
                continue
            klass = "probable" if (shared or name_close) and fits and score >= 4 else "possible"
            found.append((score, klass, e, sorted(shared), fits))
        found.sort(key=lambda f: (-f[0], f[2]["code"]))
        best = found[0] if found else None
        out.append({
            "fid": fid, "mine": mine["operation_name"], "our_owner": mine["organisation_name"], "our_province": mine["province"], "commodity": mine["primary_commodity"],
            "class": best[1] if best else "none", "score": best[0] if best else "", "dmpr_code": best[2]["code"] if best else "", "dmpr_name": best[2]["name"] if best else "",
            "dmpr_owner": best[2]["owner"] if best else "", "dmpr_entity": best[2]["entity"].split(" ")[0] if best else "", "dmpr_province": (best[2]["prov"] or "") if best else "",
            "shared_farms": "; ".join(best[3]) if best else "", "commodity_fits": ("yes" if best[4] else "no") if best else "",
            "other_candidates": " | ".join(f'{f[2]["code"]} {f[2]["name"][:40]} ({f[2]["prov"]}, score {f[0]})' for f in found[1:3]),
        })
    with open(out_csv, "w", newline="", encoding="utf-8-sig") as fp:
        w = csv.DictWriter(fp, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
    for r in out:
        print(f'{r["class"]:9} {r["mine"]} [{r["our_owner"]}, {r["our_province"]}] -> {r["dmpr_code"]} {r["dmpr_name"]} [{r["dmpr_owner"]}; {r["dmpr_entity"]}; {r["dmpr_province"]}; farms: {r["shared_farms"][:30]}; fits: {r["commodity_fits"]}] {r["other_candidates"]}')


if __name__ == "__main__":
    if len(sys.argv) != 6:
        sys.exit(__doc__)
    main(*sys.argv[1:])
