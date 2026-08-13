export const json = (body: Record<string, unknown>, status = 200, origin?: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    },
  });

export function allowOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  const configured = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return origin && configured.includes(origin) ? origin : null;
}

export function cors(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  const origin = allowOrigin(request);
  return new Response(null, {
    status: origin ? 204 : 403,
    headers: origin
      ? {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-source-authorization",
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-max-age": "600",
          vary: "Origin",
        }
      : {},
  });
}

export function safeError(error: unknown): string {
  // Do not return vendor bodies, headers, tokens, or URLs that can carry credentials.
  return error instanceof Error ? error.message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]") : "request failed";
}

export function requireAllowedOrigin(request: Request): string | Response {
  const origin = allowOrigin(request);
  return origin ?? json({ ok: false, error: "origin_not_allowed" }, 403);
}
