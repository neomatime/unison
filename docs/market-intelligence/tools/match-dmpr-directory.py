#!/usr/bin/env python3
"""Match the research mines to the DMPR D1 directory. Nothing is merged or marked verified by this script: it writes
a review file saying, for each mine, the best directory entry (if any) and why, and a class:

  strong   same province AND (a shared farm name OR the same name once filler words are removed)
  possible same province AND the names share a distinctive word, or only a farm matches with a different name
  none     no entry in that province looks like it

A strong match with a commodity that does not fit, or two strong entries with different owners, is downgraded to
"possible" so a person looks at it. Standard library only.

Usage: match-dmpr-directory.py DIRECTORY_JSON IMPORT_CSV STAGING_CSV OUTPUT_CSV
  DIRECTORY_JSON  the D1 sheet as a list of {code,name,owner,district_province,entity,commodity,farms}
  IMPORT_CSV      mining_import.csv (the mapped research mines)
  STAGING_CSV     mining_sites_staging.csv (has the farm names)
"""
import csv, json, re, sys
from collections import Counter

FILLER = {"mine", "mines", "mining", "shaft", "shafts", "colliery", "collieries", "operations", "operation", "pty", "ltd", "limited", "the", "and", "of",
          "company", "co", "resources", "no", "north", "south", "east", "west", "section", "complex", "project", "opco", "holdings", "group", "sa", "t", "a"}
PROVINCES = {"EASTERN CAPE": "Eastern Cape", "FREE STATE": "Free State", "GAUTENG": "Gauteng", "KWA-ZULU NATAL": "KwaZulu-Natal", "KWAZULU-NATAL": "KwaZulu-Natal",
             "LIMPOPO": "Limpopo", "MPUMALANGA": "Mpumalanga", "NORTH-WEST": "North West", "NORTH WEST": "North West", "NORTHERN CAPE": "Northern Cape", "WESTERN CAPE": "Western Cape"}
COMMODITY = {"coal": ["COAL"], "platinum": ["PGM", "PLATINUM"], "gold": ["GOLD"], "chromium": ["CHROME"], "manganese": ["MANGANESE"], "diamonds": ["DIAMOND"],
             "iron ore": ["IRON"], "nickel": ["NICKEL"], "copper": ["COPPER"], "vanadium": ["VANAD"], "fluorspar": ["FLUOR"], "phosphate rock": ["PHOSPH"],
             "titanium minerals": ["TITAN", "ILMENITE", "RUTILE", "ZIRCON", "HEAVY MINERAL"], "lead-zinc": ["ZINC", "LEAD"], "rare earths": ["MONAZITE", "RARE"]}


def tokens(name):
    return {t for t in re.sub(r"[^a-z0-9 ]+", " ", name.lower()).split() if t not in FILLER and len(t) > 1}


def province_of(text):
    for key in sorted(PROVINCES, key=len, reverse=True):
        if text.upper().endswith(key):
            return PROVINCES[key]
    return None


def farms(text):
    return {re.sub(r"\s+", " ", f.strip().upper()) for f in re.split(r"[;,]", text or "") if len(f.strip()) > 3}


def main(directory_json, import_csv, staging_csv, out_csv):
    directory = json.load(open(directory_json, encoding="utf-8"))
    for row in directory:
        row["prov"] = province_of(row["district_province"])
        row["tokens"] = tokens(row["name"])
        row["farm_set"] = farms(row["farms"])
    staging = {r["source_id"]: r for r in csv.DictReader(open(staging_csv, encoding="utf-8-sig"))}
    mines = list(csv.DictReader(open(import_csv, encoding="utf-8-sig")))
    out = []
    for mine in mines:
        fid = re.search(r"FID (\d+)", mine["source_reference"]).group(1)
        stage = staging.get("cole_2024:" + fid, {})
        my_tokens = tokens(mine["operation_name"])
        my_farms = farms(stage.get("farm_names", ""))
        commodity = mine["primary_commodity"].lower()
        scored = []
        for entry in directory:
            if entry["prov"] != mine["province"] or not entry["entity"].startswith("MINE"):
                continue
            shared_farms = my_farms & entry["farm_set"]
            same_name = my_tokens and my_tokens == entry["tokens"]
            overlap = my_tokens & entry["tokens"]
            name_close = bool(my_tokens) and (my_tokens <= entry["tokens"] or entry["tokens"] <= my_tokens) and bool(overlap)
            distinctive = bool(overlap) and max(len(t) for t in overlap) >= 5
            fits = any(word in entry["commodity"].upper() for word in COMMODITY.get(commodity, [commodity.upper()]))
            if shared_farms and (same_name or name_close):
                klass, score = "strong", 4
            elif same_name:
                klass, score = "strong", 3
            elif shared_farms:
                klass, score = "possible", 2
            elif distinctive and fits:
                klass, score = "possible", 1
            else:
                continue
            if klass == "strong" and not fits:
                klass = "possible"
            scored.append((score, klass, entry, sorted(shared_farms), fits))
        scored.sort(key=lambda s: -s[0])
        best = scored[0] if scored else None
        notes = []
        if best:
            top = [s for s in scored if s[0] == best[0]]
            if len({s[2]["owner"] for s in top}) > 1 and best[1] == "strong":
                notes.append(f"{len(top)} directory entries match with different owners")
                best = (best[0], "possible", best[2], best[3], best[4])
            if not best[4]:
                notes.append("directory commodity does not match")
        out.append({
            "fid": fid, "mine": mine["operation_name"], "our_owner": mine["organisation_name"], "province": mine["province"], "commodity": mine["primary_commodity"],
            "class": best[1] if best else "none", "dmpr_code": best[2]["code"] if best else "", "dmpr_name": best[2]["name"] if best else "",
            "dmpr_owner": best[2]["owner"] if best else "", "dmpr_district": best[2]["district_province"] if best else "", "dmpr_commodity": best[2]["commodity"] if best else "",
            "owner_agrees": ("yes" if tokens(mine["organisation_name"]) & tokens(best[2]["owner"]) else "no") if best else "",
            "evidence": ("farm names + name" if best[3] and best[0] == 4 else "name" if best[0] == 3 else "farm names" if best[3] else "partial name") if best else "",
            "shared_farms": "; ".join(best[3]) if best else "", "alternatives": "; ".join(f'{s[2]["code"]} {s[2]["name"]}' for s in scored[1:4]), "notes": "; ".join(notes),
        })
    with open(out_csv, "w", newline="", encoding="utf-8-sig") as fp:
        writer = csv.DictWriter(fp, fieldnames=list(out[0]))
        writer.writeheader()
        writer.writerows(out)
    print(Counter(r["class"] for r in out))


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    main(*sys.argv[1:])
