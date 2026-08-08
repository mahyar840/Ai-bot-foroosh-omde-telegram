// ---------------------------------------------------------------------------
// AI calls to Groq: (1) look at the product photo and flag competitor
// watermarks/logos/phone numbers/brand names, (2) rewrite the caption in
// your own voice.
//
// NOTE: Groq's model lineup changes over time — check https://console.groq.com/docs/models
// and put the current vision-capable model name in env.GROQ_VISION_MODEL
// (e.g. a "llama-...-vision" or "llama-4-scout..." style model at the time
// you deploy this). Same for the text model in GROQ_TEXT_MODEL.
// ---------------------------------------------------------------------------

export interface WatermarkCheckResult {
  isClean: boolean;
  reason: string; // short explanation, useful when you review flagged posts
}

export async function checkImageForCompetitorMarks(
  imageUrl: string,
  groqApiKey: string,
  visionModel: string
): Promise<WatermarkCheckResult> {
  const prompt =
    "این تصویر یک عکس محصول است که قراره تو یه کانال فروش دیگه بازنشر بشه. " +
    "فقط دنبال یک چیز خیلی مشخص بگرد: آیا یک نفر یا یک فروشگاه (غیر از سازنده‌ی اصلی محصول)، " +
    "روی خودِ عکس یک واترمارک/لوگو/آیدی تلگرام/شماره تماس/آدرس کانال اضافه کرده که مشخصه بعداً " +
    "با فتوشاپ یا اپلیکیشن روی عکس گذاشته شده (مثلاً معمولاً نیمه‌شفاف، گوشه‌ی عکس، یا به‌صورت مورب روی کل عکس)؟\n\n" +
    "این‌ها را اصلاً نباید مشکل در نظر بگیری و باید has_competitor_mark را false بذاری:\n" +
    "- نوشته‌ها و برند خودِ سازنده‌ی محصول که روی جعبه/بسته‌بندی/بدنه‌ی اصلی محصول چاپ شده (مثلاً Samsung, Apple و امثالش روی خود کالا)\n" +
    "- پس‌زمینه‌ی عکس، میز، دست، یا هر چیز دیگه‌ای که ربطی به تبلیغ نداره\n" +
    "- اگر مطمئن نیستی یا فقط شک داری و نشونه‌ی واضحی نمی‌بینی\n\n" +
    "فقط زمانی has_competitor_mark را true بذار که کاملاً مطمئن باشی یک نشان تبلیغاتی روی عکس اضافه شده. " +
    "در حالت شک، همیشه false بذار.\n\n" +
    "فقط یک JSON خام با این ساختار برگردان، هیچ متن اضافه‌ای ننویس: " +
    '{"has_competitor_mark": true یا false, "reason": "توضیح خیلی کوتاه"}';

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq vision call failed: ${res.status} ${errText}`);
  }

  const data = await res.json<any>();
  const text: string = data.choices?.[0]?.message?.content ?? "{}";
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      isClean: parsed.has_competitor_mark !== true,
      reason: parsed.reason ?? "",
    };
  } catch {
    // If the model didn't return valid JSON, don't reject — bias toward
    // publishing over false rejections. The owner still sees every post
    // before it goes live in phase 1, so a rare bad one gets caught there.
    return { isClean: true, reason: "پاسخ هوش‌مصنوعی قابل‌تفسیر نبود، به‌صورت پیش‌فرض تمیز در نظر گرفته شد" };
  }
}

/**
 * Rewrites a supplier caption down to just the product description — no price,
 * no contact info, no links. The price line and our own contact footer are
 * added afterward in code (see buildFinalCaption in index.ts) so they're
 * never accidentally dropped or mangled by the model.
 */
export async function rewriteCaption(
  originalCaption: string,
  groqApiKey: string,
  textModel: string
): Promise<string> {
  const prompt =
    "متن زیر یک کپشن محصول از یک تامین‌کننده/فروشنده عمده است. فقط توضیح و مشخصات فنی خودِ محصول " +
    "(اسم محصول، برند، مدل، ویژگی‌ها، کیفیت) را نگه دار و اینها را کامل حذف کن:\n" +
    "- هر عدد یا خطی که قیمت است\n" +
    "- هر شماره تلفن یا واتساپ\n" +
    "- هر آیدی یا یوزرنیم تلگرام/اینستاگرام (هرچی با @ یا t.me یا instagram.com شروع می‌شه)\n" +
    "- هر لینک یا آدرس کانال/گروه/سایت (t.me/..., rubika.ir/..., هر لینک دیگه)\n" +
    "- اسم فروشگاه یا تامین‌کننده و هر جمله‌ی تبلیغاتی درباره خودشون (مثلاً «کانال همکاران ما»، «سفارش از...»)\n\n" +
    "لحن را برای یک کانال فروش حرفه‌ای و جذاب کن ولی مشخصات فنی واقعی محصول را عوض نکن یا اضافه نکن. " +
    "فقط متن نهایی (بدون قیمت و بدون اطلاعات تماس) را برگردان، بدون هیچ توضیح اضافه‌ای.\n\n" +
    `کپشن اصلی:\n${originalCaption}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: textModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 400,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq caption rewrite failed: ${res.status} ${errText}`);
  }

  const data = await res.json<any>();
  return (data.choices?.[0]?.message?.content ?? originalCaption).trim();
}

/** Summarizes a customer's support request into a short brief for the human owner. */
export async function summarizeSupportRequest(
  conversationText: string,
  groqApiKey: string,
  textModel: string
): Promise<string> {
  const prompt =
    "متن زیر گفتگوی یک مشتری با ربات پشتیبانی فروشگاه است. یک خلاصه خیلی کوتاه " +
    "(حداکثر ۲-۳ خط) برای صاحب کسب‌وکار بنویس: مشتری کیست (اگر معرفی کرده)، چه محصولی و چه تعدادی می‌خواهد. " +
    "فقط خلاصه را برگردان.\n\n" +
    conversationText;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: textModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 150,
    }),
  });

  if (!res.ok) return "خلاصه در دسترس نیست — لطفاً گفتگوی کامل را ببینید.";
  const data = await res.json<any>();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}
