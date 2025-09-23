#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Brown Bulletin concentration scraper
- Scrapes the index page for all concentration links (using robust selectors that match the actual HTML).
- Scrapes each concentration page for requirements tables and footnotes.
- If the scraper finds < 5 courses on a page, send the full page text to OpenAI to extract structured requirements.
- Keeps the old logging style with counters and DEBUG/ERROR lines.
- Does NOT deduplicate courses (leaves duplicates exactly as found).
- Saves a single JSON file "concentrations.json".
"""

import os
import re
import json
import time
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# ----- Optional OpenAI augmentation -----
# Requires OPENAI_API_KEY in environment.
# Tested with openai>=1.0.0 (python SDK v1)
OPENAI_ENABLED = bool(os.getenv("OPENAI_API_KEY"))
if OPENAI_ENABLED:
    try:
        from openai import OpenAI
        openai_client = OpenAI()
        OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    except Exception as e:
        print(f"[ERROR] Failed to initialize OpenAI client: {e}")
        OPENAI_ENABLED = False

BASE_URL = "https://bulletin.brown.edu"
INDEX_URL = f"{BASE_URL}/the-college/concentrations/"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BrownScraper/1.0; +https://example.org/bot)"
}

REQUEST_TIMEOUT = 30
THROTTLE_SECONDS = 0.7  # be gentle

def safe_get(url: str) -> requests.Response | None:
    try:
        res = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        return res
    except Exception as e:
        print(f"[ERROR] Request failed for {url}: {e}")
        return None

# ---------------------------
# Step 1: Get concentration links (reverted to robust selectors)
# ---------------------------
def get_concentration_links() -> list[str]:
    res = safe_get(INDEX_URL)
    if not res:
        return []

    soup = BeautifulSoup(res.text, "html.parser")

    # The index page lists links in two columns (.cola and .colb) inside #textcontainer .page_content
    # Robust selector: any anchor under #textcontainer with href starting with /the-college/concentrations/
    anchors = soup.select('div#textcontainer a[href^="/the-college/concentrations/"]')

    links = []
    for a in anchors:
        href = a.get("href", "")
        # Skip anchors that are not concentration detail pages (just in case)
        if href.strip() and href.startswith("/the-college/concentrations/"):
            # Exclude the index root itself if encountered
            if href.rstrip("/").endswith("/the-college/concentrations"):
                continue
            full = BASE_URL + href
            if full not in links:
                links.append(full)

    return links

# ---------------------------
# Helpers for scraping a concentration page
# ---------------------------

def parse_requirements_table(soup: BeautifulSoup) -> list[dict]:
    """
    Parse requirement tables with class .sc_courselist.
    Return list of areas, each with list of courses.
    Keep duplicates as-is.
    """
    requirements = []
    for table in soup.select("table.sc_courselist"):
        current_area = None
        current_courses = []

        for tr in table.select("tbody > tr"):
            # Area headers
            if "areaheader" in tr.get("class", []):
                # Flush previous area if exists
                if current_area is not None:
                    requirements.append({
                        "area": current_area,
                        "courses": current_courses
                    })
                    current_courses = []
                # New area name from span.courselistcomment or text content
                area_text = tr.get_text(" ", strip=True)
                # Clean like "1. Core Courses:" → "1. Core Courses:"
                area_text = re.sub(r"\s+", " ", area_text)
                current_area = area_text.replace("\xa0", " ")

            else:
                tds = tr.find_all("td")
                if len(tds) >= 2:
                    code = tds[0].get_text(" ", strip=True)
                    title = tds[1].get_text(" ", strip=True)
                    credits = None
                    if len(tds) >= 3:
                        cred_txt = tds[2].get_text(" ", strip=True)
                        credits = cred_txt or None

                    # Keep everything; don't deduplicate.
                    if code or title:
                        current_courses.append({
                            "code": code.replace("\xa0", " "),
                            "title": title.replace("\xa0", " "),
                            "credits": credits
                        })

        # Flush last area in this table
        if current_area is not None:
            requirements.append({
                "area": current_area,
                "courses": current_courses
            })

    return requirements

def parse_footnotes(soup: BeautifulSoup) -> dict:
    """
    Parse footnotes in <dl class="sc_footnotes"> ... <dt><sup>#</sup></dt><dd>text</dd>
    """
    footnotes = {}
    for dl in soup.select("dl.sc_footnotes"):
        dts = dl.find_all("dt")
        dds = dl.find_all("dd")
        for dt, dd in zip(dts, dds):
            num = dt.get_text("", strip=True)
            # Extract number from things like "1" or whitespace around it
            num = re.sub(r"[^\d]", "", num)
            text = dd.get_text(" ", strip=True).replace("\xa0", " ")
            if num:
                footnotes[num] = text
    return footnotes

# ---------------------------
# Step 2: OpenAI helper (called only when <5 courses found)
# ---------------------------

OPENAI_PROMPT = """You are a reliable parser of Brown University concentration pages.
Extract ALL explicit course requirements and footnotes from the page text.

Return STRICT JSON with this shape (no surrounding prose, no markdown fences):
{
  "requirements": [
    {"area": string, "courses": [{"code": string, "title": string, "credits": string|null}, ...]},
    ...
  ],
  "footnotes": { "1": string, "2": string, ... }
}

Rules:
- Keep duplicates you see in the page text (do NOT deduplicate).
- If credits aren't explicit, set "credits": null.
- If a page is mostly prose (no tables), still extract clearly enumerated required courses (e.g., AFRI 0090, AFRI 1330, AFRI 1360) as one area named "General Requirements".
- Do not invent codes or titles. If a code is partially shown, include exactly what appears.
- For 'OR' or 'Choose one' groupings, create a separate area whose name reflects the grouping (e.g., "Choose one") and include all listed course options.
- Include footnotes as a number → text map if present; else empty object.
"""

def openai_parse_requirements(page_text: str, url: str) -> dict:
    if not OPENAI_ENABLED:
        return {"requirements": [], "footnotes": {}}

    try:
        print(f"[DEBUG] {url} → sending to OpenAI...")
        resp = openai_client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": OPENAI_PROMPT},
                {"role": "user", "content": f"URL: {url}\n\nPAGE TEXT:\n{page_text}"}
            ],
            temperature=0
        )
        content = resp.choices[0].message.content or ""

        # Some models may return fenced code blocks; strip if present.
        content = content.strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content).strip()

        parsed = json.loads(content)
        # Normalize fields just in case
        if "requirements" not in parsed or not isinstance(parsed["requirements"], list):
            parsed["requirements"] = []
        if "footnotes" not in parsed or not isinstance(parsed["footnotes"], dict):
            parsed["footnotes"] = {}
        return parsed

    except Exception as e:
        print(f"[ERROR] OpenAI parsing failed for {url}: {e}")
        return {"requirements": [], "footnotes": {}}

# ---------------------------
# Step 3: Scraper for individual concentration
# ---------------------------

def scrape_concentration(url: str, idx: int, total: int) -> dict:
    print(f"Scraping {idx}/{total}: {url}")

    res = safe_get(url)
    if not res:
        return {
            "name": "Brown University",
            "url": url,
            "requirements": [],
            "footnotes": {},
            "used_openai": False
        }

    soup = BeautifulSoup(res.text, "html.parser")

    # 1) Primary: parse tables and footnotes
    scraped_requirements = parse_requirements_table(soup)
    scraped_footnotes = parse_footnotes(soup)

    scraper_course_count = sum(len(area.get("courses", [])) for area in scraped_requirements)

    used_openai = False
    combined_requirements = list(scraped_requirements)  # keep duplicates as-is
    combined_footnotes = dict(scraped_footnotes)

    # 2) If too few courses (<5), augment with OpenAI
    if scraper_course_count < 5:
        page_text = soup.get_text("\n", strip=True)
        parsed = openai_parse_requirements(page_text, url)
        # Append (do not deduplicate)
        combined_requirements.extend(parsed.get("requirements", []))
        # Merge footnotes (favor scraped first; add missing from OpenAI)
        for k, v in parsed.get("footnotes", {}).items():
            if k not in combined_footnotes:
                combined_footnotes[k] = v
        used_openai = OPENAI_ENABLED

    total_areas = len(combined_requirements)
    print(f"[DEBUG] {url} → {total_areas} total requirement areas (scraper + OpenAI), {scraper_course_count} scraper courses")

    return {
        "name": "Brown University",
        "url": url,
        "requirements": combined_requirements,
        "footnotes": combined_footnotes,
        "used_openai": used_openai
    }

# ---------------------------
# Step 4: Main
# ---------------------------

def main():
    urls = get_concentration_links()
    if not urls:
        print("[ERROR] No concentration links found.")
        return

    results = []
    used_openai_count = 0
    scraper_only_count = 0

    total = len(urls)
    for i, url in enumerate(urls, start=1):
        conc = scrape_concentration(url, i, total)
        results.append(conc)
        if conc.get("used_openai"):
            used_openai_count += 1
        else:
            scraper_only_count += 1
        time.sleep(THROTTLE_SECONDS)

    # Summary
    print("\n--- Summary ---")
    print(f"Total concentrations: {total}")
    print(f"Scraper only: {scraper_only_count}")
    print(f"Enhanced with OpenAI (<5 courses): {used_openai_count}")

    # Save output
    with open("concentrations.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    main()
