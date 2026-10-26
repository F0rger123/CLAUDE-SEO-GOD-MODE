/**
 * What a website is built with and where it's hosted, from public signals only:
 *  - the homepage's response headers and HTML (OBSERVED), and
 *  - its DNS records via DNS-over-HTTPS at dns.google: name servers (DNS provider) and MX (email provider) (OBSERVED),
 *    from which the host is sometimes INFERRED (for example Wix or Squarespace name servers).
 * Regex only, no DOM, so it also runs in the background worker for the hover cards on Google.
 */
const H = (headers, k) => String(headers[k] || "").toLowerCase();

// [name, test(headers, html)] — hosting/CDN from headers first, then the HTML.
const HOSTS = [
  ["Cloudflare (CDN)", (h) => h["cf-ray"] || /cloudflare/.test(H(h, "server"))],
  ["Vercel", (h) => h["x-vercel-id"] || /vercel/.test(H(h, "server"))],
  ["Netlify", (h) => h["x-nf-request-id"] || /netlify/.test(H(h, "server"))],
  ["GitHub Pages", (h) => h["x-github-request-id"] && /github/.test(H(h, "server"))],
  ["Amazon CloudFront (CDN)", (h) => h["x-amz-cf-id"] || /cloudfront/.test(H(h, "via"))],
  ["Amazon S3", (h) => /amazons3/.test(H(h, "server"))],
  ["Fastly (CDN)", (h) => /fastly/.test(H(h, "x-served-by") + H(h, "via") + H(h, "server")) || h["x-fastly-request-id"]],
  ["Google Cloud", (h) => /google frontend|gws/.test(H(h, "server")) || h["x-cloud-trace-context"]],
  ["Microsoft Azure", (h) => h["x-azure-ref"] || h["x-ms-request-id"]],
  ["WP Engine", (h) => h["wpe-backend"] || /wp ?engine/.test(H(h, "x-powered-by"))],
  ["Kinsta", (h) => h["x-kinsta-cache"]],
  ["Pantheon", (h) => h["x-pantheon-styx-hostname"]],
  ["Acquia", (h) => h["x-ah-environment"]],
  ["SiteGround", (h) => /siteground/.test(H(h, "x-proxy-cache-info") + H(h, "host-header")) || h["x-sg-id"]],
  ["Hostinger", (h) => /hcdn|hostinger/.test(H(h, "server") + H(h, "platform"))],
  ["Fly.io", (h) => h["fly-request-id"]],
  ["Render", (h) => h["x-render-origin-server"] || h["rndr-id"]],
  ["Railway", (h) => /railway/.test(H(h, "server"))],
  ["Sucuri (firewall)", (h) => h["x-sucuri-id"]],
  ["Wix", (h, x) => h["x-wix-request-id"] || /pepyaka/.test(H(h, "server")) || /static\.wixstatic\.com/.test(x)],
  ["Squarespace", (h, x) => /squarespace/.test(H(h, "server")) || /static1\.squarespace\.com/.test(x)],
  ["Shopify", (h, x) => h["x-shopify-stage"] || h["x-shopid"] || /cdn\.shopify\.com/.test(x)],
  ["Webflow", (h, x) => /data-wf-site=/.test(x)],
  ["Framer", (h, x) => /framerusercontent\.com|framer\.com\/m\//.test(x)],
  ["GoDaddy Website Builder", (h, x) => /^dps\//.test(H(h, "server")) || /img1\.wsimg\.com/.test(x)],
];

const BUILT = [
  ["WordPress", /wp-content\/|wp-includes\/|generator" content="wordpress/i],
  ["WooCommerce", /woocommerce/i], ["Elementor", /elementor/i], ["Divi", /et_pb_|\/themes\/Divi\//], ["Yoast SEO", /yoast/i], ["Rank Math", /rank-math|rankmath/i],
  ["Shopify", /cdn\.shopify\.com|shopify\.theme/i], ["Wix", /static\.wixstatic\.com|wix\.com website builder/i], ["Squarespace", /static1\.squarespace\.com/i],
  ["Webflow", /data-wf-site=/i], ["Framer", /framerusercontent\.com/i], ["GoDaddy Website Builder", /img1\.wsimg\.com/i], ["Duda", /multiscreensite|dudaone|irp\.cdn-website\.com/i],
  ["Weebly", /editmysite\.com|weebly\.com/i], ["HubSpot", /hs-scripts\.com|js\.hsforms\.net|hubspot/i], ["Drupal", /drupal-settings-json|\/sites\/default\/files\/|generator" content="drupal/i], ["Joomla", /\/media\/jui\/|generator" content="joomla/i], ["Ghost", /generator" content="ghost/i],
  ["BigCommerce", /cdn\d*\.bigcommerce\.com/i], ["Magento", /Magento_|mage\/cookies|static\/version\d+\/frontend/],
  ["Next.js", /__NEXT_DATA__|\/_next\/static/], ["Nuxt", /__NUXT__|\/_nuxt\//], ["Gatsby", /___gatsby/], ["Astro", /astro-island|data-astro-cid/],
  ["SvelteKit", /__sveltekit/], ["Remix", /__remixContext/], ["Angular", /ng-version=/], ["Vue", /data-v-[0-9a-f]{6,}/], ["React", /data-reactroot|react-dom/i],
  ["jQuery", /jquery(\.min)?\.js|jquery-\d/i], ["Bootstrap", /bootstrap(\.min)?\.(css|js)/i], ["Tailwind CSS", /tailwind/i],
];

const TOOLS = [
  ["Google Analytics 4", /gtag\/js\?id=G-|googletagmanager\.com\/gtag\/js\?id=G-/], ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
  ["Google Ads tag", /gtag\/js\?id=AW-|AW-\d{6,}/], ["Meta Pixel", /connect\.facebook\.net\/[^"']*fbevents/], ["Microsoft Clarity", /clarity\.ms/],
  ["Hotjar", /static\.hotjar\.com|hotjar/i], ["Plausible", /plausible\.io\/js/], ["Fathom", /usefathom\.com/], ["Matomo", /matomo|piwik/i],
  ["LinkedIn Insight", /snap\.licdn\.com/], ["TikTok Pixel", /analytics\.tiktok\.com/], ["CallRail", /callrail/i], ["Intercom", /intercom/i],
  ["Tawk.to", /tawk\.to/], ["Drift", /js\.driftt\.com|drift\.com/], ["Zendesk", /zdassets\.com|zendesk/i], ["Calendly", /calendly\.com/],
  ["Housecall Pro", /housecallpro/i], ["Jobber", /getjobber|jobber\.com/i], ["ServiceTitan", /servicetitan/i],
  ["Google reCAPTCHA", /recaptcha/i], ["Cloudflare Turnstile", /challenges\.cloudflare\.com\/turnstile/], ["Font Awesome", /font-?awesome/i], ["Google Fonts", /fonts\.googleapis\.com/],
];

/** headers: plain object with lowercase keys. */
export function detectTech(html = "", headers = {}) {
  const x = String(html).slice(0, 1.5e6);
  const gen = (x.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i) || x.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']generator["']/i) || [])[1] || "";
  const hosting = HOSTS.filter(([, t]) => t(headers, x)).map(([n]) => n);
  const built = BUILT.filter(([, re]) => re.test(x)).map(([n]) => n);
  if (gen && !built.some((b) => gen.toLowerCase().includes(b.toLowerCase().split(" ")[0]))) built.unshift(gen.replace(/\s+[\d.]+$/, "").slice(0, 40));
  const server = [headers.server, headers["x-powered-by"]].filter(Boolean).map((v) => String(v).slice(0, 40));
  return { hosting: [...new Set(hosting)], built: [...new Set(built)], tools: TOOLS.filter(([, re]) => re.test(x)).map(([n]) => n), server, generator: gen };
}

const NS = [[/cloudflare\.com$/, "Cloudflare"], [/domaincontrol\.com$/, "GoDaddy"], [/awsdns/, "Amazon Route 53"], [/googledomains\.com$|ns-cloud-\w+\.googledomains|google\.com$/, "Google Cloud DNS"],
  [/azure-dns/, "Microsoft Azure DNS"], [/registrar-servers\.com$/, "Namecheap"], [/nsone\.net$/, "NS1"], [/dnsimple/, "DNSimple"], [/vercel-dns\.com$/, "Vercel"],
  [/netlify/, "Netlify"], [/wixdns\.net$/, "Wix"], [/squarespacedns\.com$/, "Squarespace"], [/hostgator/, "HostGator"], [/bluehost/, "Bluehost"], [/siteground/, "SiteGround"],
  [/dreamhost/, "DreamHost"], [/ui-dns\./, "IONOS"], [/dns-parking\.com$|hostinger/, "Hostinger"], [/name\.com$/, "Name.com"], [/porkbun/, "Porkbun"], [/digitalocean/, "DigitalOcean"],
  [/linode/, "Linode/Akamai"], [/wpengine/, "WP Engine"], [/kinsta/, "Kinsta"], [/hover\.com$/, "Hover"], [/worldnic|networksolutions/, "Network Solutions"], [/shopify/, "Shopify"]];
const MX = [[/google\.com$|googlemail\.com$/, "Google Workspace"], [/outlook\.com$|protection\.outlook/, "Microsoft 365"], [/zoho/, "Zoho Mail"], [/secureserver\.net$/, "GoDaddy email"],
  [/pphosted\.com$/, "Proofpoint"], [/mimecast/, "Mimecast"], [/protonmail/, "Proton Mail"], [/improvmx/, "ImprovMX"], [/titan\.email$/, "Titan"], [/icloud\.com$/, "iCloud Mail"],
  [/mxroute/, "MXroute"], [/hostinger/, "Hostinger email"], [/fastmail/, "Fastmail"]];
// Name servers that mean the site itself is hosted there (INFERRED).
const NS_HOST = { Wix: "Wix", Squarespace: "Squarespace", Vercel: "Vercel", Netlify: "Netlify", "WP Engine": "WP Engine", Kinsta: "Kinsta", Shopify: "Shopify" };

const pick = (names, table) => [...new Set(names.map((n) => (table.find(([re]) => re.test(n)) || [, null])[1]).filter(Boolean))];

/** Name servers and mail servers from DNS-over-HTTPS. Returns {ns, mx, dns, email} or {error}. */
export async function dnsInfo(hostname) {
  const apex = hostname.replace(/^www\./, "");
  const ask = async (type) => {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(apex)}&type=${type}`, { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`DNS lookup answered ${r.status}`);
    return ((await r.json()).Answer || []).map((a) => String(a.data).toLowerCase().replace(/\.$/, "").replace(/^\d+\s+/, ""));
  };
  try {
    const [ns, mx] = await Promise.all([ask("NS"), ask("MX")]);
    return { ns, mx, dns: pick(ns, NS), email: pick(mx, MX) };
  } catch (e) { return { ns: [], mx: [], dns: [], email: [], error: String(e.message || e) }; }
}

/** Full profile for a site: fetches the homepage (needs host access) and asks DNS. Cached for the session. */
const cache = new Map();
export async function techProfile(url) {
  const u = new URL(url);
  if (cache.has(u.origin)) return cache.get(u.origin);
  const job = (async () => {
    let tech = { hosting: [], built: [], tools: [], server: [] }, status = null, error = null;
    try {
      const r = await fetch(u.origin + "/", { credentials: "omit", cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(12000) });
      status = r.status;
      tech = detectTech((await r.text()).slice(0, 2e6), Object.fromEntries([...r.headers].map(([k, v]) => [k.toLowerCase(), v])));
    } catch (e) { error = String(e.message || e); }
    const dns = await dnsInfo(u.hostname);
    const inferred = dns.dns.map((d) => NS_HOST[d]).filter((h) => h && !tech.hosting.some((x) => x.startsWith(h)));
    return { ...tech, hostingInferred: inferred, dns, status, error };
  })();
  cache.set(u.origin, job);
  return job;
}

/** One-line summary, e.g. "WordPress on WP Engine · Cloudflare". */
export function techLine(t) {
  const built = t.built.filter((b) => !/jquery|bootstrap|font|tailwind|yoast|rank math/i.test(b)).slice(0, 2).join(" + ");
  const host = [...t.hosting, ...(t.hostingInferred || [])].slice(0, 2).join(" · ");
  return [built, host && (built ? "on " : "Hosted on ") + host].filter(Boolean).join(" ") || "";
}

/** HTML block for the panel (values escaped). */
export function techBlock(t, esc) {
  const row = (label, xs, note = "") => xs?.length ? `<tr><th>${label}</th><td>${xs.map(esc).join(", ")}${note ? ` <small>${note}</small>` : ""}</td></tr>` : "";
  const rows = row("Built with", t.built) + row("Hosting and CDN", t.hosting) + row("Probably hosted on", t.hostingInferred, "from its name servers")
    + row("Web server", t.server) + row("DNS", t.dns?.dns, t.dns?.ns?.length ? esc(t.dns.ns.slice(0, 2).join(", ")) : "") + row("Email", t.dns?.email) + row("Tracking and tools", t.tools);
  return rows ? `<table class="kv">${rows}</table>` : `<p class="lede">Nothing recognisable${t.error ? ` (${esc(t.error)})` : ""}.</p>`;
}
