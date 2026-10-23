#!/usr/bin/env python3
"""IndexNow: notify participating engines (Bing, Yandex, Seznam, Naver, Yep...) of changed URLs.

Google does NOT use IndexNow. Submitting tells engines a URL changed; it does not guarantee indexing.

Setup (once per site):
  1. indexnow.py keygen                       -> prints a key
  2. Host the key at https://<host>/<key>.txt containing only the key (user/dev task)
  3. indexnow.py verify --host www.example.com --key <key>
Submit:
  indexnow.py submit --host www.example.com --key <key> --urls https://www.example.com/a https://www.example.com/b
  indexnow.py submit --host www.example.com --key <key> --urls-file changed.txt

Only submit URLs that were added, updated, or deleted. Do not resubmit unchanged URLs.
"""
from __future__ import annotations

import argparse
import json
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import common  # noqa: E402

ENDPOINT = "https://api.indexnow.org/indexnow"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["keygen", "verify", "submit"])
    ap.add_argument("--host"); ap.add_argument("--key"); ap.add_argument("--key-location")
    ap.add_argument("--urls", nargs="*", default=[]); ap.add_argument("--urls-file")
    a = ap.parse_args()

    if a.cmd == "keygen":
        print(secrets.token_hex(16))
        return
    if not (a.host and a.key):
        sys.exit("--host and --key required")
    key_url = a.key_location or f"https://{a.host}/{a.key}.txt"
    if a.cmd == "verify":
        r = common.fetch(key_url)
        ok = r["status"] == 200 and r["body"].strip() == a.key
        print(f"{key_url} -> {r['status']} {'OK' if ok else 'MISMATCH or missing'}")
        sys.exit(0 if ok else 1)

    urls = list(a.urls)
    if a.urls_file:
        urls += [l.strip() for l in Path(a.urls_file).read_text(encoding="utf-8").splitlines() if l.strip()]
    bad = [u for u in urls if not common.same_site(u, f"https://{a.host}/")]
    if bad:
        sys.exit(f"URLs not on {a.host}: {bad[:5]}")
    for i in range(0, len(urls), 10000):
        body = {"host": a.host, "key": a.key, "keyLocation": key_url, "urlList": urls[i:i + 10000]}
        req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                print(f"IndexNow HTTP {r.status} for {len(body['urlList'])} URL(s) (200/202 = accepted)")
        except urllib.error.HTTPError as e:
            meaning = {400: "bad request", 403: "key not valid/not found at keyLocation", 422: "URLs don't match host/key",
                       429: "too many requests"}.get(e.code, "")
            sys.exit(f"IndexNow HTTP {e.code} {meaning}")


if __name__ == "__main__":
    main()
