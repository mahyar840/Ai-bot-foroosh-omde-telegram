// ---------------------------------------------------------------------------
// Customer-facing support flow: answers simply, collects name/city/product,
// gives the customer your contact info, and sends a short brief + the
// customer's Telegram contact info to you (the human) so you can follow up.
//
// No storage needed: each bot question is sent with Force Reply, and carries
// a small hidden state marker (visible only as a tappable "spoiler" block in
// Telegram). When the customer replies, we read that marker straight out of
// the message they replied to, so the whole conversation is stateless.
// ---------------------------------------------------------------------------

export interface SupportState {
  step: "awaiting_name" | "awaiting_city" | "awaiting_product";
  name?: string;
  city?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeHtml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** Appends a hidden (spoiler-tap-to-reveal) state marker to a message. Send with parse_mode: "HTML". */
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
  if (params.customerCity) lines.push(`شهر/کسب‌وکار: ${params.customerCity}`);
  if (params.customerProduct) lines.push(`محصول موردنظر: ${params.customerProduct}`);
  lines.push(`آیدی عددی: ${params.customerTelegramId}`);
  if (params.customerTelegramUsername) lines.push(`یوزرنیم: @${params.customerTelegramUsername}`);
  return lines.join("\n");
}
