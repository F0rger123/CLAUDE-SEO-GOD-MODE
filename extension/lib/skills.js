/**
 * Links each extension check to the CLAUDE SEO GOD MODE skill: the workflow that explains the fix in depth and the
 * skill command that checks or fixes it across the whole site. Used for "Open guide" links and inside fix prompts.
 */
export const REPO = "https://github.com/F0rger123/CLAUDE-SEO-GOD-MODE";
const doc = (p) => `${REPO}/blob/main/${p}`;

const ONPAGE = { guide: "workflows/on-page-seo.md" };
const TECH = { guide: "workflows/technical-seo.md" };
const SCHEMA = { guide: "workflows/schema.md", cmd: "python scripts/schema/generate_schema.py <client> localbusiness" };
const ANSWER = { guide: "skills/ai-search-answer-workflow/SKILL.md", cmd: "python scripts/ai_answer/answer_check.py --site {origin} --crawl <crawl.json>" };
const GEO = { guide: "workflows/aeo-geo.md", cmd: "python scripts/crawling/robots_check.py {origin}" };
const LOCAL = { guide: "workflows/local-seo.md" };

export const SKILL_MAP = {
  title: ONPAGE, description: ONPAGE, h1: ONPAGE, headings: ONPAGE, alt: ONPAGE, og: ONPAGE,
  canonical: TECH, mobile: TECH, https: TECH, httpredirect: TECH, soft404: TECH, blocking: TECH, imgsize: TECH,
  speed: { guide: "workflows/technical-seo.md", cmd: "python scripts/integrations/pagespeed.py psi {url}" },
  indexable: { guide: "workflows/indexing.md", cmd: "python scripts/integrations/gsc.py inspect --site <property> --urls {url}" },
  robots: { guide: "workflows/indexing.md", cmd: "python scripts/crawling/robots_check.py {origin}" },
  sitemap: { guide: "workflows/indexing.md", cmd: "python scripts/sitemap/sitemap_check.py <sitemap url>" },
  jsonld: SCHEMA, entity: SCHEMA, faq: { guide: "workflows/schema.md", cmd: "python scripts/schema/generate_schema.py <client> faq --faq-file faqs.json" },
  words: ANSWER, structure: ANSWER, questions: ANSWER, answer: ANSWER, snippet: ANSWER, rawhtml: ANSWER,
  aibots: GEO, sources: GEO, eeat: GEO,
  bing: { guide: "workflows/bing-webmaster.md", cmd: "python scripts/integrations/bing.py url-info --site <site> --url {url}" },
  sameas: { guide: "workflows/apple-business-connect.md" }, where: LOCAL, contact: LOCAL,
  status: TECH, sitemapdecl: { guide: "workflows/indexing.md" }, insitemap: { guide: "workflows/indexing.md", cmd: "python scripts/sitemap/sitemap_check.py <sitemap url>" },
  canonicalself: TECH, mixed: TECH, refresh: TECH, hreflang: TECH, url: { guide: "skills/vendor/marketingskills/site-architecture/SKILL.md" },
  titlebrand: ONPAGE, h1title: ONPAGE, emptyh: ONPAGE, lang: TECH, basics: TECH, twitter: ONPAGE, textratio: TECH,
  internal: { guide: "workflows/on-page-seo.md", cmd: "python scripts/links/link_check.py <crawl.json>" }, anchors: ONPAGE, nofollowint: ONPAGE,
  imgformat: TECH, imgresp: TECH, cls: TECH, ttfb: TECH, lcplazy: TECH, weight: TECH, compression: TECH, zoom: TECH,
  schemaany: SCHEMA, breadcrumb: SCHEMA, website: SCHEMA, article: SCHEMA, selfreview: SCHEMA, entityfields: SCHEMA, authority: GEO,
  imagepreview: ANSWER, definition: ANSWER, passages: { guide: "skills/vendor/geo-seo-claude/geo-citability/SKILL.md" }, longparas: ANSWER,
  lists: ANSWER, reading: { guide: "skills/vendor/marketingskills/copy-editing/SKILL.md" }, freshness: { guide: "workflows/content-strategy.md" },
  userbots: GEO, aboutcontact: LOCAL, authoritylinks: GEO, stats: GEO, proof: { guide: "workflows/local-seo.md" }, llms: GEO,
};

export const guideUrl = (id) => (SKILL_MAP[id]?.guide ? doc(SKILL_MAP[id].guide) : REPO);
export const skillCmd = (id, page) => (SKILL_MAP[id]?.cmd || "").replaceAll("{origin}", page.origin).replaceAll("{url}", page.url);

/** Skill commands shown on the Fix prompt tab. */
export const siteCommands = (page) => [
  ["Rate the site from a terminal (same scores as the Whole site view)", `python scripts/rate_site.py ${page.origin}`],
  ["Make pages answer the questions people search (uses Search Console)", "skills/ai-search-answer-workflow"],
  ["Full audit with client memory and issue tracking", `python scripts/audit.py --url ${page.origin}`],
  ["Apple Maps and Google Business Profile listings", "workflows/apple-business-connect.md, workflows/local-seo.md"],
];
