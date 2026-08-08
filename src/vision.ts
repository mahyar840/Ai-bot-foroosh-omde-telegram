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
    "این تصویر یک آگهی محصول است. با دقت بررسی کن که آیا روی تصویر واترمارک، " +
    "لوگو، نام برند، آیدی تلگرام یا شماره تماس شخص/کسب‌وکار دیگری (غیر از خود محصول) دیده می‌شود یا نه. " +
    "فقط یک JSON خام با این ساختار برگردان و هیچ متن اضافه‌ای ننویس: " +
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
    // If the model didn't return valid JSON, err on the side of caution
    // and send it to manual review instead of silently publishing it.
    return { isClean: false, reason: "پاسخ هوش‌مصنوعی قابل‌تفسیر نبود — نیاز به بررسی دستی" };
  }
}

export async function rewriteCaption(
  originalCaption: string,
  salePriceFormatted: string,
  groqApiKey: string,
  textModel: string
): Promise<string> {
  const prompt =
    "متن زیر یک کپشن محصول از یک تامین‌کننده است. این کپشن را بازنویسی کن: " +
    "لحن را حرفه‌ای و جذاب برای کانال فروش کن، مشخصات فنی محصول را نگه دار، " +
    "قیمت تامین‌کننده را حذف کن و به‌جایش این قیمت را دقیقاً همین‌طور بگذار: " +
    `"${salePriceFormatted}". هیچ نام یا شماره تماس تامین‌کننده را در متن نگه ندار. ` +
    "فقط متن نهایی کپشن را برگردان، بدون توضیح اضافه.\n\n" +
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
