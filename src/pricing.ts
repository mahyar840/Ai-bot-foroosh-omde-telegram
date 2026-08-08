// ---------------------------------------------------------------------------
// Price handling: extract the supplier's price from a Persian caption,
// apply a tiered profit margin, and round to the nearest 5,000 toman.
// ---------------------------------------------------------------------------

// Converts Persian/Arabic digits to normal digits, strips separators (, .)
// that Persian sellers use as thousand-separators (e.g. "990.000" -> "990000").
function normalizeDigits(input: string): string {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  let out = "";
  for (const ch of input) {
    const pIdx = persian.indexOf(ch);
    const aIdx = arabic.indexOf(ch);
    if (pIdx !== -1) out += String(pIdx);
    else if (aIdx !== -1) out += String(aIdx);
    else out += ch;
  }
  return out;
}

const CURRENCY_WORDS = ["تومان", "تومن", "تومنی", "تومانه", "toman", "تومنه"];
const PHONE_CONTEXT_WORDS = ["تلفن", "شماره", "تماس", "موبایل", "واتساپ", "پشتیبانی"];

/** A short currency word ("ت") only counts if it's not glued to other Persian letters (avoids matching mid-word). */
function hasCurrencyNearby(caption: string, matchEnd: number): boolean {
  const after = caption.slice(matchEnd, matchEnd + 15);
  if (CURRENCY_WORDS.some((w) => after.includes(w))) return true;
  return /^\s*ت(?![\u0600-\u06FF])/.test(after); // lone "ت" followed by space/punctuation, not part of a word
}

/** Iranian phone numbers (mobile 09xxxxxxxxx, landline 0xxxxxxxxx) or numbers near phone-related words. */
function looksLikePhoneNumber(digitsOnly: string, contextBefore: string): boolean {
  if (/^0\d{9,10}$/.test(digitsOnly)) return true;
  const nearbyContext = contextBefore.slice(-15);
  return PHONE_CONTEXT_WORDS.some((w) => nearbyContext.includes(w));
}

/**
 * Tries to find a price written in a supplier's caption. Handles common
 * Persian formats regardless of separator style: "990.000 ت", "990,000 تومان",
 * "990/000", "990 000 تومن", plain "990000", or shorthand "990" (meaning 990,000).
 * Skips numbers that look like phone numbers. Returns null if nothing plausible found.
 */
export function extractPriceFromCaption(rawCaption: string): number | null {
  const caption = normalizeDigits(rawCaption);

  // Matches grouped numbers like 990.000 / 990,000 / 990/000 / 990 000, or a
  // plain run of 4-10 digits like 990000.
  const numberRegex = /\d{1,3}(?:[.,/ ]\d{3})+|\d{4,10}/g;

  const withCurrency: number[] = [];
  const withoutCurrency: number[] = [];

  let match: RegExpExecArray | null;
  while ((match = numberRegex.exec(caption)) !== null) {
    const digitsOnly = match[0].replace(/[.,/ ]/g, "");
    const num = parseInt(digitsOnly, 10);
    if (isNaN(num) || num < 1000) continue;

    const contextBefore = caption.slice(Math.max(0, match.index - 15), match.index);
    if (looksLikePhoneNumber(digitsOnly, contextBefore)) continue;

    if (hasCurrencyNearby(caption, match.index + match[0].length)) {
      withCurrency.push(num);
    } else {
      withoutCurrency.push(num);
    }
  }

  // Prefer numbers explicitly tagged with a currency word — most reliable signal.
  if (withCurrency.length > 0) return Math.max(...withCurrency);
  if (withoutCurrency.length > 0) return Math.max(...withoutCurrency);

  // Shorthand fallback: a lone 2-4 digit number meaning x1000, e.g. "990" -> 990,000.
  const shorthandMatch = caption.match(/(?:^|\s)(\d{2,4})(?:\s|$)/);
  if (shorthandMatch) {
    const num = parseInt(shorthandMatch[1], 10);
    if (num >= 10 && num <= 9999) return num * 1000;
  }

  return null;
}

export interface PriceTier {
  maxPurchasePrice: number; // upper bound of this tier (toman), Infinity for the last one
  marginPercent: number;    // profit margin to apply within this tier
}

// Default tiers — edit freely, no code changes needed elsewhere.
export const DEFAULT_TIERS: PriceTier[] = [
  { maxPurchasePrice: 300_000, marginPercent: 75 },
  { maxPurchasePrice: 1_000_000, marginPercent: 55 },
  { maxPurchasePrice: 3_000_000, marginPercent: 37 },
  { maxPurchasePrice: Infinity, marginPercent: 22 },
];

export function marginForPrice(purchasePrice: number, tiers: PriceTier[] = DEFAULT_TIERS): number {
  const tier = tiers.find((t) => purchasePrice <= t.maxPurchasePrice);
  return tier ? tier.marginPercent : tiers[tiers.length - 1].marginPercent;
}

/** Rounds to the nearest 5,000 toman. */
export function roundToNearest5000(price: number): number {
  return Math.round(price / 5000) * 5000;
}

export function calculateSalePrice(purchasePrice: number, tiers: PriceTier[] = DEFAULT_TIERS): number {
  const margin = marginForPrice(purchasePrice, tiers);
  const rawSalePrice = purchasePrice * (1 + margin / 100);
  return roundToNearest5000(rawSalePrice);
}

/** Formats a toman price with thousand separators, Persian-friendly. */
export function formatToman(price: number): string {
  return price.toLocaleString("en-US") + " تومان";
}
