// A stand-in for SEO God Mode's Supabase project, for tests: email codes, sessions, and the sites / site_data tables
// with the same own-rows-only rule as the real database. The real project is never contacted. Code "123456" signs in.
import { SB_URL } from "../lib/cloud.js";

export function fakeSupabase() {
  const tables = { sites: [], site_data: [] };
  const keyOf = { sites: (r) => r.user_id + "|" + r.origin, site_data: (r) => r.user_id + "|" + r.key };
  const users = new Map(), codes = [];
  let tick = 0;
  // Server time, always increasing (microseconds), like Postgres now() across transactions.
  const now = () => new Date(Date.now() + tick++).toISOString().replace("Z", "000+00:00");
  const userFor = (email) => { if (!users.has(email)) users.set(email, { id: crypto.randomUUID(), email }); return users.get(email); };
  const session = (u) => ({ access_token: "at." + u.id, refresh_token: "rt." + u.id, expires_in: 3600, user: u });
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
  const json = (route, status, body) => route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: body === undefined ? "" : JSON.stringify(body) });

  async function handle(route) {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    if (url.pathname === "/auth/v1/otp") { codes.push(body.email); return json(route, 200, {}); }
    if (url.pathname === "/auth/v1/verify") return body.token === "123456" ? json(route, 200, session(userFor(body.email))) : json(route, 403, { msg: "Token has expired or is invalid" });
    if (url.pathname === "/auth/v1/token") { const u = [...users.values()].find((x) => "rt." + x.id === body.refresh_token); return u ? json(route, 200, session(u)) : json(route, 400, { msg: "Invalid Refresh Token" }); }
    const t = url.pathname.match(/^\/rest\/v1\/(sites|site_data)$/)?.[1];
    if (!t) return json(route, 404, { message: "not found" });
    const auth = req.headers()["authorization"] || "";
    const uid = auth.startsWith("Bearer at.") ? auth.slice(10) : null;
    if (!uid) return json(route, 401, { code: "42501", message: `permission denied for table ${t}` });
    if (m === "GET") {
      const gt = (url.searchParams.get("updated_at") || "gt.1970").slice(3), limit = Number(url.searchParams.get("limit") || 1000);
      return json(route, 200, tables[t].filter((r) => r.user_id === uid && r.updated_at > gt).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, limit));
    }
    if (m === "POST") {
      for (const row of body) {
        if (row.user_id !== uid) return json(route, 403, { message: "new row violates row-level security policy" });
        const k = keyOf[t](row), i = tables[t].findIndex((r) => keyOf[t](r) === k);
        const next = { ...(i >= 0 ? tables[t][i] : {}), ...row, updated_at: now() };
        if (i >= 0) tables[t][i] = next; else tables[t].push(next);
      }
      return json(route, 201);
    }
    return json(route, 405, { message: "method not allowed" });
  }
  return { tables, codes, users, route: (ctx) => ctx.route(SB_URL + "/**", handle) };
}
