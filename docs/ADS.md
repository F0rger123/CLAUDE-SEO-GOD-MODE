# Paid ads: the claude-ads companion plugin

CLAUDE SEO GOD MODE handles organic search. For paid media it uses **claude-ads**, a separate open-source Claude Code plugin, alongside it instead of copying its ~430 files in.

- **Source:** https://github.com/AgriciDaniel/claude-ads (MIT; the same author as claude-seo, whose audit skills are vendored here). Checked 2026-10-25, v2.1.0.
- **Covers:** Google, Meta, YouTube, LinkedIn, TikTok, Microsoft, **Apple Search Ads**, Amazon, Reddit, Pinterest, Snapchat and X. It does account intake, source-grounded audits, budget and measurement planning, creative, experiments, tracking (including server-side and conversions APIs), and reporting.
- **Safety model:** adapters are read-only by default. Account changes stay drafts unless the owner approves within set limits and a rollback exists. Credentials belong in environment variables or the OS keychain, never in chat. That matches `RULES.md` §5.

## Install (owner or agent, with the owner's OK)

```text
/plugin marketplace add agricidaniel/claude-ads
/plugin install claude-ads@ai-marketing-hub-claude-ads
```

Then run `/ads setup`. It asks about the business model, goal, main conversion, monthly spend, active platforms, and who approves changes.

It's a separate plugin, so it updates on its own schedule and keeps its own license and attribution. Don't copy its files into this repo.

## Where SEO and ads meet

| Question | Use |
|---|---|
| Are we paying for clicks we'd already get for free? | Compare Search Console queries (`gsc_search_analytics`, query dimension) with Google Ads search terms (`/ads google`). Branded terms where you already rank #1 are the usual candidates for a test cut. |
| Which landing page should ads use? | Pages that already convert organically (GA4) and pass `rate-my-site` on-page checks. `/ads landing` audits the ad side. |
| Is tracking consistent? | One GA4 property, consistent UTMs (`?utm_source=<platform>&utm_medium=cpc`), and conversions defined once: `/ads attribution` and `/ads tracking`. |
| Local service business | Google Local Services Ads and Search, plus Meta for seasonal pushes. Keep the business name, phone and service area identical across ads, GBP, Apple Business Connect and the site. |

## Rules carried over

- No invented performance numbers or benchmarks. Use only the account's own data, tagged OBSERVED.
- Never launch, raise budgets, or change bids without the owner's explicit yes for that change.
- Ad spend is real money: show the cost of any change before asking for approval.
