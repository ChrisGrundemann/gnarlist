#!/usr/bin/env python3
"""
Geocode a town/location query using Nominatim (OpenStreetMap).

Usage:
    python3 scripts/geocode.py "Leadville, Colorado"
    python3 scripts/geocode.py "Steamboat Springs, Colorado"

Output: JSON with lat, lng, derived_from, and precision: "town".
Rate limit: 1 request/second per Nominatim policy.

This script is a manual operator tool — run it when adding events, review the
output, then commit coordinates alongside the event record. It does not write
to the data file automatically (per data governance: PR-based review for all changes).
"""

import json
import sys
import time
import urllib.parse
import urllib.request

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "gnarlist-geocoder/0.1 (colorado-ultra-site; contact via github)"


def geocode(query: str) -> dict | None:
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": 1,
        "countrycodes": "us",
    })
    url = f"{NOMINATIM_URL}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

    with urllib.request.urlopen(req) as response:
        results = json.loads(response.read())

    if not results:
        return None

    r = results[0]
    return {
        "lat": round(float(r["lat"]), 4),
        "lng": round(float(r["lon"]), 4),
        "precision": "town",
        "derived_from": query,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/geocode.py \"Town, Colorado\"", file=sys.stderr)
        sys.exit(1)

    queries = sys.argv[1:]
    results = []

    for i, query in enumerate(queries):
        if i > 0:
            time.sleep(1.1)
        result = geocode(query)
        if result:
            results.append(result)
            print(json.dumps(result, indent=2))
        else:
            print(f"No result for: {query!r}", file=sys.stderr)
            results.append(None)

    if len(queries) > 1:
        print(f"\n{sum(1 for r in results if r)} of {len(queries)} queries succeeded.", file=sys.stderr)


if __name__ == "__main__":
    main()
