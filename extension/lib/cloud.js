/**
 * Phone sync: a tiny client for SEO God Mode's Supabase project, shared by the extension and the Android app.
 * No account needed: turning sync on makes a random sync code, and every device that has the code shares one copy of
 * your tracked sites. An account (username + password, no email, optional) just remembers the code for you.
 * The database files rows under a hash of the code and only answers requests that carry it; the tables can't be read directly. Only the publishable key is here.
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

/** A server error as plain words. notReady: the database script hasn't been run yet (the functions don't exist). */
export function serverError(res, j, what) {
  if (res.status === 404 || j.code === "PGRST202")
    return Object.assign(new Error("The sync server isn't set up yet: its database script hasn't been run."), { notReady: true });
  // 23514: a check rule refused the row. Today that only means the "General" site type's database script hasn't been run.
  if (j.code === "23514") return Object.assign(new Error("General sites can't sync until the sync server's newest database script is run."), { needsUpdate: true });
  return new Error(j.message || `${what} (${res.status})`);
}

/** store: { load(): {code, user?}|null, save({code, user?}|null) }. Read from the store on every call, never cached. */
export function makeCloud(store) {
  async function rpc(fn, args) {
    const s = await store.load();
    if (!s?.code) throw Object.assign(new Error("Sync is off"), { signedOut: true });
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify({ p_code: s.code, ...args }),
      headers: { apikey: SB_KEY, "content-type": "application/json" } });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw serverError(res, j, "Sync failed"); }
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

  /**
   * Optional account: a username and password, no email. The account only remembers a sync code. Creating one saves this
   * device's code (or a new one); signing in switches this device to the account's code. kind: "signin" or "signup".
   * Returns { code, switched } where switched means this device was on a different code before.
   */
  async function account(kind, user, password) {
    user = String(user || "").trim().toLowerCase();
    if (!/^[a-z0-9._@-]{3,60}$/.test(user)) throw new Error("Pick a username of 3 to 60 letters, numbers, dots, dashes or underscores.");
    if (String(password || "").length < 8) throw new Error("Use a password of at least 8 characters.");
    const before = (await store.load())?.code || null;
    const res = await fetch(`${SB_URL}/rest/v1/rpc/sgm_account`, { method: "POST",
      body: JSON.stringify({ p_name: user, p_password: password, p_create: kind === "signup", p_code: kind === "signup" ? before || newCode() : null }),
      headers: { apikey: SB_KEY, "content-type": "application/json" } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw serverError(res, j, "Sign in failed");
    if (j.error) throw new Error(j.error);
    const code = cleanCode(j.code);
    if (!code) throw new Error("Sign in failed (no sync code on the account)");
    const switched = !!before && before !== code;
    if (switched) await store.save(null);
    await store.save({ code, user });
    return { code, switched };
  }

  return {
    current: () => store.load(),
    account,
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
  competitor_of: s.role === "competitor" || s.role === "general" ? s.competitorOf || null : null, keywords: (s.keywords || []).slice(0, 200),
  added_at: s.addedAt || new Date().toISOString(), deleted_at: deleted ? new Date().toISOString() : null });
export const siteFromRow = (r) => ({ origin: r.origin, name: r.name, addedAt: r.added_at, keywords: r.keywords || [], role: r.role, competitorOf: r.competitor_of || null });
