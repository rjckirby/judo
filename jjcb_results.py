"""Fetch published tournament results from JudoManager."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import json
import subprocess
import sys
from urllib.parse import quote, urlencode


API = "https://datav2.judomanager.com/api"
PORTAL = "https://portal.judomanager.com"
JJCB = 2219
SJV = 19


def get(endpoint, **params):
    url = f"{API}/{endpoint}?{urlencode(dict(params, Language='en'))}"
    response = subprocess.run(
        ["curl", "-fsS", "--compressed", "--max-time", "20", "--retry", "2",
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


def athlete_from_person(person):
    return {
        "idAthlete": person["idPerson"],
        "firstName": person["givenName"],
        "lastName": person["familyName"],
    }


def swiss_result_events(year):
    today = date.today()
    first = date(year or today.year - 1, 1, 1)
    last = date(year, 12, 31) if year else today
    page = 1
    while True:
        calendar = get("Calendar", Type="Competitions", PartnersIds=SJV,
                       DateFrom=first, DateTo=last, Page=page, PerPage=100)
        for event in calendar["list"]:
            details = event.get("competitionOnlyDetails") or {}
            if details.get("hasIndividualResults"):
                yield event["idEntity"]
        if not calendar["hasMore"]:
            return
        page += 1


def tournament_athletes(competition_id):
    results = get("Competition/GetResults", IdCompetition=competition_id)
    athletes = {}
    for result in results:
        person = result.get("person") or {}
        club = result.get("club") or {}
        if club.get("idClub") == JJCB and person.get("idClub") == JJCB:
            athletes[person["idPerson"]] = athlete_from_person(person)
    return athletes


def club_athletes(athlete_ids, year):
    roster = get(f"Clubs/{JJCB}/Athletes")
    athletes = {athlete["idAthlete"]: athlete for athlete in roster}
    if athlete_ids:
        selected = {}
        for athlete_id in dict.fromkeys(athlete_ids):
            athlete = athletes.get(athlete_id)
            if athlete is None:
                profile = get("JudokaProfile/Info", IdAthlete=athlete_id)["athlete"]
                if profile["idClub"] != JJCB:
                    raise ValueError(f"Athlete {athlete_id} is absent from the JJC Bern roster and has a different club")
                athlete = athlete_from_person(profile)
            selected[athlete_id] = athlete
        return selected

    # The public roster omits some competitors listed in federation results.
    events = list(dict.fromkeys(swiss_result_events(year)))
    with ThreadPoolExecutor(max_workers=4) as pool:
        for discovered in pool.map(tournament_athletes, events):
            for athlete_id, athlete in discovered.items():
                athletes.setdefault(athlete_id, athlete)
    return athletes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, help="Limit to one year. Default is all published years.")
    parser.add_argument("--athlete-id", type=int, action="append",
                        help="Filter to this JJCB athlete ID. Repeat for a list.")
    args = parser.parse_args()

    try:
        athletes = club_athletes(args.athlete_id, args.year)
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
