/**
 * Phone sync: a tiny client for SEO God Mode's Supabase project, shared by the extension and the Android app.
 * No accounts and no emails: turning sync on makes a random sync code, and every device that has the code shares
 * one copy of your tracked sites. The database files rows under a hash of the code and only answers requests that
 * carry it; the tables can't be read directly. Only the publishable key is here.
 *
 * Rows: sites (one per tracked website) and data (score history, positions, keyword reports, latest scans, one JSON
 * value per key, same keys as the extension's storage). The server stamps updated_at; the newest change wins.
 */
export const SB_URL = "https://ouinmglpmeqriowdbwes.supabase.co";
export const SB_KEY = "sb_publishable_5Ec2QcbhogpOxxs8LhUAMA_eoWOAWvQ";
export const EPOCH = "1970-01-01T00:00:00Z";
const PAGE = 500;
// Crockford base32: no I, L, O or U, so the code is easy to read out and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A new random code: 20 characters (100 bits), shown as XXXX-XXXX-XXXX-XXXX-XXXX. */
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return formatCode([...bytes].map((b) => ALPHABET[b & 31]).join(""));
}
/** Tidy a typed code (any case, spaces or dashes; O read as 0, I and L as 1). Returns null if it isn't one. */
export function cleanCode(text) {
  const v = String(text || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(v) ? formatCode(v) : null;
}
const formatCode = (v) => v.replace(/-/g, "").match(/.{4}/g).join("-");

/** store: { load(): {code}|null, save({code}|null) }. Read from the store on every call, never cached. */
export function makeCloud(store) {
  async function rpc(fn, args) {
    const s = await store.load();
    if (!s?.code) throw Object.assign(new Error("Sync is off"), { signedOut: true });
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify({ p_code: s.code, ...args }),
      headers: { apikey: SB_KEY, "content-type": "application/json" } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `Sync failed (${res.status})`); }
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  /** Every row changed after `since`, oldest first. table: "sites" or "site_data". */
  async function changes(table, since) {
    const out = [];
    for (let cur = since; ;) {
      const rows = (await rpc("sgm_pull", { p_table: table === "sites" ? "sites" : "data", p_since: cur })) || [];
      out.push(...rows);
      if (rows.length < PAGE) return out;
      cur = rows[rows.length - 1].updated_at;
    }
  }
  const push = async (fn, rows, size) => { for (let i = 0; i < rows.length; i += size) await rpc(fn, { p_rows: rows.slice(i, i + size) }); };

  return {
    current: () => store.load(),
    /** Turn sync on with a code (a new one, or one from another device). */
    async use(code) { const c = cleanCode(code); if (!c) throw new Error("That isn't a sync code. It looks like XXXX-XXXX-XXXX-XXXX-XXXX."); await store.save({ code: c }); return c; },
    signOut: () => store.save(null),
    changes,
    putSites: (rows) => push("sgm_push_sites", rows, 200),
    // Whole-site scans can be large, so a few at a time.
    putData: (rows) => push("sgm_push_data", rows, 5),
  };
}

// Local site entry <-> sites row.
export const siteRow = (s, deleted = false) => ({ origin: s.origin, name: s.name || "", role: s.role || "mine",
  competitor_of: s.role === "competitor" ? s.competitorOf || null : null, keywords: (s.keywords || []).slice(0, 200),
  added_at: s.addedAt || new Date().toISOString(), deleted_at: deleted ? new Date().toISOString() : null });
export const siteFromRow = (r) => ({ origin: r.origin, name: r.name, addedAt: r.added_at, keywords: r.keywords || [], role: r.role, competitorOf: r.competitor_of || null });
