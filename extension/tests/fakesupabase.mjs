// A stand-in for SEO God Mode's Supabase project, for tests: the sync functions (sgm_pull, sgm_push_sites,
// sgm_push_data) over in-memory tables, filed under a hash of the sync code like the real database. The tables
// themselves refuse direct access. The real project is never contacted.
import { createHash } from "node:crypto";
import { SB_URL } from "../lib/cloud.js";

export function fakeSupabase() {
  const tables = { sites: [], data: [] };
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
    const body = JSON.parse(req.postData() || "{}"), s = space(body.p_code);
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
  return { tables, space, route: (ctx) => ctx.route(SB_URL + "/**", handle) };
}
