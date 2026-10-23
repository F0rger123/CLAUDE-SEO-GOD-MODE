"""Shared helpers for Agency Zero SEO scripts. Standard library only."""
from __future__ import annotations

import gzip
import re
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urldefrag, urljoin, urlparse, urlunparse

USER_AGENT = "AgencyZeroSEO/1.0 (+site audit; contact site owner)"
SKILL_ROOT = Path(__file__).resolve().parents[1]

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def clients_dir() -> Path:
    return Path(os.environ.get("AZ_SEO_CLIENTS", Path.home() / "agency-zero-clients")).expanduser()


def client_dir(slug: str) -> Path:
    return clients_dir() / slug


def today() -> str:
    return date.today().isoformat()


def write_json(path: Path, data) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def normalize_url(url: str, base: str | None = None) -> str:
    """Absolute URL, no fragment, lowercase scheme/host, empty path becomes '/'."""
    if base:
        url = urljoin(base, url)
    url, _ = urldefrag(url.strip())
    p = urlparse(url)
    path = p.path or "/"
    return urlunparse((p.scheme.lower(), p.netloc.lower(), path, p.params, p.query, ""))


def same_site(url: str, root: str) -> bool:
    a, b = urlparse(url).netloc.lower(), urlparse(root).netloc.lower()
    strip = lambda h: h[4:] if h.startswith("www.") else h
    return strip(a) == strip(b)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def fetch(url: str, method: str = "GET", timeout: int = 20, max_redirects: int = 10, max_bytes: int = 5_000_000):
    """Fetch a URL and follow redirects manually so the chain is recorded.

    Returns dict: url, final_url, status, chain [(url, status)], headers, body (str), elapsed_ms, error.
    """
    chain, current, start = [], url, time.time()
    for _ in range(max_redirects + 1):
        req = urllib.request.Request(current, method=method, headers={
            "User-Agent": USER_AGENT, "Accept-Encoding": "gzip", "Accept": "text/html,application/xml;q=0.9,*/*;q=0.8"})
        try:
            resp = _opener.open(req, timeout=timeout)
            status, headers = resp.status, resp.headers
            raw = resp.read(max_bytes) if method != "HEAD" else b""
        except urllib.error.HTTPError as e:
            status, headers = e.code, e.headers
            raw = e.read(max_bytes) if method != "HEAD" and e.fp else b""
        except Exception as e:  # DNS, TLS, timeout
            return {"url": url, "final_url": current, "status": None, "chain": chain, "headers": {},
                    "body": "", "elapsed_ms": int((time.time() - start) * 1000), "error": f"{type(e).__name__}: {e}"}
        chain.append((current, status))
        if status in (301, 302, 303, 307, 308) and headers.get("Location"):
            current = urljoin(current, headers["Location"])
            continue
        if headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
            try:
                raw = gzip.decompress(raw)
            except OSError:
                pass
        charset = headers.get_content_charset() if hasattr(headers, "get_content_charset") else None
        return {"url": url, "final_url": current, "status": status, "chain": chain,
                "headers": {k.lower(): v for k, v in headers.items()},
                "body": raw.decode(charset or "utf-8", errors="replace"),
                "elapsed_ms": int((time.time() - start) * 1000), "error": None}
    return {"url": url, "final_url": current, "status": None, "chain": chain, "headers": {}, "body": "",
            "elapsed_ms": int((time.time() - start) * 1000), "error": "too many redirects"}


class PageParser(HTMLParser):
    """Collects the SEO-relevant parts of an HTML document."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.meta, self.links, self.canonical = "", {}, [], None
        self.headings, self.images, self.jsonld, self.hreflang = [], [], [], []
        self.og, self.lang, self.text_parts, self.script_count = {}, None, [], 0
        self._stack, self._buf, self._in_title, self._in_jsonld, self._skip = [], [], False, False, 0
        self.robots_meta = ""

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "html":
            self.lang = a.get("lang")
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            name = (a.get("name") or "").lower()
            prop = (a.get("property") or "").lower()
            if name:
                self.meta[name] = a.get("content", "")
                if name in ("robots", "googlebot"):
                    self.robots_meta = (self.robots_meta + "," + a.get("content", "")).strip(",")
            if prop.startswith("og:") or prop.startswith("twitter:"):
                self.og[prop] = a.get("content", "")
        elif tag == "link":
            rel = (a.get("rel") or "").lower().split()
            if "canonical" in rel:
                self.canonical = a.get("href")
            if "alternate" in rel and a.get("hreflang"):
                self.hreflang.append({"hreflang": a["hreflang"], "href": a.get("href")})
        elif tag == "a" and a.get("href"):
            self.links.append({"href": a["href"], "rel": a.get("rel", ""), "text": ""})
            self._stack.append("a")
        elif tag == "img":
            self.images.append({"src": a.get("src") or a.get("data-src", ""), "alt": a.get("alt"),
                                "width": a.get("width"), "height": a.get("height"), "loading": a.get("loading")})
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.headings.append([int(tag[1]), ""])
            self._stack.append(tag)
        elif tag == "script":
            self.script_count += 1
            if "ld+json" in (a.get("type") or "").lower():
                self._in_jsonld, self._buf = True, []
            else:
                self._skip += 1
        elif tag in ("style", "noscript", "template"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script":
            if self._in_jsonld:
                self.jsonld.append("".join(self._buf))
                self._in_jsonld = False
            elif self._skip:
                self._skip -= 1
        elif tag in ("style", "noscript", "template") and self._skip:
            self._skip -= 1
        elif self._stack and self._stack[-1] == tag:
            self._stack.pop()

    def handle_data(self, data):
        if self._in_jsonld:
            self._buf.append(data)
            return
        if self._skip:
            return
        if self._in_title:
            self.title += data
        if "a" in self._stack and self.links:
            self.links[-1]["text"] += data
        if any(t.startswith("h") for t in self._stack) and self.headings:
            self.headings[-1][1] += data
        self.text_parts.append(data)

    @property
    def text(self) -> str:
        return " ".join(" ".join(self.text_parts).split())


def parse_html(html: str) -> PageParser:
    p = PageParser()
    try:
        p.feed(html)
    except Exception:
        pass
    p.title = " ".join(p.title.split())
    for h in p.headings:
        h[1] = " ".join(h[1].split())
    for link in p.links:
        link["text"] = " ".join(link["text"].split())
    return p


def parse_jsonld(blocks: list[str]) -> tuple[list[dict], list[str]]:
    """Return (flattened schema objects, parse errors)."""
    items, errors = [], []
    for raw in blocks:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            errors.append(f"Invalid JSON-LD: {e.msg} at line {e.lineno}")
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            obj = stack.pop(0)
            if isinstance(obj, dict):
                if "@graph" in obj:
                    stack.extend(obj["@graph"])
                else:
                    items.append(obj)
    return items, errors


def schema_types(obj: dict) -> list[str]:
    t = obj.get("@type", [])
    return t if isinstance(t, list) else [t]


class Robots:
    """robots.txt matcher following Google's rules (RFC 9309).

    Python's urllib.robotparser applies the first matching rule, so 'Allow: /' listed before
    'Disallow: /app' allows /app. Google uses the longest matching rule (Allow wins ties),
    supports '*' and '$', and picks the most specific matching user-agent group.
    """

    def __init__(self, text: str = ""):
        self.groups: list[tuple[list[str], list[tuple[bool, str]]]] = []
        agents, rules, last_was_agent = [], [], False
        for raw in text.splitlines():
            line = raw.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            key, val = (x.strip() for x in line.split(":", 1))
            key = key.lower()
            if key == "user-agent":
                if not last_was_agent and (agents or rules):
                    self.groups.append((agents, rules))
                    agents, rules = [], []
                agents.append(val.lower())
                last_was_agent = True
            elif key in ("allow", "disallow"):
                last_was_agent = False
                if val or key == "allow":
                    rules.append((key == "allow", val))
            else:
                last_was_agent = False
        if agents:
            self.groups.append((agents, rules))

    @classmethod
    def fetch(cls, site: str) -> "Robots":
        r = fetch(normalize_url("/robots.txt", site))
        # 4xx: no restrictions. 5xx/unreachable: Google treats the site as fully disallowed for a while.
        if r["status"] and 400 <= r["status"] < 500:
            return cls("")
        if r["status"] != 200:
            return cls("User-agent: *\nDisallow: /")
        return cls(r["body"])

    def _rules_for(self, agent: str) -> list[tuple[bool, str]]:
        agent = agent.lower().split("/")[0]
        best, best_len, star = None, -1, None
        for agents, rules in self.groups:
            for a in agents:
                if a == "*":
                    star = (star or []) + rules
                elif agent.startswith(a) and len(a) > best_len:
                    best, best_len = rules, len(a)
        if best is not None:
            # Merge every group naming the same most specific agent.
            merged = []
            for agents, rules in self.groups:
                if any(a != "*" and agent.startswith(a) and len(a) == best_len for a in agents):
                    merged += rules
            return merged
        return star or []

    @staticmethod
    def _match(pattern: str, path: str) -> bool:
        regex = "".join(".*" if c == "*" else ("$" if c == "$" and i == len(pattern) - 1 else re.escape(c))
                        for i, c in enumerate(pattern))
        return re.match(regex, path) is not None

    def can_fetch(self, agent: str, url: str) -> bool:
        p = urlparse(url)
        path = (p.path or "/") + (("?" + p.query) if p.query else "")
        best_len, allowed = -1, True
        for allow, pattern in self._rules_for(agent):
            if self._match(pattern, path):
                n = len(pattern)
                if n > best_len or (n == best_len and allow):
                    best_len, allowed = n, allow
        return allowed


def md_table(rows: list[dict], cols: list[str], limit: int | None = None) -> str:
    rows = rows[:limit] if limit else rows
    if not rows:
        return "_None._\n"
    out = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for r in rows:
        out.append("| " + " | ".join(str(r.get(c, "")).replace("|", "\\|").replace("\n", " ") for c in cols) + " |")
    return "\n".join(out) + "\n"
