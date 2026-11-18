"""Fetch published tournament results from JudoManager."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import sys
from urllib.parse import quote, urlencode


API = "https://datav2.judomanager.com/api"
PORTAL = "https://portal.judomanager.com"
JJCB = 2219


def get(endpoint, **params):
    url = f"{API}/{endpoint}?{urlencode(dict(params, Language='en'))}"
    response = subprocess.run(
        ["curl", "-fsS", "--max-time", "20", "--retry", "2",
         "--retry-max-time", "30", url],
        capture_output=True,
    )
    if response.returncode:
        raise ValueError(f"{endpoint}: {response.stderr.decode().strip()}")
    return json.loads(response.stdout)


def placements(athlete_id, year):
    if year is None:
        data = get("JudokaProfile/AllResults", IdAthlete=athlete_id)
    else:
        data = get("JudokaProfile/Results", IdAthlete=athlete_id, Year=year)

    rows = []
    for result in data["results"]:
        event = result["competition"]
        slug = event.get("externalId")
        for entry in result["dataByWeightCategory"]:
            weight = entry.get("weightCategory") or {}
            age = weight.get("ageCategory") or {}
            rows.append({
                "competition_id": event["idCompetition"],
                "competition": event.get("name"),
                "date": (event.get("dateFrom") or "")[:10],
                "competition_url": f"{PORTAL}/competition/{quote(slug, safe='')}" if slug else None,
                "age_category": age.get("name"),
                "weight_category": weight.get("officialName") or weight.get("name"),
                "place": entry.get("place"),
                "points": entry.get("points"),
            })
    return sorted(rows, key=lambda row: row["date"], reverse=True)


def athlete_results(athlete, year):
    athlete_id = athlete["idAthlete"]
    record = {
        "athlete_id": athlete_id,
        "name": f"{athlete['firstName']} {athlete['lastName']}",
        "profile_url": f"{PORTAL}/judoka/{athlete_id}",
    }
    try:
        record["results"] = placements(athlete_id, year)
    except (ValueError, KeyError, TypeError) as error:
        record["error"] = str(error)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, help="Limit to one year. Default is all published years.")
    parser.add_argument("--athlete-id", type=int, action="append",
                        help="Filter to this JJCB athlete ID. Repeat for a list.")
    args = parser.parse_args()

    try:
        roster = get(f"Clubs/{JJCB}/Athletes")
        athletes = {athlete["idAthlete"]: athlete for athlete in roster}
        if args.athlete_id:
            missing = set(args.athlete_id) - athletes.keys()
            if missing:
                ids = ", ".join(map(str, sorted(missing)))
                raise ValueError(f"IDs absent from the public JJCB roster: {ids}")
            athletes = {key: athletes[key] for key in args.athlete_id}
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f"Could not load JJC Bern athletes: {error}\n")

    with ThreadPoolExecutor(max_workers=4) as pool:
        records = list(pool.map(lambda athlete: athlete_results(athlete, args.year),
                                athletes.values()))
    print(json.dumps({
        "club_id": JJCB,
        "club": "JJC Bern",
        "year": args.year,
        "athletes": records,
    }, ensure_ascii=False, indent=2))
    return int(any("error" in record for record in records))


if __name__ == "__main__":
    sys.exit(main())
