#!/usr/bin/env python3
"""Turn the research staging CSV (fetch_mining_seed.py) into rows UNISON can import.

Nothing here invents data. For every staged mine it:
  * compares the two coordinate sets the source publishes (the point geometry and the Latitude/Longitude columns);
    rows whose sets disagree by more than HOLD_KM are held back for review, not mapped;
  * works out the province by testing the point against the geoBoundaries province polygons (the source has no
    province column), and holds back a point that falls in no province;
  * keeps one organisation per DISTINCT owner string exactly as the source writes it. Similar names are never merged;
    pairs that look like the same company are listed in review_possible_same_company.csv for a person to decide;
  * marks every mine "Unverified (2024 research snapshot)", with no verification date.

Usage:
  python mining-seed-to-import.py STAGING_CSV PROVINCES_GEOJSON OUTPUT_DIR
Standard library only.
"""
import csv, json, math, re, sys, urllib.parse, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

LAYER = "https://services9.arcgis.com/F0CjV9xC6jjwGA9r/ArcGIS/rest/services/Operating%20Mines_Feb%202024/FeatureServer/0"
SOURCE = ("Cole (2024), Operating Mines and their Closure Risks 2021-2023, DataFirst, DOI 10.25828/2c2f-s119 (CC BY), "
          "via ArcGIS layer Operating Mines_Feb 2024. Research snapshot; current status unverified.")
STATUS = "Unverified (2024 research snapshot)"
HOLD_KM = 5.0          # coordinate sets further apart than this: not mapped
AGREE_KM = 0.5         # closer than this: the two coordinate sets agree
BORDER_KM = 3.0        # a point this close to a province border is flagged
PROVINCE_FIX = {"Nothern Cape": "Northern Cape"}


def km(lat1, lon1, lat2, lon2):
    return math.hypot((lat1 - lat2) * 111.2, (lon1 - lon2) * 111.2 * math.cos(math.radians((lat1 + lat2) / 2)))


def fetch_attribute_coordinates():
    """The Latitude and Longitude columns of every feature, by FID. The staging CSV holds the point geometry (the
    script prefers it), so these are the second coordinate set to compare it with."""
    out = {}
    url = LAYER + "/query?" + urllib.parse.urlencode({"f": "json", "where": "1=1", "outFields": "FID,Latitude,Longitude", "returnGeometry": "false"})
    data = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "UNISON-mining-seed/1.0"}), timeout=60))
    for feature in data.get("features", []):
        attributes = feature["attributes"]
        try:
            out[str(attributes["FID"])] = (float(attributes["Latitude"]), float(attributes["Longitude"]))
        except (TypeError, ValueError):
            pass
    return out


def rings_of(feature):
    geometry = feature["geometry"]
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return [ring for polygon in polygons for ring in polygon]


def inside(ring, lon, lat):
    hit = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def border_distance_km(rings, lat, lon):
    best = 1e9
    for ring in rings:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
            dx, dy = x2 - x1, y2 - y1
            t = 0 if dx == dy == 0 else max(0, min(1, ((lon - x1) * dx + (lat - y1) * dy) / (dx * dx + dy * dy)))
            best = min(best, km(lat, lon, y1 + t * dy, x1 + t * dx))
    return best


def province_of(provinces, lat, lon):
    for name, rings in provinces:
        # A point is in a province when it is inside an odd number of its rings (outer ring minus holes).
        if sum(inside(ring, lon, lat) for ring in rings) % 2 == 1:
            return name, min(border_distance_km([r for n, rs in provinces for r in rs], lat, lon), 1e9)
    return None, None


def title(value):
    value = (value or "").strip()
    return value[:1].upper() + value[1:]


def key(value):
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def main(staging, geojson, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rows = list(csv.DictReader(open(staging, encoding="utf-8-sig")))
    attribute_coordinates = fetch_attribute_coordinates()
    provinces = [(PROVINCE_FIX.get(f["properties"]["shapeName"], f["properties"]["shapeName"]), rings_of(f)) for f in json.load(open(geojson, encoding="utf-8"))["features"]]

    mapped, held = [], []
    for row in rows:
        fid = row["source_id"].split(":", 1)[1]
        lat, lon = float(row["latitude"]), float(row["longitude"])
        other = attribute_coordinates.get(fid)
        apart = km(lat, lon, other[0], other[1]) if other else None
        reason = None
        if apart is not None and apart > HOLD_KM:
            reason = f"The source's two coordinate sets are {apart:.0f} km apart; a person must decide which is the site."
        province, border = province_of(provinces, lat, lon)
        if reason is None and province is None:
            reason = "The point is outside every province boundary."
        if reason:
            held.append({"source_id": row["source_id"], "mine_name": row["mine_name"], "owner": row["source_owner"], "commodity": row["commodity"],
                         "latitude": row["latitude"], "longitude": row["longitude"], "coordinate_sets_apart_km": "" if apart is None else f"{apart:.1f}", "reason": reason})
            continue
        notes = [f"ArcGIS FID {fid}", "province derived from the coordinates against geoBoundaries"]
        if border is not None and border < BORDER_KM:
            notes.append(f"within {BORDER_KM:.0f} km of a provincial border: check the province")
        if apart is not None and apart > AGREE_KM:
            notes.append(f"source coordinate sets differ by {apart:.1f} km")
        mapped.append({**row, "province": province, "ref": "; ".join(notes), "apart": apart})

    # One organisation per distinct owner string. Never merge by similarity.
    owners = defaultdict(list)
    for row in mapped:
        owners[row["source_owner"]].append(row)
    names = sorted(owners)
    candidates = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            ka, kb = key(a), key(b)
            if ka == kb or (len(ka) > 4 and len(kb) > 4 and (ka in kb or kb in ka)):
                candidates.append({"owner_a": a, "owner_b": b, "why": "same letters" if ka == kb else "one name contains the other"})
    shared = [n for n in names if re.search(r"[,&/]", n)]

    columns = ["organisation_name", "trading_name", "parent_organisation", "registration_number", "website", "organisation_type", "commodities",
               "operation_name", "province", "district", "latitude", "longitude", "primary_commodity", "other_commodities", "operation_type",
               "operating_status", "location_accuracy", "source", "source_reference", "verified_on"]
    with open(out / "mining_import.csv", "w", newline="", encoding="utf-8-sig") as fp:
        writer = csv.DictWriter(fp, fieldnames=columns)
        writer.writeheader()
        for row in sorted(mapped, key=lambda r: (r["source_owner"].lower(), r["mine_name"].lower())):
            writer.writerow({
                "organisation_name": row["source_owner"], "commodities": "", "operation_name": row["mine_name"], "province": row["province"],
                "latitude": row["latitude"], "longitude": row["longitude"], "primary_commodity": title(row["commodity"]),
                "operation_type": title(row["mining_method"]), "operating_status": STATUS, "location_accuracy": "approximate",
                "source": SOURCE, "source_reference": row["ref"], "verified_on": "",
            })
    for name, fields, data in (
        ("review_held_back.csv", ["source_id", "mine_name", "owner", "commodity", "latitude", "longitude", "coordinate_sets_apart_km", "reason"], held),
        ("review_possible_same_company.csv", ["owner_a", "owner_b", "why"], candidates),
    ):
        with open(out / name, "w", newline="", encoding="utf-8-sig") as fp:
            writer = csv.DictWriter(fp, fieldnames=fields)
            writer.writeheader()
            writer.writerows(data)
    report = {
        "staged_rows": len(rows), "mapped": len(mapped), "held_back_for_review": len(held), "organisations": len(owners),
        "coordinate_sets_agree_within_0.5km": sum(1 for r in mapped if r["apart"] is None or r["apart"] <= AGREE_KM),
        "mapped_with_coordinate_difference_0.5_to_5km": sum(1 for r in mapped if r["apart"] is not None and r["apart"] > AGREE_KM),
        "near_a_provincial_border": sum(1 for r in mapped if "border" in r["ref"]),
        "owner_strings_naming_several_companies": shared, "possible_same_company_pairs": len(candidates),
        "by_province": Counter(r["province"] for r in mapped), "by_commodity": Counter(title(r["commodity"]) for r in mapped),
    }
    json.dump(report, open(out / "mining_import_report.json", "w"), indent=2, ensure_ascii=False)
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
