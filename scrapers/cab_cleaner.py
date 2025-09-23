import json
from collections import defaultdict
from bs4 import BeautifulSoup
import argparse

# ---------- helpers ----------
def _extract_int(seats_html, class_name):
    """Extract integer from seats_html span."""
    if not seats_html:
        return None
    soup = BeautifulSoup(seats_html, "html.parser")
    span = soup.find("span", {"class": class_name})
    if span and span.text.isdigit():
        return int(span.text)
    return None

def parse_meeting_times(raw_str):
    """Parse CAB meetingTimes JSON string into structured list."""
    try:
        times = json.loads(raw_str)
    except Exception:
        return []
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    result = []
    for t in times:
        day_idx = int(t.get("meet_day", -1))
        result.append({
            "day": days[day_idx] if 0 <= day_idx < len(days) else "Unknown",
            "start_time": t.get("start_time", ""),
            "end_time": t.get("end_time", "")
        })
    return result

def parse_html_list(html):
    """Extract bullet items from HTML list."""
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    return [li.get_text(" ", strip=True) for li in soup.find_all("li")]

def parse_exam(html):
    """Extract exam info text from HTML snippet."""
    if not html:
        return ""
    return BeautifulSoup(html, "html.parser").get_text(" ", strip=True)

# ---------- transformer ----------
def normalize_course(raw, semester_name):
    """Transform a raw CAB course JSON object into normalized schema."""
    return {
        "semester": semester_name,
        "department": raw["code"].split()[0],
        "course_number": raw["code"].split()[1],
        "course_name": raw["title"],
        "crn": raw["crn"],  # unique course-section key
        "section": raw.get("no", ""),
        "maximum_enrollment": _extract_int(raw.get("seats"), "seats_max"),
        "seats_available": _extract_int(raw.get("seats"), "seats_avail"),
        "instructor": raw.get("instr", "").strip(),
        "description": raw.get("description", "").strip(),
        "location": BeautifulSoup(raw.get("meeting_html", ""), "html.parser").get_text(" ", strip=True),
        "schedule": parse_meeting_times(raw.get("meetingTimes", "[]")),
        "attributes": parse_html_list(raw.get("attr_html", "")),
        "restrictions": BeautifulSoup(raw.get("registration_restrictions", ""), "html.parser").get_text(" ", strip=True),
        "exam": parse_exam(raw.get("exam_html", ""))
    }

# ---------- deduplicator ----------
def deduplicate(courses):
    """Deduplicate by CRN. Logs duplicates separately."""
    seen = {}
    duplicates = defaultdict(list)

    for c in courses:
        crn = c["crn"]
        if crn in seen:
            duplicates[crn].append(c)
        else:
            seen[crn] = c

    # report duplicates
    if duplicates:
        print("\n[!] Duplicate CRNs detected:")
        for crn, dups in duplicates.items():
            print(f"  - CRN {crn}: {len(dups)+1} total copies")

    return list(seen.values()), duplicates

# ---------- main ----------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Normalize and deduplicate CAB course data.")
    parser.add_argument("--input", type=str, required=True, help="Input raw CAB JSON file")
    args = parser.parse_args()
    with open(args.input) as f:
        raw_data = json.load(f)

    normalized_by_semester = {}
    all_duplicates = {}

    for semester_name, raw_courses in raw_data.items():
        normalized = [normalize_course(c, semester_name) for c in raw_courses]
        deduped, duplicates = deduplicate(normalized)
        normalized_by_semester[semester_name] = deduped
        if duplicates:
            all_duplicates[semester_name] = duplicates

    with open("cab_normalized.json", "w") as f:
        json.dump(normalized_by_semester, f, indent=2)

    if all_duplicates:
        with open("cab_duplicates.json", "w") as f:
            json.dump(all_duplicates, f, indent=2)
        print(f"\nSaved duplicates → cab_duplicates.json")

    print(f"\n✅ Saved normalized data → cab_normalized.json")
