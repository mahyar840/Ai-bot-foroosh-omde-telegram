// ---------------------------------------------------------------------------
// Customer-facing support flow: answers simply, collects name/phone/city/product,
// gives the customer your contact info, and sends a short brief + the
// customer's phone number to you (the human) so you can call them.
//
// No storage needed: each bot question carries the conversation state hidden
// inside INVISIBLE unicode characters (zero-width spaces) appended to the
// message text — completely invisible, nothing to tap or notice. When the
// customer replies (Force Reply), we read that hidden state straight out of
// the message they replied to.
// ---------------------------------------------------------------------------

export interface SupportState {
  step: "awaiting_name" | "awaiting_phone" | "awaiting_city" | "awaiting_product";
  name?: string;
  phone?: string;
  city?: string;
}

const ZERO = "\u200B"; // zero-width space
const ONE = "\u200C"; // zero-width non-joiner
const MARK = "\u200D"; // zero-width joiner, used as a start/end marker

function textToBits(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  return bits;
}

function bitsToText(bits: string): string {
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Appends a completely invisible state marker to a message (no visible artifact at all). */
export function withState(visibleText: string, state: SupportState): string {
  const bits = textToBits(JSON.stringify(state));
  const invisible = [...bits].map((b) => (b === "0" ? ZERO : ONE)).join("");
  return `${visibleText}${MARK}${invisible}${MARK}`;
}

/** Reads the invisible state marker back out of the bot's own previous message. */
export function extractState(previousMessageText: string | undefined): SupportState | null {
  if (!previousMessageText) return null;
  const match = previousMessageText.match(new RegExp(`${MARK}([${ZERO}${ONE}]+)${MARK}`));
  if (!match) return null;
  try {
    return JSON.parse(bitsToText(match[1]));
  } catch {
    return null;
  }
}

const DEFAULT_INTRO =
  "سلام رفیق 👋 خوشحالم که پیام دادی! چند تا سوال کوچیک می‌پرسم تا سریع‌تر کمکت کنم.";

export function buildIntro(customIntro: string): string {
  const intro = customIntro && !customIntro.startsWith("REPLACE_WITH") ? customIntro : DEFAULT_INTRO;
  return `${intro}\n\nاول بگو، اسمت چیه؟`;
}

export function buildDirectContactMessage(ownerPhone: string, ownerUsername: string): string {
  return `📞 ${ownerPhone}\n🆔 @${ownerUsername}\n\nهر وقت خواستی می‌تونی مستقیم تماس بگیری یا پیام بدی 🙌`;
}

export function buildCustomerReplyWithContact(ownerPhone: string, ownerUsername: string): string {
  return (
    `ممنون از پیامت 🙏\n` +
    `تیم پشتیبانی به‌زودی باهات تماس می‌گیره. برای ارتباط سریع‌تر:\n` +
    `📞 ${ownerPhone}\n` +
    `🆔 @${ownerUsername}`
  );
}

export function buildOwnerBrief(params: {
  customerName?: string;
  customerPhone?: string;
  customerCity?: string;
  customerProduct?: string;
  customerTelegramUsername?: string;
  customerTelegramId: number;
  aiSummary?: string;
}): string {
  const lines: string[] = ["📩 درخواست پشتیبانی جدید"];
  if (params.aiSummary) lines.push(`\n${params.aiSummary}`);
  lines.push("");
  lines.push("— اطلاعات مشتری —");
  if (params.customerName) lines.push(`نام: ${params.customerName}`);
  if (params.customerPhone) lines.push(`📞 شماره تماس: ${params.customerPhone}`);
  if (params.customerCity) lines.push(`شهر/کسب‌وکار: ${params.customerCity}`);
  if (params.customerProduct) lines.push(`محصول موردنظر: ${params.customerProduct}`);
  if (params.customerTelegramUsername) lines.push(`یوزرنیم تلگرام: @${params.customerTelegramUsername}`);
  return lines.join("\n");
}
