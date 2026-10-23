# Security

## Credentials

- Credentials come from environment variables only. Scripts check that a variable is set and never print its value.
- Never paste API keys, service-account JSON, or OAuth secrets into chat. Point Claude at the environment variable name instead.
- Keep credential files outside both repositories (skill and client data), for example `~/.config/agency-zero-seo/`.
- `.gitignore` blocks common credential filenames, but it is a safety net, not a control. Check `git status` before every commit.
- OAuth tokens for Search Console are cached at `~/.config/agency-zero-seo/gsc-token.json`. Delete the file to revoke locally; revoke in your Google Account to revoke fully.

## Least privilege

| System | Grant |
|---|---|
| Search Console | Add the service account as a **Full** user on only the properties you manage. Use Owner only if a write action returns 403. Read-only reporting works with **Restricted**. |
| Bing Webmaster | One API key covers every site on the account. Use an agency account that holds only client sites. Regenerate the key if it leaks. |
| Google Cloud | One project for your SEO work. Enable only Search Console API, PageSpeed Insights API, Chrome UX Report API. Restrict the API key to those APIs. |
| Google Business Profile | Use Manager access, not Primary Owner, unless ownership transfer is the task. |
| CMS | Prefer a dedicated user with Editor role (no plugin install, no user management). |

## Write actions need approval

Claude must ask before each of these, every time:

- Search Console: submitting or deleting a sitemap.
- Bing: submitting or removing sitemaps or URLs.
- IndexNow submissions.
- Any change to a live site, DNS, GBP, or third-party listing.
- Sending any message or report to a client.

## Client data

- Client state, crawl output, and reports live in `$SEO_CLIENTS_DIR`, never in this repo.
- Search Console and Bing exports can include query data. Treat it as confidential client data.
- Do not upload client data to third-party tools unless the client has agreed.

## Third-party tools and MCP servers

Before enabling any community MCP server or package:

1. Read its source or at least its README and the code that handles credentials.
2. Pin a version or commit. Do not auto-update tools that hold credentials.
3. Prefer local (stdio) servers over hosted ones. Hosted servers see your data and tokens.
4. Prefer read-only modes when available.
5. For prebuilt binaries, verify the release checksum and that the release comes from the repository owner.

`references/tools.md` records the security notes for every tool this repo mentions.

## Crawling etiquette

- `crawl.py` honors robots.txt by default and waits between requests. Do not lower the delay below 0.2 s on small business hosting.
- Crawl only sites you are authorized to audit (the client's site) and public competitor pages at low volume. Do not crawl competitor sites in full.
