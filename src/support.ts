// ---------------------------------------------------------------------------
// Customer-facing support flow: answers simply, collects name/phone/city/product,
// gives the customer your contact info, and sends a short brief + the
// customer's phone number to you (the human) so you can call them.
//
// No storage needed: each bot question carries the conversation state hidden
// in a small tap-to-reveal "spoiler" block. When the customer replies (Force
// Reply), we read that hidden state straight out of the message they replied to.
// ---------------------------------------------------------------------------

export interface SupportState {
  step: "awaiting_name" | "awaiting_phone" | "awaiting_city" | "awaiting_product";
  name?: string;
  phone?: string;
  city?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeHtml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Appends a small hidden (tap-to-reveal "spoiler") state marker to a message.
 * Send with parse_mode: "HTML". Note: truly-invisible zero-width characters
 * don't work here — Telegram strips them from message text, which breaks the
 * whole mechanism — so a tappable spoiler block is the reliable option.
 */
export function withState(visibleText: string, state: SupportState): string {
  const json = escapeHtml(JSON.stringify(state));
  return `${visibleText}\n\n<tg-spoiler>#${json}</tg-spoiler>`;
}

/** Reads the state marker back out of the bot's own previous message (the one the customer replied to). */
export function extractState(previousMessageText: string | undefined): SupportState | null {
  if (!previousMessageText) return null;
  const match = previousMessageText.match(/#(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    return JSON.parse(unescapeHtml(match[1]));
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
