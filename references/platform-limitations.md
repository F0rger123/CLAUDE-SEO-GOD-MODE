# Platform limitations (CMS / website builders)

Use to set expectations and to route fixes to the right person.

| Platform | Titles/meta | Canonical | robots.txt | Sitemap | Schema | Redirects | Speed control | Notes |
|---|---|---|---|---|---|---|---|---|
| WordPress | Full (Yoast/Rank Math/SEOPress) | Plugin | Plugin or file | Core `/wp-sitemap.xml` or plugin | Plugin + custom | Plugin (Redirection) or server | High | Check Settings > Reading "Discourage search engines" after launches. Page builders add weight. |
| Shopify | Full | Auto (sometimes duplicate `/collections/x/products/y`) | Editable via `robots.txt.liquid` | Auto `/sitemap.xml` | Theme JSON-LD + apps | Built-in URL redirects | Medium | Fixed URL prefixes (`/products/`, `/pages/`, `/collections/`). |
| Wix | Full | Auto | Editable | Auto | Custom JSON-LD per page | Built-in 301 manager | Low–medium | Server-side rendered; IndexNow and GSC connection built in. |
| Squarespace | Full | Auto | Not editable | Auto | Limited (code injection) | URL mappings | Low | Some templates add duplicate pages (tags/categories). |
| Webflow | Full | Setting | Editable | Auto | Custom code embeds | 301 settings | Medium–high | Clean HTML output. |
| GoDaddy Website Builder | Limited | Limited | No | Auto | Very limited | Limited | Low | Often worth migrating for serious SEO. |
| Duda | Full | Auto | Editable | Auto | Built-in + custom | Built-in | Medium | Common for agency resellers. |
| Next.js / React | Full (code) | Code | Code | Code (`app/sitemap.ts`) | Code | `next.config` / middleware | High | Ensure SSR/SSG for indexable pages; avoid client-only rendering. |
| Astro / static | Full (code) | Code | File | `@astrojs/sitemap` | Code | Host config | High | Excellent default performance. |

## Access patterns

- Client edits the site themselves: Claude produces copy-ready changes in a table (URL, field, new value).
- Developer edits: Claude produces a ticket-style list with acceptance criteria and verification commands.
- Claude has CMS/repo access: make changes only with per-change approval; re-run checks after.

## Third-party limitations

- Directory/citation sites: edits often require claiming listings; slow; manual.
- GBP: edits may trigger re-verification; category changes can shift rankings temporarily.
- Hosting: 5xx errors, slow TTFB, bot-blocking WAF rules are host/CDN-level fixes.
