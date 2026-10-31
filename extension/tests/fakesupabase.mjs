// A stand-in for SEO God Mode's Supabase project, for tests: the sync functions (sgm_pull, sgm_push_sites,
// sgm_push_data, plus the optional username + password accounts in sgm_account) over in-memory tables, filed under a hash of the sync code like the real database. The tables
// themselves refuse direct access. The real project is never contacted.
import { createHash } from "node:crypto";
import { SB_URL } from "../lib/cloud.js";

export function fakeSupabase() {
  const tables = { sites: [], data: [] };
  // Accounts: username -> {password, code, failed, lockedUntil}. Like the real one: errors come back as {error}.
  const accounts = new Map();
  // notReady: answer like a project where the SQL hasn't been run (no functions yet).
  const flags = { notReady: false };
  const keyOf = { sites: (r) => r.space + "|" + r.origin, data: (r) => r.space + "|" + r.key };
  let tick = 0;
  // Server time, always increasing (microseconds), like clock_timestamp().
  const now = () => new Date(Date.now() + tick++).toISOString().replace("Z", "000+00:00");
  const space = (code) => {
    const v = String(code || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
    return /^[0-9A-HJKMNP-TV-Z]{20}$/.test(v) ? createHash("sha256").update(v).digest("hex") : null;
  };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
  const json = (route, status, body) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: body === undefined ? "" : JSON.stringify(body) });
  const upsert = (t, s, rows) => { for (const row of rows) {
    const next = { ...row, space: s, updated_at: now() }, k = keyOf[t](next), i = tables[t].findIndex((r) => keyOf[t](r) === k);
    if (i >= 0) tables[t][i] = next; else tables[t].push(next);
  } };

  async function handle(route) {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const fn = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/)?.[1];
    if (!fn) return json(route, 401, { code: "42501", message: "permission denied" });
    if (flags.notReady) return json(route, 404, { code: "PGRST202", message: `Could not find the function public.${fn} in the schema cache` });
    const body = JSON.parse(req.postData() || "{}");
    // oldRoles: a server that hasn't run the General site type's script yet.
    if (flags.oldRoles && fn === "sgm_push_sites" && body.p_rows.some((r) => r.role === "general")) return json(route, 400, { code: "23514", message: "violates check constraint" });
    if (fn === "sgm_account") {
      const n = String(body.p_name || "").trim().toLowerCase(), pw = String(body.p_password || "");
      if (!/^[a-z0-9._@-]{3,60}$/.test(n)) return json(route, 200, { error: "Pick a username of 3 to 60 letters, numbers, dots, dashes or underscores." });
      if (pw.length < 8 || pw.length > 72) return json(route, 200, { error: "Use a password of 8 to 72 characters." });
      if (body.p_create) {
        if (!space(body.p_code)) return json(route, 400, { code: "22023", message: "That sync code is not valid" });
        if (accounts.has(n)) return json(route, 200, { error: "That username is taken. Pick another, or sign in." });
        accounts.set(n, { password: pw, code: body.p_code.toUpperCase().replace(/[^0-9A-Z]/g, ""), failed: 0, lockedUntil: 0 });
        return json(route, 200, { code: accounts.get(n).code });
      }
      const a = accounts.get(n);
      if (!a) return json(route, 200, { error: "Wrong username or password." });
      if (a.lockedUntil > Date.now()) return json(route, 200, { error: "Too many wrong passwords. Try again in 15 minutes." });
      if (a.password === pw) { a.failed = 0; return json(route, 200, { code: a.code }); }
      if (++a.failed >= 10) { a.failed = 0; a.lockedUntil = Date.now() + 15 * 60000; }
      return json(route, 200, { error: "Wrong username or password." });
    }
    const s = space(body.p_code);
    if (!s) return json(route, 400, { code: "22023", message: "That sync code is not valid" });
    if (fn === "sgm_pull") {
      const t = body.p_table === "sites" ? "sites" : "data";
      return json(route, 200, tables[t].filter((r) => r.space === s && r.updated_at > body.p_since).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, 500)
        .map(({ space: _, ...r }) => r));
    }
    if (fn === "sgm_push_sites") { upsert("sites", s, body.p_rows); return json(route, 204); }
    if (fn === "sgm_push_data") { upsert("data", s, body.p_rows); return json(route, 204); }
    return json(route, 404, { message: "no such function" });
  }
  return { tables, space, accounts, flags, route: (ctx) => ctx.route(SB_URL + "/**", handle) };
}
