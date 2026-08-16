import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { cors, json, requireAllowedOrigin, safeError } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const preflight = cors(request); if (preflight) return preflight;
  const origin = requireAllowedOrigin(request); if (origin instanceof Response) return origin;
  let allowedOrigin = origin;
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, allowedOrigin);
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!token) return json({ ok: false, error: 'authentication_required' }, 401, allowedOrigin);
    if (!url || !anon || !service) return json({ ok: false, error: 'service_not_configured' }, 503, allowedOrigin);
    const verifier = createClient(url, anon, { auth: { persistSession: false } });
    const { data: { user } } = await verifier.auth.getUser(token);
    if (!user) return json({ ok: false, error: 'authentication_required' }, 401, origin);
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    console.log(JSON.stringify({ event: 'account_deleted', ok: true }));
    return json({ ok: true }, 200, allowedOrigin);
  } catch (error) { console.log(JSON.stringify({ event: 'account_deleted', ok: false, error: safeError(error) })); return json({ ok: false, error: 'request_failed' }, 500, allowedOrigin); }
});
