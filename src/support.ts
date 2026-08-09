// ---------------------------------------------------------------------------
// Customer-facing support flow: warm, professional wholesale-buyer script.
// Collects name/phone/city-business/product, gives contact info, and sends
// a brief to you (the human) with the customer's phone number so you can call.
//
// No storage needed: each bot question carries the conversation state hidden
// in a small tap-to-reveal "spoiler" block (kept as short as possible). When
// the customer replies (Force Reply), we read that hidden state straight out
// of the message they replied to.
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

function packState(state: SupportState): string {
  const packed: Record<string, string> = { s: state.step };
  if (state.name) packed.n = state.name;
  if (state.phone) packed.p = state.phone;
  if (state.city) packed.c = state.city;
  return JSON.stringify(packed);
}

function unpackState(json: string): SupportState | null {
  const p = JSON.parse(json);
  if (!p.s) return null;
  return { step: p.s, name: p.n, phone: p.p, city: p.c };
}

export function withState(visibleText: string, state: SupportState): string {
  const json = escapeHtml(packState(state));
  return `${visibleText}\n\n<tg-spoiler>#${json}</tg-spoiler>`;
}

export function extractState(previousMessageText: string | undefined): SupportState | null {
  if (!previousMessageText) return null;
  const match = previousMessageText.match(/#(\{[\s\S]*\})/);
  if (!match) return null;
  try {
    return unpackState(unescapeHtml(match[1]));
  } catch {
    return null;
  }
}

const DEFAULT_INTRO =
  "سلام وقت بخیر 🌱\nحتماً کمکتون می‌کنم! برای اینکه همکار فروش بتونه دقیق‌تر راهنماییتون کنه، چند تا سوال کوتاه می‌پرسم.\n\nاول از همه، لطفاً اسم و فامیلتون رو بفرستین.";

export function buildIntro(customIntro: string): string {
  return customIntro && !customIntro.startsWith("REPLACE_WITH") ? customIntro : DEFAULT_INTRO;
}

export function buildAskPhone(name: string): string {
  return `ممنون ${name} جان، از آشناییتون خوشحال شدم 🙏\nبرای اینکه اگر نیاز به هماهنگی یا استعلام قیمت داشتیم راحت‌تر باهاتون در ارتباط باشیم، لطفاً شماره تماستون رو هم بفرستین.`;
}

export function buildAskCity(): string {
  return `ممنونم 🙏\nحالا برای اینکه پیشنهاد و شرایط فروش رو متناسب با بازار خودتون بررسی کنیم، بگید از کدوم شهر و در چه حوزه‌ای فعالیت می‌کنید؟\nمثلاً فروشگاه موبایل، لوازم جانبی، پخش، فروش آنلاین و...`;
}

export function buildAskProduct(): string {
  return `عالیه 👌\nحالا بگید دقیقاً دنبال چه محصولی هستید و حدوداً چه تعدادی نیاز دارید؟\nاگر مدل یا مشخصات خاصی هم مدنظرتونه، همون رو بفرستین تا همکار فروش بر اساس همون بررسی کنه.`;
}

export function buildDirectContactMessage(ownerPhone: string, ownerUsername: string): string {
  return `📞 ${ownerPhone}\n🆔 @${ownerUsername}\n\nهر وقت خواستید می‌تونید مستقیم تماس بگیرید یا پیام بدید 🙌`;
}

export function buildCustomerFinalReply(name: string, product: string, ownerPhone: string, ownerUsername: string): string {
  return (
    `حتماً ${name} جان، متوجه شدم 👌\n${product}\n\n` +
    `این تعداد وارد محدوده خرید عمده می‌شه، بهتره قیمت، موجودی و شرایط تأمین رو دقیق براتون بررسی کنیم تا صرفاً یک قیمت عمومی اعلام نشه.\n\n` +
    `اطلاعاتتون ثبت شد و همکار فروش عمده باهاتون تماس می‌گیره و قیمت، موجودی و شرایط خرید رو هماهنگ می‌کنه.\n\n` +
    `اگر هم خواستید مستقیم با بخش فروش عمده در ارتباط باشید:\n📞 ${ownerPhone}\n🆔 @${ownerUsername}\n\n` +
    `ممنون که ما رو برای خرید و تأمین کالای فروشگاهتون انتخاب کردید 🙏`
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
