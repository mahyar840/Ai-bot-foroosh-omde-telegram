// ---------------------------------------------------------------------------
// Customer-facing support flow: answers simply, collects name/city/product,
// gives the customer your contact info, and sends a short brief + the
// customer's Telegram contact info to you (the human) so you can follow up.
// This mirrors the example you gave:
//   "رضا موسوی، فروشنده موبایل از ساری، می‌خواد 25 وات بخره در تعداد بالا..."
// ---------------------------------------------------------------------------
import type { SupportState } from "./storage";

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

/** Very small state machine — advances the conversation by one step per message. */
export function nextSupportStep(state: SupportState, incomingText: string): { state: SupportState; botReply?: string } {
  switch (state.step) {
    case "idle":
      return {
        state: { ...state, step: "awaiting_name" },
        botReply: "سلام! برای اینکه سریع‌تر راهنماییت کنم، اسمت چیه؟",
      };
    case "awaiting_name":
      return {
        state: { ...state, name: incomingText, step: "awaiting_city" },
        botReply: "خوشبختم 🙌 از کدوم شهر هستی و چیکاره‌ای (مثلاً فروشنده موبایل)؟",
      };
    case "awaiting_city":
      return {
        state: { ...state, city: incomingText, step: "awaiting_product" },
        botReply: "عالی، حالا بگو دنبال چه محصولی هستی و با چه تعدادی؟",
      };
    case "awaiting_product":
      return {
        state: { ...state, product: incomingText, step: "done" },
      };
    default:
      return { state };
  }
}
