#!/usr/bin/env python3
"""Generate JSON-LD from the client's state.json profile. Facts come only from the profile.

Types: organization, localbusiness, website, service, faq, breadcrumb.
Missing facts are left out and listed, never invented.

Usage:
  generate_schema.py d-hauss localbusiness --subtype GeneralContractor
  generate_schema.py d-hauss service --service "Kitchen Remodeling" --url https://example.com/kitchen-remodeling/
  generate_schema.py d-hauss faq --faq-file faqs.json        # [{"q": "...", "a": "..."}]
  generate_schema.py d-hauss breadcrumb --crumbs "Home=https://example.com/" "Services=https://example.com/services/"
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402


def compact(d: dict) -> dict:
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}


def address(loc: dict) -> dict | None:
    if not loc.get("street"):
        return None
    return compact({"@type": "PostalAddress", "streetAddress": loc.get("street"), "addressLocality": loc.get("city"),
                    "addressRegion": loc.get("region"), "postalCode": loc.get("postal"),
                    "addressCountry": loc.get("country", "US")})


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("kind", choices=["organization", "localbusiness", "website", "service", "faq", "breadcrumb"])
    ap.add_argument("--subtype", default="LocalBusiness", help="schema.org LocalBusiness subtype")
    ap.add_argument("--location", type=int, default=0, help="index in profile.locations")
    ap.add_argument("--service")
    ap.add_argument("--url")
    ap.add_argument("--faq-file")
    ap.add_argument("--crumbs", nargs="*")
    a = ap.parse_args()

    p = common.read_json(common.client_dir(a.slug) / "state.json")["profile"]
    site = (p.get("website") or "").rstrip("/")
    org_id = f"{site}/#organization"
    facts = p.get("brand_facts", {})
    missing = []

    if a.kind == "organization":
        data = compact({"@context": "https://schema.org", "@type": "Organization", "@id": org_id,
                        "name": p.get("business_name"), "url": site + "/", "logo": facts.get("logo_url"),
                        "telephone": p.get("primary_phone"), "email": p.get("email"),
                        "foundingDate": facts.get("founded"), "sameAs": p.get("social_profiles")})
        missing = [k for k in ("logo", "sameAs") if k not in data]
    elif a.kind == "localbusiness":
        locs = p.get("locations") or [{}]
        loc = locs[min(a.location, len(locs) - 1)] if isinstance(locs[0], dict) else {}
        hours = loc.get("hours_spec")  # list of {"days": ["Monday",...], "opens": "08:00", "closes": "17:00"}
        data = compact({
            "@context": "https://schema.org", "@type": a.subtype,
            "@id": f"{site}/#localbusiness" + (f"-{a.location}" if a.location else ""),
            "name": p.get("business_name"), "url": site + "/", "telephone": loc.get("phone") or p.get("primary_phone"),
            "email": p.get("email"), "image": facts.get("image_url") or facts.get("logo_url"),
            "logo": facts.get("logo_url"), "priceRange": facts.get("price_range"),
            "address": address(loc),
            "geo": compact({"@type": "GeoCoordinates", "latitude": loc.get("lat"), "longitude": loc.get("lng")})
            if loc.get("lat") else None,
            "areaServed": [{"@type": "City", "name": c} for c in p.get("service_area", [])],
            "openingHoursSpecification": [compact({"@type": "OpeningHoursSpecification", "dayOfWeek": h["days"],
                                                   "opens": h["opens"], "closes": h["closes"]}) for h in hours or []],
            "hasMap": loc.get("gbp_url"), "sameAs": p.get("social_profiles"),
            "parentOrganization": {"@id": org_id} if facts.get("separate_org") else None,
        })
        if not loc.get("street"):
            data.pop("address", None)
            missing.append("address (OK to omit for service-area businesses that hide their address on GBP)")
        missing += [k for k in ("telephone", "image", "geo", "openingHoursSpecification") if k not in data]
    elif a.kind == "website":
        data = {"@context": "https://schema.org", "@type": "WebSite", "@id": f"{site}/#website",
                "name": p.get("business_name"), "url": site + "/", "publisher": {"@id": org_id}}
    elif a.kind == "service":
        if not a.service:
            sys.exit("--service required")
        data = compact({"@context": "https://schema.org", "@type": "Service", "name": a.service,
                        "serviceType": a.service, "url": a.url,
                        "provider": {"@id": f"{site}/#localbusiness"} if p.get("locations") else {"@id": org_id},
                        "areaServed": [{"@type": "City", "name": c} for c in p.get("service_area", [])]})
    elif a.kind == "faq":
        if not a.faq_file:
            sys.exit("--faq-file required (JSON list of {q, a}); FAQs must match visible page text")
        faqs = json.loads(Path(a.faq_file).read_text(encoding="utf-8"))
        data = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": f["q"], "acceptedAnswer": {"@type": "Answer", "text": f["a"]}} for f in faqs]}
    else:
        crumbs = [c.split("=", 1) for c in a.crumbs or []]
        data = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)]}

    print('<script type="application/ld+json">')
    print(json.dumps(data, indent=2, ensure_ascii=False))
    print("</script>")
    if missing:
        print(f"\n<!-- Missing facts (add to profile, do not invent): {'; '.join(missing)} -->", file=sys.stderr)


if __name__ == "__main__":
    main()
