import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { cors, json, requireAllowedOrigin, safeError } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = cors(request); if (preflight) return preflight;
  const origin = requireAllowedOrigin(request); if (origin instanceof Response) return origin;
  try {
    const targetToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const sourceToken = request.headers.get("x-source-authorization")?.replace(/^Bearer\s+/i, "");
    if (!targetToken || !sourceToken) return json({ ok: false, error: "missing_sessions" }, 401, origin);
    const url = Deno.env.get("SUPABASE_URL"); const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) return json({ ok: false, error: "service_not_configured" }, 503, origin);
    const verifier = createClient(url, anonKey);
    const [{ data: target }, { data: source }] = await Promise.all([verifier.auth.getUser(targetToken), verifier.auth.getUser(sourceToken)]);
    if (!target.user || !source.user || !source.user.is_anonymous || target.user.id === source.user.id) return json({ ok: false, error: "invalid_sessions" }, 403, origin);
    const targetClient = createClient(url, anonKey, { global: { headers: { authorization: `Bearer ${targetToken}` } } });
    const { data: movedCount, error } = await targetClient.rpc("migrate_anonymous_wishes", { source_owner_id: source.user.id });
    if (error) throw error;
    console.log(JSON.stringify({ event: "anonymous_wish_migration", ok: true, moved_count: movedCount }));
    return json({ ok: true, movedCount }, 200, origin);
  } catch (error) { console.log(JSON.stringify({ event: "anonymous_wish_migration", ok: false, error: safeError(error) })); return json({ ok: false, error: "migration_failed" }, 500, typeof origin === "string" ? origin : null); }
});
