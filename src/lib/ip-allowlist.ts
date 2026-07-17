/**
 * Office IP allowlist helpers for the Next.js proxy gate.
 * ALLOWED_IPS: comma-separated IPv4/IPv6, optional IPv4 CIDR (e.g. 203.0.113.0/24).
 */

export function parseAllowedIps(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function clientIpFromHeaders(
  headers: Headers,
  fallback?: string | null
): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return stripIpv6Mapped(first);
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return stripIpv6Mapped(real);
  if (fallback) return stripIpv6Mapped(fallback);
  return "";
}

function stripIpv6Mapped(ip: string): string {
  // ::ffff:192.0.2.1 → 192.0.2.1
  if (ip.toLowerCase().startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipv4ToInt(ip);
  const baseN = ipv4ToInt(base || "");
  if (ipN === null || baseN === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

/** True if ip matches any exact entry or IPv4 CIDR in the allowlist. */
export function isIpAllowed(ip: string, allowlist: string[]): boolean {
  if (!allowlist.length) return true;
  if (!ip) return false;
  const normalized = stripIpv6Mapped(ip.trim());

  for (const entry of allowlist) {
    if (entry.includes("/")) {
      if (ipv4InCidr(normalized, entry)) return true;
      continue;
    }
    if (stripIpv6Mapped(entry) === normalized) return true;
  }
  return false;
}

export function isAllowlistActive(): boolean {
  if (process.env.IP_ALLOWLIST_DISABLED === "true") return false;
  return parseAllowedIps(process.env.ALLOWED_IPS).length > 0;
}
