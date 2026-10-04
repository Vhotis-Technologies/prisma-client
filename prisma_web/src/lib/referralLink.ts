/**
 * Partner share links arrive as `?ref=CODE` (from prismavalet.com or a direct app URL).
 * The code is remembered for this tab and prefilled on guest checkout and registration.
 * Payment and account creation already send that field; this only supplies the value.
 */

const REFERRAL_STORAGE_KEY = "prisma_referral_code";
const REFERRAL_PATTERN = /^[A-Z0-9]{4,12}$/;

export function normalizeReferralCode(raw: string | null | undefined): string {
  const code = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  return REFERRAL_PATTERN.test(code) ? code : "";
}

/** Read `ref` from a query string and remember a valid code for this tab. */
export function captureReferralFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fromUrl = normalizeReferralCode(
    params.get("ref") || params.get("referral") || params.get("referral_code"),
  );
  try {
    if (fromUrl) {
      sessionStorage.setItem(REFERRAL_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return normalizeReferralCode(sessionStorage.getItem(REFERRAL_STORAGE_KEY));
  } catch {
    return fromUrl;
  }
}

/** Current partner or customer code for this tab, from the URL or sessionStorage. */
export function readReferralCode(): string {
  if (typeof window === "undefined") return "";
  return captureReferralFromSearch(window.location.search);
}

/** Query string that keeps `ref` on in-app links. Extra keys (such as account type) are included. */
export function referralQuery(extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  const code = readReferralCode();
  if (code) params.set("ref", code);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function marketingOrigin(): string {
  const configured = (import.meta.env.VITE_MARKETING_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  return import.meta.env.DEV ? "http://localhost:3000" : "https://prismavalet.com";
}

/** Public link a partner shares. Opening it attaches their code on the marketing site. */
export function partnerShareUrl(code: string): string {
  const normalized = normalizeReferralCode(code);
  const origin = marketingOrigin();
  if (!normalized) return `${origin}/`;
  return `${origin}/?ref=${encodeURIComponent(normalized)}`;
}
