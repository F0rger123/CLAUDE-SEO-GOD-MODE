#!/usr/bin/env python3
"""Apple Maps presence check via the official Apple Maps Server API (read-only).

Answers: "Does this business show up on Apple Maps near its market, and with what name, address and category?"
That's the place card Siri, Apple Maps, Safari and CarPlay show. Apple doesn't let anyone edit listings through
this API. Listing changes happen in Apple Business Connect (manual or browser-assisted), or through an Apple-approved
partner. See workflows/apple-business-connect.md.

Credentials (Apple Developer Program membership, then Certificates, Identifiers & Profiles > Keys > a key with
"Maps ID / MapKit JS" enabled):
  APPLE_MAPS_TEAM_ID     your 10-character Team ID (Membership page)
  APPLE_MAPS_KEY_ID      the key's 10-character Key ID
  APPLE_MAPS_KEY_FILE    path to the downloaded AuthKey_XXXXXXXXXX.p8 (keep it outside any repo)
Save them with: python scripts/setup/connect.py apple --team <TEAMID> --key-id <KEYID> --key-file <path.p8>
Signing needs the `cryptography` package (scripts/requirements.txt).

Usage:
  apple_maps.py check --name "Mason-Dixon LED" --near "York, PA"
  apple_maps.py check --name "Summit Ridge Roofing" --lat 39.96 --lng -76.73 --address "123 Main St" --json out.json
  apple_maps.py token-test
"""
from __future__ import annotations

import argparse
import base64
import difflib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

API = "https://maps-api.apple.com/v1"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def auth_jwt() -> str:
    """Sign a Maps auth token (ES256, scope server_api). Apple doesn't accept static tokens for the Server API."""
    team, kid, keyfile = (os.environ.get(k) for k in ("APPLE_MAPS_TEAM_ID", "APPLE_MAPS_KEY_ID", "APPLE_MAPS_KEY_FILE"))
    if not (team and kid and keyfile):
        sys.exit("Apple Maps not connected. Set APPLE_MAPS_TEAM_ID, APPLE_MAPS_KEY_ID, APPLE_MAPS_KEY_FILE "
                 "(python scripts/setup/connect.py apple ...). See docs/CONNECT.md, Apple Maps section.")
    if not Path(keyfile).exists():
        sys.exit(f"Key file not found: {keyfile}")
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    except ImportError:
        sys.exit("Missing package: pip install cryptography (or python scripts/setup/connect.py deps)")
    key = serialization.load_pem_private_key(Path(keyfile).read_bytes(), password=None)
    now = int(time.time())
    header = _b64(json.dumps({"alg": "ES256", "kid": kid, "typ": "JWT"}).encode())
    payload = _b64(json.dumps({"iss": team, "iat": now, "exp": now + 1800, "scope": "server_api"}).encode())
    der = key.sign(f"{header}.{payload}".encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    return f"{header}.{payload}.{_b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"


def access_token() -> str:
    req = urllib.request.Request(f"{API}/token", headers={"Authorization": f"Bearer {auth_jwt()}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())["accessToken"]
    except urllib.error.HTTPError as e:
        sys.exit(f"Apple refused the Maps token (HTTP {e.code}): check Team ID, Key ID, and that the key has Maps enabled. "
                 f"{e.read().decode('utf-8', 'replace')[:200]}")


def get(path: str, params: dict, token: str) -> dict:
    url = f"{API}/{path}?{urllib.parse.urlencode({k: v for k, v in params.items() if v})}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def similarity(a: str, b: str) -> float:
    clean = lambda s: " ".join(re.sub(r"[^a-z0-9 ]", " ", (s or "").lower().replace("&", " and ")).split())
    return difflib.SequenceMatcher(None, clean(a), clean(b)).ratio()


def cmd_check(a):
    token = access_token()
    loc = f"{a.lat},{a.lng}" if a.lat is not None and a.lng is not None else ""
    if not loc and a.near:
        g = get("geocode", {"q": a.near, "limitToCountries": a.country}, token).get("results", [])
        if g:
            loc = f"{g[0]['coordinate']['latitude']},{g[0]['coordinate']['longitude']}"
    res = get("search", {"q": a.name, "searchLocation": loc, "limitToCountries": a.country,
                         "resultTypeFilter": "Poi", "lang": "en-US"}, token).get("results", [])
    rows = []
    for p in res[:10]:
        addr = ", ".join(p.get("formattedAddressLines", []))
        rows.append({"name": p.get("name"), "address": addr, "category": p.get("poiCategory", ""), "id": p.get("id"),
                     "name_match": round(similarity(a.name, p.get("name", "")), 2),
                     "address_match": round(similarity(a.address, addr), 2) if a.address else None,
                     "coordinate": p.get("coordinate")})
    rows.sort(key=lambda r: -r["name_match"])
    best = rows[0] if rows and rows[0]["name_match"] >= 0.8 else None
    if best and (best["address_match"] is None or best["address_match"] >= 0.6):
        verdict = "FOUND"
    elif best:
        verdict = "FOUND_ADDRESS_DIFFERS"
    else:
        verdict = "NOT_FOUND"
    out = {"date": common.today(), "query": a.name, "near": a.near or loc, "verdict": verdict, "tag": "OBSERVED",
           "best_match": best, "candidates": rows,
           "note": "Apple's public place data (name, address, category). Phone, hours, website and photos are managed in "
                   "Apple Business Connect and aren't returned here, so they stay UNKNOWN."}
    print(f"Apple Maps: {verdict} for '{a.name}' near {a.near or loc or 'anywhere'}")
    if best:
        print(f"  {best['name']} | {best['address']} | {best['category']} | name match {best['name_match']}"
              + (f", address match {best['address_match']}" if best["address_match"] is not None else ""))
    elif rows:
        print("  Closest results (not a confident match):")
        for r in rows[:3]:
            print(f"   - {r['name']} | {r['address']} ({r['name_match']})")
    if verdict == "NOT_FOUND":
        print("  -> Claim and create the place card in Apple Business Connect: workflows/apple-business-connect.md")
    if a.json:
        common.write_json(Path(a.json), out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("--name", required=True); c.add_argument("--near"); c.add_argument("--lat", type=float); c.add_argument("--lng", type=float)
    c.add_argument("--address", default=""); c.add_argument("--country", default="US"); c.add_argument("--json")
    c.set_defaults(fn=cmd_check)
    sub.add_parser("token-test").set_defaults(fn=lambda a: (access_token(), print("Apple Maps token OK")))
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
