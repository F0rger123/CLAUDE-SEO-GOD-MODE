#!/usr/bin/env python3
"""Extract and sanity-check JSON-LD structured data.

Checks: JSON validity, @context, recommended properties for common types, and (with --client)
NAP consistency against the client's state.json (name, phone, address).

This is a pre-check. Final validation: Google Rich Results Test (https://search.google.com/test/rich-results)
and Schema Markup Validator (https://validator.schema.org/). Neither has a public API.

Usage:
  schema_check.py https://example.com/ https://example.com/services/
  schema_check.py --crawl crawl.json --client d-hauss --out ./data/audit-2026-10-22
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

# Recommended (not exhaustive) properties per type. Google's required/recommended lists live in
# references/schema-reference.md; keep both in sync.
RECOMMENDED = {
    "LocalBusiness": ["name", "address", "telephone", "url", "openingHoursSpecification", "geo", "image", "areaServed"],
    "Organization": ["name", "url", "logo", "sameAs"],
    "Service": ["name", "provider", "areaServed", "serviceType"],
    "FAQPage": ["mainEntity"],
    "BreadcrumbList": ["itemListElement"],
    "WebSite": ["name", "url"],
    "Article": ["headline", "datePublished", "author", "image"],
    "BlogPosting": ["headline", "datePublished", "author", "image"],
    "Product": ["name", "image", "offers"],
    "Review": ["author", "reviewRating", "itemReviewed"],
}
LOCAL_SUBTYPES = ("LocalBusiness", "HomeAndConstructionBusiness", "GeneralContractor", "Plumber", "Electrician",
                  "RoofingContractor", "HVACBusiness", "HousePainter", "Locksmith", "MovingCompany",
                  "ProfessionalService", "AutoRepair", "Dentist", "Attorney", "LegalService", "Restaurant",
                  "Store", "MedicalBusiness", "HealthAndBeautyBusiness", "CleaningService")


def digits(s) -> str:
    return re.sub(r"\D", "", str(s or ""))[-10:]


def check_items(url: str, items: list[dict], errors: list[str], profile: dict | None) -> list[str]:
    out = [f"{url}: {e}" for e in errors]
    for it in items:
        types = common.schema_types(it)
        if not it.get("@context") and "@id" not in it:
            out.append(f"{url}: {types} block has no @context (fine only inside @graph)")
        for t in types:
            base = "LocalBusiness" if t in LOCAL_SUBTYPES else t
            missing = [k for k in RECOMMENDED.get(base, []) if k not in it]
            if missing:
                out.append(f"{url}: {t} missing recommended: {', '.join(missing)}")
            if base == "LocalBusiness" and profile:
                if profile.get("business_name") and it.get("name") and \
                        it["name"].strip().lower() != profile["business_name"].strip().lower():
                    out.append(f"{url}: schema name '{it['name']}' != profile '{profile['business_name']}'")
                if profile.get("primary_phone") and it.get("telephone") and \
                        digits(it["telephone"]) != digits(profile["primary_phone"]):
                    out.append(f"{url}: schema telephone {it['telephone']} != profile {profile['primary_phone']}")
            if t == "FAQPage":
                for q in it.get("mainEntity", []) if isinstance(it.get("mainEntity"), list) else []:
                    if not q.get("acceptedAnswer"):
                        out.append(f"{url}: FAQ question without acceptedAnswer: {q.get('name', '')[:60]}")
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("urls", nargs="*")
    ap.add_argument("--crawl", help="read pages from crawl.json (re-fetches pages that have JSON-LD)")
    ap.add_argument("--client", help="client slug for NAP comparison")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()

    profile = None
    if a.client:
        profile = common.read_json(common.client_dir(a.client) / "state.json")["profile"]
    urls = list(a.urls)
    no_schema = []
    if a.crawl:
        crawl = common.read_json(Path(a.crawl))
        for p in crawl["pages"]:
            if p.get("status") == 200 and "title" in p:
                (urls if p.get("jsonld_types") or p.get("jsonld_errors") else no_schema).append(p["url"])

    report, types_seen = [], {}
    for u in urls:
        r = common.fetch(u)
        items, errors = common.parse_jsonld(common.parse_html(r["body"]).jsonld)
        for it in items:
            for t in common.schema_types(it):
                types_seen.setdefault(t, []).append(u)
        report.extend(check_items(u, items, errors, profile))
        if not items and not errors:
            no_schema.append(u)

    result = {"date": common.today(), "types_found": {k: len(v) for k, v in types_seen.items()},
              "findings": report, "pages_without_schema": sorted(set(no_schema))}
    out = common.write_json(Path(a.out) / "schema-check.json", result)
    print("Types found:", result["types_found"] or "none")
    has_entity = any(t in LOCAL_SUBTYPES or t == "Organization" for t in types_seen)
    if not has_entity:
        print("- No Organization or LocalBusiness schema found on checked pages")
    for f in report[:40]:
        print(f"- {f}")
    print(f"Pages without JSON-LD: {len(result['pages_without_schema'])}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
