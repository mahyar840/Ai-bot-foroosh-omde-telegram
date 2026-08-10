import { Bot, InlineKeyboard, InputFile } from "grammy";
import { extractPriceFromCaption, calculateSalePrice, formatToman, DEFAULT_TIERS } from "./pricing";
import { checkImageForCompetitorMarks, rewriteCaption, summarizeSupportRequest } from "./vision";
import { overlayLogo } from "./image";
import {
  buildAskCity,
  buildAskPhone,
  buildAskProduct,
  buildCustomerFinalReply,
  buildDirectContactMessage,
  buildIntro,
  buildOwnerBrief,
  withState,
  extractState,
} from "./support";

export interface Env {
  BOT_TOKEN: string;
  GROQ_API_KEY: string;
  WEBHOOK_SECRET: string;
  OWNER_CHAT_ID: string;
  MIDDLEMAN_CHAT_ID: string;
  TARGET_CHANNEL_ID: string;
  OWNER_PHONE: string;
  OWNER_TELEGRAM_USERNAME: string;
  AUTO_PUBLISH: string;
  LOGO_URL: string;
  GROQ_VISION_MODEL: string;
  GROQ_TEXT_MODEL: string;
  SUPPORT_INTRO: string;
}

function buildFinalCaption(
  cleanedDescription: string,
  salePriceFormatted: string,
  ownerPhone: string,
  ownerUsername: string
): string {
  return (
    `${cleanedDescription.trim()}\n\n` +
    `💰 قیمت: ${salePriceFormatted}\n\n` +
    `📞 ${ownerPhone}\n` +
    `🆔 @${ownerUsername}`
  );
}

function isLogoConfigured(logoUrl: string): boolean {
  return Boolean(logoUrl) && !logoUrl.startsWith("REPLACE_WITH");
}

function directContactKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("☎️ تماس مستقیم با پشتیبان", "direct_contact");
}

function registerHandlers(bot: Bot, env: Env) {
  bot.on("channel_post:photo", async (ctx) => {
    if (String(ctx.chat.id) !== env.MIDDLEMAN_CHAT_ID) return;

    const caption = ctx.channelPost.caption ?? "";

    // Telegram sometimes delivers an early/incomplete update for forwarded
    // photos with no caption yet, followed shortly by the real one. Skip
    // silently instead of raising a false alarm — the real delivery will
    // trigger this handler again with the full caption.
    if (!caption.trim()) return;

    const purchasePrice = extractPriceFromCaption(caption);

    if (purchasePrice === null) {
      await ctx.api.sendMessage(
        env.OWNER_CHAT_ID,
        `⚠️ نتونستم قیمت رو از این کپشن پیدا کنم، نیاز به بررسی دستی داره:\n\n${caption}`
      );
      return;
    }

    const photos = ctx.channelPost.photo!;
    const largest = photos[photos.length - 1];
    const file = await ctx.api.getFile(largest.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;

    let check;
    try {
      check = await checkImageForCompetitorMarks(fileUrl, env.GROQ_API_KEY, env.GROQ_VISION_MODEL);
    } catch (err) {
      await ctx.api.sendMessage(
        env.OWNER_CHAT_ID,
        `⚠️ خطا در بررسی تصویر با هوش‌مصنوعی (احتمالاً محدودیت نرخ Groq — چند دقیقه صبر کن و دوباره امتحان کن):\n${(err as Error).message}\n\nاین پست نیاز به بررسی دستی داره:\n${caption}`
      );
      return;
    }
    if (!check.isClean) {
      await ctx.api.sendMessage(
        env.OWNER_CHAT_ID,
        `🚫 این عکس رد شد (احتمال واترمارک/برند رقیب): ${check.reason}\n\nکپشن اصلی:\n${caption}`
      );
      return;
    }

    const salePrice = calculateSalePrice(purchasePrice, DEFAULT_TIERS);
    const salePriceFormatted = formatToman(salePrice);
    let cleanedDescription: string;
    try {
      cleanedDescription = await rewriteCaption(caption, env.GROQ_API_KEY, env.GROQ_TEXT_MODEL);
    } catch (err) {
      await ctx.api.sendMessage(
        env.OWNER_CHAT_ID,
        `⚠️ خطا در بازنویسی کپشن با هوش‌مصنوعی (احتمالاً محدودیت نرخ Groq):\n${(err as Error).message}\n\nاین پست نیاز به بررسی دستی داره:\n${caption}`
      );
      return;
    }
    const newCaption = buildFinalCaption(cleanedDescription, salePriceFormatted, env.OWNER_PHONE, env.OWNER_TELEGRAM_USERNAME);

    const imgRes = await fetch(fileUrl);
    const imgBytes = new Uint8Array(await imgRes.arrayBuffer());

    let finalImageBytes = imgBytes;
    if (isLogoConfigured(env.LOGO_URL)) {
      const logoRes = await fetch(env.LOGO_URL);
      const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
      finalImageBytes = await overlayLogo(imgBytes, { logoBytes, position: "bottom-right" });
    }

    if (env.AUTO_PUBLISH === "true") {
      await ctx.api.sendPhoto(env.TARGET_CHANNEL_ID, new InputFile(finalImageBytes, "post.jpg"), {
        caption: newCaption,
      });
      return;
    }

    await ctx.api.sendPhoto(env.OWNER_CHAT_ID, new InputFile(finalImageBytes, "post.jpg"), {
      caption: newCaption,
      reply_markup: new InlineKeyboard().text("✅ تایید و انتشار", "approve").text("❌ رد", "reject"),
    });
  });

  bot.on("callback_query:data", async (ctx) => {
    const action = ctx.callbackQuery.data;

    if (action === "direct_contact") {
      await ctx.answerCallbackQuery();
      await ctx.reply(buildDirectContactMessage(env.OWNER_PHONE, env.OWNER_TELEGRAM_USERNAME));
      return;
    }

    if (action !== "approve" && action !== "reject") return;

    const msg = ctx.callbackQuery.message;
    if (!msg?.photo) {
      await ctx.answerCallbackQuery({ text: "این پیام دیگه در دسترس نیست." });
      return;
    }

    if (action === "approve") {
      const largest = msg.photo[msg.photo.length - 1];
      await ctx.api.sendPhoto(env.TARGET_CHANNEL_ID, largest.file_id, {
        caption: msg.caption ?? "",
      });
      await ctx.answerCallbackQuery({ text: "منتشر شد ✅" });
    } else {
      await ctx.answerCallbackQuery({ text: "رد شد ❌" });
    }
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (String(ctx.chat.id) === env.OWNER_CHAT_ID) return;

    const prevState = extractState(ctx.message.reply_to_message?.text);

    if (!prevState) {
      await ctx.reply("اگه فقط دنبال شماره پشتیبانی هستی:", { reply_markup: directContactKeyboard() });
      await ctx.reply(withState(buildIntro(env.SUPPORT_INTRO), { step: "awaiting_name" }), {
        parse_mode: "HTML",
        reply_markup: { force_reply: true },
      });
      return;
    }

    if (prevState.step === "awaiting_name") {
      await ctx.reply(
        withState(buildAskPhone(ctx.message.text), { step: "awaiting_phone", name: ctx.message.text }),
        { parse_mode: "HTML", reply_markup: { force_reply: true } }
      );
      return;
    }

    if (prevState.step === "awaiting_phone") {
      await ctx.reply(
        withState(buildAskCity(), { step: "awaiting_city", name: prevState.name, phone: ctx.message.text }),
        { parse_mode: "HTML", reply_markup: { force_reply: true } }
      );
      return;
    }

    if (prevState.step === "awaiting_city") {
      await ctx.reply(
        withState(buildAskProduct(), {
          step: "awaiting_product",
          name: prevState.name,
          phone: prevState.phone,
          city: ctx.message.text,
        }),
        { parse_mode: "HTML", reply_markup: { force_reply: true } }
      );
      return;
    }

    if (prevState.step === "awaiting_product") {
      const product = ctx.message.text;
      const conversationText =
        `نام: ${prevState.name}\nشماره: ${prevState.phone}\nشهر/شغل: ${prevState.city}\nمحصول موردنظر: ${product}`;
      let summary: string;
      try {
        summary = await summarizeSupportRequest(conversationText, env.GROQ_API_KEY, env.GROQ_TEXT_MODEL);
      } catch {
        summary = "";
      }

      await ctx.api.sendMessage(
        env.OWNER_CHAT_ID,
        buildOwnerBrief({
          customerName: prevState.name,
          customerPhone: prevState.phone,
          customerCity: prevState.city,
          customerProduct: product,
          customerTelegramUsername: ctx.from?.username,
          customerTelegramId: ctx.chat.id,
          aiSummary: summary,
        })
      );

      await ctx.reply(
        buildCustomerFinalReply(prevState.name ?? "", product, env.OWNER_PHONE, env.OWNER_TELEGRAM_USERNAME)
      );
    }
  });

  bot.command("start", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    await ctx.reply("اگه فقط دنبال شماره پشتیبانی هستی:", { reply_markup: directContactKeyboard() });
    await ctx.reply(withState(buildIntro(env.SUPPORT_INTRO), { step: "awaiting_name" }), {
      parse_mode: "HTML",
      reply_markup: { force_reply: true },
    });
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("karmand bot webhook is up.", { status: 200 });
    }

    const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (providedSecret !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update: unknown;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const bot = new Bot(env.BOT_TOKEN);
    registerHandlers(bot, env);

    ctx.waitUntil(bot.init().then(() => bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0])));

    return new Response("OK", { status: 200 });
  },
};
