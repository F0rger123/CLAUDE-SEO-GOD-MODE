"""Smoke test: start mcp/server.py over stdio, list tools, call offline-safe tools.

Run: python tests/test_mcp_server.py   (needs `pip install -r mcp/requirements.txt`; network for robots check)
"""
import asyncio
import os
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {"seo_status", "seo_client_resume", "seo_audit", "seo_ai_answer_check", "gsc_search_analytics",
            "gsc_inspect_urls", "gsc_submit_sitemap", "bing_report", "bing_submit", "indexnow_submit", "pagespeed"}


async def main() -> int:
    env = {**os.environ}
    env.pop("SEO_GODMODE_ALLOW_WRITES", None)
    params = StdioServerParameters(command=sys.executable, args=[str(ROOT / "mcp" / "server.py")], env=env)
    async with stdio_client(params) as (r, w), ClientSession(r, w) as s:
        await s.initialize()
        names = {t.name for t in (await s.list_tools()).tools}
        print(f"{len(names)} tools:", ", ".join(sorted(names)))
        missing = EXPECTED - names
        assert not missing, f"missing tools: {missing}"
        status = (await s.call_tool("seo_status", {})).content[0].text
        print(status)
        refusal = (await s.call_tool("gsc_submit_sitemap", {"site": "sc-domain:example.com",
                                                             "sitemap_url": "https://example.com/sitemap.xml",
                                                             "confirm": True})).content[0].text
        assert refusal.startswith("REFUSED"), refusal
        print("write guard OK:", refusal[:80])
        robots = (await s.call_tool("seo_robots_check", {"site": "https://example.com", "paths": ["/"]})).content[0].text
        assert "robots.txt" in robots, robots
        print("robots OK")
        env_err = (await s.call_tool("bing_report", {"report": "sites"})).content[0].text
        assert "BING_WEBMASTER_API_KEY" in env_err or env_err.startswith("["), env_err
        print("missing-credential handling OK")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
