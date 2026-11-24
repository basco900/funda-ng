import "server-only";

/**
 * Fetches a page politely (robots.txt, a clear user agent, size and time limits) and
 * reduces it to readable text around discount wording, ready for extraction.
 */

export const COUPON_BOT_UA = "FundaCouponBot/1.0 (+https://funda.ng/coupons)";
const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 9_000;
const KEYWORDS = /(promo|coupon|voucher|discount|code|% ?off|off your|free shipping|free delivery|free trial|student|deal|save|cashback|referral)/i;

const robotsCache = new Map<string, { rules: string[]; at: number }>();

async function timedFetch(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow", headers: { "user-agent": COUPON_BOT_UA, accept: "text/html,application/xhtml+xml", ...(init?.headers ?? {}) } });
  } finally {
    clearTimeout(timer);
  }
}

/** Disallow rules for `*` and for our bot; a missing or unreadable robots.txt allows everything. */
async function disallowedPaths(origin: string) {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.at < 6 * 3_600_000) return cached.rules;
  let rules: string[] = [];
  try {
    const response = await timedFetch(`${origin}/robots.txt`, { headers: { accept: "text/plain" } });
    if (response.ok) {
      const lines = (await response.text()).split(/\r?\n/);
      let applies = false;
      for (const raw of lines) {
        const line = raw.split("#")[0].trim();
        const [key, ...rest] = line.split(":");
        const value = rest.join(":").trim();
        if (/^user-agent$/i.test(key)) applies = value === "*" || /fundacouponbot/i.test(value);
        else if (applies && /^disallow$/i.test(key) && value) rules.push(value);
      }
    }
  } catch {
    rules = [];
  }
  robotsCache.set(origin, { rules, at: Date.now() });
  return rules;
}

export async function robotsAllow(url: string) {
  const parsed = new URL(url);
  const rules = await disallowedPaths(parsed.origin);
  const path = parsed.pathname + parsed.search;
  return !rules.some((rule) => rule !== "/" ? path.startsWith(rule.replace(/\*.*$/, "")) : true);
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function htmlToText(html: string) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    // Codes often sit in attributes (data-code, value) of reveal buttons.
    .replace(/<[^>]*\b(?:data-code|data-coupon|data-clipboard-text|value)="([^"]{3,40})"[^>]*>/gi, " $1 ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/** Keeps the lines about discounts (with a little context) so extraction stays cheap. */
export function focusText(text: string, limit = 14_000) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (KEYWORDS.test(line)) for (let i = Math.max(0, index - 2); i <= Math.min(lines.length - 1, index + 2); i++) keep.add(i);
  });
  const picked = (keep.size ? [...keep].sort((a, b) => a - b).map((i) => lines[i]) : lines).join("\n");
  return picked.slice(0, limit);
}

export type FetchedPage = { url: string; finalUrl: string; text: string; focused: string };

export async function fetchPageText(url: string): Promise<FetchedPage | null> {
  try {
    if (!/^https?:\/\//i.test(url)) return null;
    if (!(await robotsAllow(url))) return null;
    const response = await timedFetch(url);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!/html|text/i.test(type)) return null;
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;
    const html = (await response.text()).slice(0, MAX_BYTES);
    const finalUrl = response.url || url;
    if (finalUrl !== url && !(await robotsAllow(finalUrl))) return null;
    const text = htmlToText(html);
    if (text.length < 200) return null;
    return { url, finalUrl, text, focused: focusText(text) };
  } catch {
    return null;
  }
}
