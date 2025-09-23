import requests
import json

BASE = "https://cab.brown.edu/api/?page=fose"
session = requests.Session()

def set_term(srcdb: str):
    """Switch session to the given term."""
    url = f"{BASE}&route=load-filter-data"
    payload = {"srcdb": srcdb}
    r = session.post(url, json=payload)
    r.raise_for_status()
    return r.json()

def fetch_search(srcdb: str):
    """Fetch the basic list of courses for a term."""
    url = f"{BASE}&route=search&is_ind_study=N&is_canc=N"
    payload = {
        "other": {"srcdb": srcdb},
        "criteria": [
            {"field": "is_ind_study", "value": "N"},
            {"field": "is_canc", "value": "N"}
        ]
    }
    r = session.post(url, json=payload)
    r.raise_for_status()
    return r.json().get("results", [])

def fetch_details(code: str, crn: str, srcdb: str):
    """Fetch the detailed info for a single course/CRN."""
    url = f"{BASE}&route=details"
    payload = {
        "group": f"code:{code}",
        "key": f"crn:{crn}",
        "srcdb": srcdb,
        "matched": f"crn:{crn}",
        "userWithRolesStr": "!!!!!!"
    }
    r = session.post(url, json=payload)
    r.raise_for_status()
    return r.json()

if __name__ == "__main__":
    terms = {"Fall 2025": "202510", "Spring 2026": "202520"}
    all_data = {}

    for label, code in terms.items():
        print(f"Fetching {label}...")
        set_term(code)
        search_results = fetch_search(code)
        courses = []

        for i, course in enumerate(search_results):
            crn = course["crn"]
            details = fetch_details(course["code"], crn, code)
            # Merge search + details (keep raw for now)
            combined = {**course, **details}
            courses.append(combined)
            if i % 50 == 0:
                print(f"  Processed {i}/{len(search_results)} courses...")

        all_data[label] = courses

    with open("brown_courses_full.json", "w") as f:
        json.dump(all_data, f, indent=2)

    print("Saved enriched course data.")
