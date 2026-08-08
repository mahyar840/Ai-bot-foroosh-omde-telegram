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

/**
 * Tries to find a price written in a supplier's caption.
 * Handles patterns like:
 *   "990.000 ت", "990,000 تومان", "990000 تومن", "990"  (shorthand meaning 990,000)
 * Returns the price in toman, or null if nothing plausible was found.
 */
export function extractPriceFromCaption(rawCaption: string): number | null {
  const caption = normalizeDigits(rawCaption);

  // 1) Full price with currency word nearby: 990.000 ت / 990,000 تومان / 1250000 تومن
  const fullPriceRegex =
    /(\d{1,3}(?:[.,]\d{3})+|\d{4,10})\s*(ت|تومن|تومان|toman)?/gi;

  const candidates: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = fullPriceRegex.exec(caption)) !== null) {
    const raw = match[1].replace(/[.,]/g, "");
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1000) candidates.push(num);
  }

  if (candidates.length > 0) {
    // Prefer the largest plausible number — captions often contain smaller
    // numbers too (e.g. "45 وات", "2 گارانتی"), the real price is usually
    // the biggest number in the text.
    return Math.max(...candidates);
  }

  // 2) Shorthand: a lone 2-4 digit number that supplier means x1000
  //    e.g. "990" meaning 990,000 toman. Only used as a fallback,
  //    since it's ambiguous — flag these for manual review in phase 1.
  const shorthandRegex = /(?:^|\s)(\d{2,4})(?:\s|$)/;
  const shorthandMatch = caption.match(shorthandRegex);
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
