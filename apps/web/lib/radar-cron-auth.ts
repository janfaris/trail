export type RadarCronAuthResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "unauthorized" };

export function authorizeRadarCronRequest(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): RadarCronAuthResult {
  const secrets = [env.RADAR_CRON_SECRET, env.CRON_SECRET].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  if (secrets.length === 0) return { ok: false, reason: "not-configured" };

  const authz = headers.get("authorization") ?? "";
  return secrets.some((secret) => authz === `Bearer ${secret}`)
    ? { ok: true }
    : { ok: false, reason: "unauthorized" };
}
