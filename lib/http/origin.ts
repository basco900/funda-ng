/** Resolves the public request origin behind reverse proxies (Coolify/Dokploy/Cloudflare). */
export function getRequestOrigin(request: Request) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.split(",")[0]?.trim();

  if (host && !host.startsWith("0.0.0.0")) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = forwardedProto || (isLocal ? "http" : "https");
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}
