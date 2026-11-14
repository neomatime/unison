# HIMARK Mining Market Intelligence

The panel under the four KPI cards on the Overview. It maps South Africa's mining operations, shows HIMARK's
relationship with each mining organisation, and links straight into UNISON's leads, clients and calendar.

The map shows **verified, imported data only**. Nothing is seeded: until a dataset is imported the map shows the
provinces and says that no operations have been imported yet.

## How the data is held

| Table | What it holds |
|---|---|
| `market_organizations` | One row per mining organisation (company): names, parent, registration number, website, commodities, source, verification date, and the two links into the CRM: `client_id` and `lead_id`. |
| `market_operations` | One row per operating site, belonging to one organisation: name, province, district, coordinates, commodities, type, status, location accuracy, source, verification date. |

* One company with three mines is one organisation row and three operation rows.
* Market data and CRM records stay separate; they are joined only by `client_id` / `lead_id`.
* Both tables are per workspace (`organization_id`) with row level security: members read; members can only change the
  two CRM links; data is written only by `market_import()`, which allows owners and admins only.
* `industry` is `'mining'` for now, so another sector can use the same tables later.

Migration: `supabase/migrations/20261114110000_market_intelligence.sql`.

## Importing verified data

1. Get a verified dataset. Suitable sources are the Department of Mineral and Petroleum Resources' operating mines
   directory, Council for Geoscience datasets, Minerals Council South Africa member information and mining companies'
   own published disclosures (annual reports, mineral resource statements). Check each source's licence before use.
2. Put it in the template, `docs/market-intelligence/mining-import-template.csv` (CSV or Excel), **one row per
   operation**. An organisation with no mapped site can be a row with the operation columns left empty.
3. Sign in as an owner or admin, open the Overview, choose **View full intelligence**, then **Import data**, and upload
   the file. (When nothing has been imported yet, **Import data** is also on the panel itself.)
4. The result lists how many operations were added or updated, and every refused row with its line number and reason.
   Fix those rows and import the file again: rows already imported are updated in place, never added twice.

### Columns

| Column | Required | Notes |
|---|---|---|
| `organisation_name` | yes | Registered business name. |
| `source` | yes | Where the row comes from, e.g. "DMPR Operating Mines Directory 2026". Kept on every row. |
| `trading_name`, `parent_organisation`, `organisation_type` | | |
| `registration_number` | | CIPC number. When present it is how the organisation is recognised on the next import. |
| `website` | | `https://` is added if missing. |
| `commodities` | | Several separated by `;`. |
| `operation_name` | for an operation | |
| `province` | for an operation | One of the nine provinces (KZN is accepted). |
| `latitude`, `longitude` | for an operation | Decimal degrees, of the **site**, not the head office. Latitude is negative (e.g. `-25.67`). Points outside South Africa are refused. |
| `district` | | Municipality or district. |
| `primary_commodity`, `other_commodities` | | `other_commodities` separated by `;`. |
| `operation_type`, `operating_status` | | e.g. Underground / Open pit; Operating / Care and maintenance. |
| `location_accuracy` | | `exact` (default), `approximate`, or `district` when only the town or district is known. |
| `source_reference` | | A page, table or record number in the source. |
| `verified_on` | | `YYYY-MM-DD`, the date the row was last checked against its source. |

Matching on re-import: an organisation by its registration number, otherwise by its name with punctuation and suffixes
such as "(Pty) Ltd" removed; an operation by its name within its organisation.

## Engagement status

Worked out each time from UNISON's own records, never stored, so it cannot drift from the CRM. An organisation takes
the first status that applies:

1. **Existing client**: linked to a client that is not archived, or its lead was converted into a client.
2. **Proposal submitted**: a quote that is Sent or Accepted, or an open opportunity at Proposal or Negotiation.
3. **Active engagement**: another open opportunity, or a lead that is Contacted or Qualified.
4. **Prospect**: linked to a lead, with nothing further.
5. **Unresearched**: not linked to anything in UNISON.

Opportunities and quotes count when they belong to the linked client or lead. The legend counts operations by their
organisation's status, so its numbers add up to the operation count. **HIMARK engaged** counts distinct organisations
that are a client, have a proposal out, or are actively engaged.

## CRM actions

* **View company** opens the linked client, or the linked lead. Not available until the organisation is in UNISON.
* **Create lead** opens the normal new-lead form with the company name and the verified facts in the notes (no contact
  details are invented). Saving it links the lead to the organisation. If the organisation already has a lead or client,
  the form is not offered and the existing record is opened instead.
* When UNISON already has a client or lead with the same company name, the panel offers **Link to this client/lead**
  instead, so no duplicate is created.
* **Schedule engagement** opens the normal new calendar event, titled and linked to the client when there is one.

## Province boundaries

`features/market-intelligence/province-shapes.ts` is generated from geoBoundaries ZAF ADM1 (simplified), licensed
CC BY 4.0 (https://www.geoboundaries.org). The credit is shown on the map. To regenerate it, download
`geoBoundaries-ZAF-ADM1_simplified.geojson` and run:

```
node docs/market-intelligence/tools/build-province-shapes.cjs <path-to-geojson> features/market-intelligence/province-shapes.ts
```

## Research seed (loaded 2026-11-14)

The first dataset on the map is a **research snapshot, not a verified 2026 inventory**. It was fetched with
`unison_mining_seed/fetch_mining_seed.py` and converted with `docs/market-intelligence/tools/mining-seed-to-import.py`.

* **Source:** Cole (2024), *Operating Mines and their Closure Risks 2021-2023*, DataFirst, DOI 10.25828/2c2f-s119
  (stated CC BY), read from the ArcGIS layer *Operating Mines_Feb 2024* (last edited 2024-08-16). Every loaded row keeps
  that source text, the ArcGIS id in `source_ref`, and **no verification date**, so the panel shows "Location on research
  map; current operating status unverified" and the status "Unverified (2024 research snapshot)".
* **Licence:** the original publication states CC BY, but the licence of the ArcGIS-hosted copy has not been confirmed.
  Confirm it, and keep the attribution, before relying on this data commercially. Do **not** use Cole's Feb 2026 Mendeley
  dataset: it is CC BY-NC (non-commercial).
* **Province:** the source has none. It is worked out by testing each point against the geoBoundaries province polygons
  and recorded in `source_ref`; points within 3 km of a border are flagged there for checking.
* **Position:** the source publishes two coordinate sets per mine (the point geometry and Latitude/Longitude columns).
  Where they differ by more than 5 km the mine is **not mapped** and is listed in `review/review_held_back.csv`.
  Mapped points are marked `approximate`: they are research points, not surveyed entrances.
* **Organisations:** one per distinct owner string, exactly as the source writes it. Nothing is merged by similarity.
  Many owner strings name several companies ("Kumba, African Rainbow Minerals, Assmang") and some are spelling variants
  of one another; `review/review_possible_same_company.csv` lists the likely pairs for a person to decide.
* **D1-2026:** the DMPR Operating Mines page links to no downloadable D1-2026 file when checked (its link is the
  placeholder `REPLACE-WITH-D1-2026-PDF-URL`), so names, operators and status could **not** be validated against it.
  When the Excel is obtained, match it to these rows as candidates (name, province, commodity), have a person confirm
  each, then re-import with a `verified_on` date and `operating_status` from the directory. Until then every row stays
  unverified.

Counts: 231 source records; 1 rejected by the fetch script (no usable coordinates); 230 staged; 85 held back because the
source's two coordinate sets disagree by more than 5 km (`review/review_held_back.csv`); 145 mapped; 1 of those withdrawn
as a data error (the last line of the held-back list); **144 loaded**, for **83 organisations**.

## Checked against the DMPR directory (D1-2024, 2026-11-15)

`docs/D1 2024__Operationg Mines.xlsx` is the Department's own register, **2024 edition** (2,059 entries: mines, quarries,
sand and diamond workings, works and prospects). It is not the 2026 directory, which could not be found online, so it
confirms a mine was **registered in 2024**, not that it operates in 2026. `tools/match-dmpr-directory.py` matched the 144
loaded mines to it by province, farm names, name and commodity; the full result is `review/dmpr-d1-2024-matches.csv`.

* **80 confirmed:** same province, a shared farm name and a matching name. Their status is now "Listed in DMPR D1-2024
  directory; 2026 status not confirmed", with the DMPR mine code in `source_ref`, and `verified_on` 2026-11-15. The panel
  still says this does not confirm the site operates today.
* **28 more confirmed by review** (2026-11-15): of the 39 "possible" matches, the account owner confirmed 28 (17 clear
  matches, plus Impala and Marikana shafts that the directory lists as one whole operation each). They are marked the same way
  and `review/dmpr-d1-2024-matches.csv` shows them as `confirmed_by_review`. In total **108 of the 144 are listed**.
* **11 still for a person to decide** (the other "possible" matches): the name matches but no farm does, or the entry has a different owner or
  commodity, or two entries fit. Left unverified.
* **25 not found** (class "none"): no entry in that province looks like it. Left unverified.
* **Owners often differ.** In 32 of the 80 confirmed matches the directory's owner shares no word with the research
  source's owner (for example Bafokeng Rasimone: directory "Impala Platinum Holdings", research "Anglo Platinum & BRPM").
  Owners were **not** changed; the `owner_agrees` column shows each case. Ownership moves, so check before using it.
* To confirm a "possible" match, set the operation's `operating_status`/`verified_on` the same way, after reading the row.

### Second pass, without the province restriction (2026-11-15)

`tools/match-dmpr-any-province.py` searched the whole directory for the 25 mines the first pass did not find; the result is
`review/dmpr-d1-2024-second-pass.csv`. Many mines near the Limpopo/Mpumalanga border are filed under the other province in
the directory. **14 probable, 10 possible, 1 none.** Nothing was changed in the database: these are for a person to confirm.
Note that some directory entries are works (Vametco, Rhovan) or a prospect (Elandsfontein) rather than a mine, so a listing
there is not the same as a listed mine.

The account owner confirmed 11 of the second-pass matches (the ones whose directory entry is a mine) on 2026-11-15; they are
marked like the others, so **119 of the 144 are listed**. The three works/prospect matches (Vametco, Rhovan, Elandsfontein)
and the 10 weak ones were left unverified.

Six more were confirmed on 2026-11-15 against the better candidate the first pass had listed as an alternative: Marula
Clapham and Driekop shafts (13633 Marula Platinum Mine), Western Chrome Mines Mooinooi and Waterkloof (12891 Samancor
Western Chrome Mines), Kroondal (13204 Kroondal Mine) and Mamatwan (10564 Hotazel Manganese Mines - Mamatwan Mine). **125 of
the 144 are listed.** Nchwaning, ECM Magareng, Black Chrome, Vlakpoort and iMpunzi stay unverified.

Vametco (10650) and Rhovan (12667) are listed in D1-2024 as **works** and Elandsfontein (15155) as a **prospect**. They were
marked on 2026-11-15 with that wording ("Listed in DMPR D1-2024 directory as a works/prospect; 2026 status not confirmed"),
so they are not shown as listed mines. **128 of the 144 now carry a D1-2024 listing**; 16 are unverified.

Seven weak matches were marked on 2026-11-15 at the account owner's request, but as **"Possible DMPR D1-2024 listing (weak
match: …)"** with `verified_on` left empty, so they are **not** counted as listed: Alexander Bay Mining (10614), Phalaborwa
(10205), Khomanani (13204), Bakgatla Spud Shaft (14701, a works), Nchwaning (10020), Bokone (12701) and Morula (12701, whose
commodity does not fit). **128 listed, 7 possible, 9 unverified.**

Ntuane was marked on 2026-11-15 as listed under the Horizon Chrome Mine entry (13263), which the directory uses for both
Horizon and Ntuane. **129 listed, 7 possible, 8 unverified.**

On 2026-11-15 the account owner then asked for the 7 weak matches (Alexander Bay Mining, Phalaborwa, Khomanani, Bakgatla Spud
Shaft, Nchwaning, Bokone, Morula) to be marked as **listed**. They are, with `verified_on` set; Bakgatla Spud keeps "as a works".
Their `source_ref` still records that the match was weak (an owner-name or company-entry match, and for Morula a chrome entry
for a platinum mine), so the evidence behind each is visible. **136 listed, 8 unverified.**

Crocodile River was marked on 2026-11-15 as listed under Barplats Mines (12158, owner Eastern Platinum, Brits), matched by owner and
operator rather than by name. **137 listed, 7 unverified.**

Vlakpoort was marked on 2026-11-15 as listed under Destiny Springs Investment 11 (15528, Afarak Group, shared farm Vlakpoort 388 KQ).
The directory lists chrome ore there while the research source says platinum; that difference is recorded in `source_ref`.
**138 listed, 6 unverified.**

ECM Magareng was marked on 2026-11-15 as listed under Magareng Mine (14797, owner Glencore, Lydenburg), found by a wider search of the
directory by name and farm. **139 listed, 5 unverified.** For ECM Winterveld the directory has only the umbrella entry 10727 Eastern
Chrome Mines, and for iMpunzi 10633 Tweefontein Complex is a possible fit; both were left unverified.
