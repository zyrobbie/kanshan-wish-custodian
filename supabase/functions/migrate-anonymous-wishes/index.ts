import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { cors, json, requireAllowedOrigin, safeError } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = cors(request); if (preflight) return preflight;
  const origin = requireAllowedOrigin(request); if (origin instanceof Response) return origin;
  try {
    const targetToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const sourceToken = request.headers.get("x-source-authorization")?.replace(/^Bearer\s+/i, "");
    if (!targetToken || !sourceToken) return json({ ok: false, error: "missing_sessions" }, 401, origin);
    const url = Deno.env.get("SUPABASE_URL"); const anonKey = Deno.env.get("SUPABASE_ANON_KEY"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceRoleKey) return json({ ok: false, error: "service_not_configured" }, 503, origin);
    const verifier = createClient(url, anonKey, { auth: { persistSession: false } });
    const [{ data: target }, { data: source }] = await Promise.all([verifier.auth.getUser(targetToken), verifier.auth.getUser(sourceToken)]);
    if (!target.user || !source.user
      || !source.user.is_anonymous
      || target.user.is_anonymous
      || !target.user.email_confirmed_at
      || target.user.id === source.user.id) return json({ ok: false, error: "invalid_sessions" }, 403, origin);
    // This single SQL UPDATE is atomic. The service-role key never leaves the
    // function: ordinary browser reads/writes remain subject to wishes RLS.
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { data: moved, error } = await admin.from("wishes")
      .update({ owner_id: target.user.id })
      .eq("owner_id", source.user.id)
      .select("id");
    if (error) throw error;
    const movedCount = moved?.length ?? 0;
    console.log(JSON.stringify({ event: "anonymous_wish_migration", ok: true, moved_count: movedCount }));
    return json({ ok: true, movedCount }, 200, origin);
  } catch (error) { console.log(JSON.stringify({ event: "anonymous_wish_migration", ok: false, error: safeError(error) })); return json({ ok: false, error: "migration_failed" }, 500, typeof origin === "string" ? origin : null); }
});
