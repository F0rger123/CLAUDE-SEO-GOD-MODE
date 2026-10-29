/**
 * Phone sync: a tiny client for SEO God Mode's Supabase project, shared by the extension and the Android app.
 * Off until you sign in with your email. Only the publishable key is here; the database rules let each signed-in
 * user read and change only their own rows, and signed-out requests get nothing.
 *
 * Rows: sites (one per tracked website) and site_data (score history, positions, keyword reports, latest scans,
 * one JSON value per key, same keys as the extension's storage). The server stamps updated_at; the newest wins.
 */
export const SB_URL = "https://ouinmglpmeqriowdbwes.supabase.co";
export const SB_KEY = "sb_publishable_5Ec2QcbhogpOxxs8LhUAMA_eoWOAWvQ";
export const EPOCH = "1970-01-01T00:00:00Z";
const PAGE = 500;

const toSession = (j, old = {}) => ({ access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000,
  userId: j.user?.id || old.userId, email: j.user?.email || old.email });

/** store: { load(): session|null, save(session|null) }. The session is read from the store on every call, never cached. */
export function makeCloud(store) {
  async function auth(path, body) {
    const res = await fetch(`${SB_URL}/auth/v1/${path}`, { method: "POST", headers: { apikey: SB_KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.msg || j.error_description || j.message || `Sign-in failed (${res.status})`);
    return j;
  }
  async function session(force = false) {
    const s = await store.load();
    if (!s) throw Object.assign(new Error("Not signed in"), { signedOut: true });
    if (!force && Date.now() < s.expiresAt - 60000) return s;
    try {
      const next = toSession(await auth("token?grant_type=refresh_token", { refresh_token: s.refresh }), s);
      await store.save(next);
      return next;
    } catch (e) {
      // A refresh token that's been revoked or expired can't come back: sign out so the screen asks again.
      if (/invalid|not found|expired|revoked/i.test(e.message)) { await store.save(null); e.signedOut = true; }
      throw e;
    }
  }
  async function rest(path, { method = "GET", body, prefer } = {}, retry = true) {
    const s = await session();
    const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { apikey: SB_KEY, authorization: "Bearer " + s.access, "content-type": "application/json", ...(prefer ? { prefer } : {}) } });
    if (res.status === 401 && retry) { await session(true); return rest(path, { method, body, prefer }, false); }
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || `Sync failed (${res.status})`); }
    return res.status === 204 || method !== "GET" ? null : res.json();
  }
  /** Every row of a table changed after `since`, oldest first, in pages. */
  async function changes(table, since) {
    const out = [];
    for (let cur = since; ;) {
      const rows = await rest(`${table}?select=*&updated_at=gt.${encodeURIComponent(cur)}&order=updated_at.asc&limit=${PAGE}`);
      out.push(...rows);
      if (rows.length < PAGE) return out;
      cur = rows[rows.length - 1].updated_at;
    }
  }
  const upsert = (table, conflict, rows) => rows.length ? rest(`${table}?on_conflict=${conflict}`, { method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal" }) : null;

  return {
    current: () => store.load(),
    /** Emails a sign-in code. New emails get an account automatically. */
    sendCode: (email) => auth("otp", { email, create_user: true }),
    /**
     * Sign in with what came in the email. Supabase's own email sender sends a "Log In" link (its text can't be changed
     * without a custom mail server), so this takes the link copied from the email, the address of the page the link
     * opened (it carries the session), or a 6 to 10 digit code if the email has one.
     */
    async signIn(email, input) {
      const text = String(input || "").trim();
      let j;
      if (/^\d{6,10}$/.test(text.replace(/\s/g, ""))) j = await auth("verify", { type: "email", email, token: text.replace(/\s/g, "") });
      else if (/[#&?]access_token=/.test(text)) {
        const p = new URLSearchParams(text.slice(text.search(/[#?]/) + 1));
        const claims = JSON.parse(atob(p.get("access_token").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        j = { access_token: p.get("access_token"), refresh_token: p.get("refresh_token"), expires_in: Number(p.get("expires_in")) || 3600, user: { id: claims.sub, email: claims.email } };
        if (!j.refresh_token || !j.user.id) throw new Error("That address is missing part of the sign-in. Email yourself a new link.");
      } else if (/[?&]token=/.test(text)) {
        const u = new URL(text);
        try { j = await auth("verify", { type: u.searchParams.get("type") || "magiclink", token_hash: u.searchParams.get("token") }); }
        catch (e) { throw /expired|invalid|used/i.test(e.message) ? new Error("That link was already used or has expired. Email yourself a new one and paste it without opening it.") : e; }
      } else throw new Error("Paste the Log In link from the email (press and hold it, then Copy link).");
      const s = toSession(j); await store.save(s); return s;
    },
    signOut: () => store.save(null),
    changes,
    putSites: (rows) => upsert("sites", "user_id,origin", rows),
    putData: (rows) => upsert("site_data", "user_id,key", rows),
  };
}

// Local site entry <-> sites row.
export const siteRow = (s, userId, deleted = false) => ({ user_id: userId, origin: s.origin, name: s.name || "", role: s.role || "mine",
  competitor_of: s.role === "competitor" ? s.competitorOf || null : null, keywords: (s.keywords || []).slice(0, 200),
  added_at: s.addedAt || new Date().toISOString(), deleted_at: deleted ? new Date().toISOString() : null });
export const siteFromRow = (r) => ({ origin: r.origin, name: r.name, addedAt: r.added_at, keywords: r.keywords || [], role: r.role, competitorOf: r.competitor_of || null });
