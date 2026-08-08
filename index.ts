import { Bot, webhookCallback, InlineKeyboard } from "grammy";
import { extractPriceFromCaption, calculateSalePrice, formatToman, DEFAULT_TIERS } from "./pricing";
import { checkImageForCompetitorMarks, rewriteCaption, summarizeSupportRequest } from "./vision";
import { overlayLogo } from "./image";
import {
  savePendingPost,
  getPendingPost,
  deletePendingPost,
  getSupportState,
  saveSupportState,
  clearSupportState,
} from "./storage";
import { buildCustomerReplyWithContact, buildOwnerBrief, nextSupportStep } from "./support";

export interface Env {
  BOT_KV: KVNamespace;
  BOT_TOKEN: string;
  GROQ_API_KEY: string;
  WEBHOOK_SECRET: string;
  OWNER_CHAT_ID: string;
  MIDDLEMAN_CHAT_ID: string;
  TARGET_CHANNEL_ID: string;
  OWNER_PHONE: string;
  OWNER_TELEGRAM_USERNAME: string;
  AUTO_PUBLISH: string;
  LOGO_URL: string; // a public URL to your logo PNG (e.g. hosted on R2 / Cloudflare Images)
  GROQ_VISION_MODEL: string; // check https://console.groq.com/docs/models for current name
  GROQ_TEXT_MODEL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const bot = new Bot(env.BOT_TOKEN);

    // --- 1) Product pipeline: new post arrives in the middleman channel ---
    bot.on("channel_post:photo", async (ctx) => {
      if (String(ctx.chat.id) !== env.MIDDLEMAN_CHAT_ID) return; // ignore other channels

      const caption = ctx.channelPost.caption ?? "";
      const purchasePrice = extractPriceFromCaption(caption);

      if (purchasePrice === null) {
        await ctx.api.sendMessage(
          env.OWNER_CHAT_ID,
          `⚠️ نتونستم قیمت رو از این کپشن پیدا کنم، نیاز به بررسی دستی داره:\n\n${caption}`
        );
        return;
      }

      // Fetch the largest photo size and get a direct file URL
      const photos = ctx.channelPost.photo!;
      const largest = photos[photos.length - 1];
      const file = await ctx.api.getFile(largest.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;

      // Watermark / competitor-mark check
      const check = await checkImageForCompetitorMarks(fileUrl, env.GROQ_API_KEY, env.GROQ_VISION_MODEL);
      if (!check.isClean) {
        await ctx.api.sendMessage(
          env.OWNER_CHAT_ID,
          `🚫 این عکس رد شد (احتمال واترمارک/برند رقیب): ${check.reason}\n\nکپشن اصلی:\n${caption}`
        );
        return;
      }

      const salePrice = calculateSalePrice(purchasePrice, DEFAULT_TIERS);
      const salePriceFormatted = formatToman(salePrice);
      const newCaption = await rewriteCaption(caption, salePriceFormatted, env.GROQ_API_KEY, env.GROQ_TEXT_MODEL);

      // Download the photo bytes, stamp the logo, re-upload
      const imgRes = await fetch(fileUrl);
      const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
      const logoRes = await fetch(env.LOGO_URL);
      const logoBytes = new Uint8Array(await logoRes.arrayBuffer());
      const stampedBytes = await overlayLogo(imgBytes, { logoBytes, position: "bottom-right" });

      const postId = crypto.randomUUID();

      if (env.AUTO_PUBLISH === "true") {
        await ctx.api.sendPhoto(env.TARGET_CHANNEL_ID, new File([stampedBytes], "post.jpg"), {
          caption: newCaption,
        });
        return;
      }

      // Send to owner for approval
      const sentMsg = await ctx.api.sendPhoto(env.OWNER_CHAT_ID, new File([stampedBytes], "post.jpg"), {
        caption: `${newCaption}\n\n— برای تایید و انتشار در کانال، دکمه زیر رو بزن —`,
        reply_markup: new InlineKeyboard()
          .text("✅ تایید و انتشار", `approve:${postId}`)
          .text("❌ رد", `reject:${postId}`),
      });

      await savePendingPost(env.BOT_KV, {
        id: postId,
        photoFileId: sentMsg.photo![sentMsg.photo!.length - 1].file_id,
        finalCaption: newCaption,
        createdAt: Date.now(),
      });
    });

    // --- 2) Approve / reject buttons ---
    bot.on("callback_query:data", async (ctx) => {
      const data = ctx.callbackQuery.data;
      const [action, postId] = data.split(":");
      if (action !== "approve" && action !== "reject") return;

      const pending = await getPendingPost(env.BOT_KV, postId);
      if (!pending) {
        await ctx.answerCallbackQuery({ text: "این پست دیگه در دسترس نیست." });
        return;
      }

      if (action === "approve") {
        await ctx.api.sendPhoto(env.TARGET_CHANNEL_ID, pending.photoFileId, {
          caption: pending.finalCaption,
        });
        await ctx.answerCallbackQuery({ text: "منتشر شد ✅" });
      } else {
        await ctx.answerCallbackQuery({ text: "رد شد ❌" });
      }

      await deletePendingPost(env.BOT_KV, postId);
    });

    // --- 3) Support flow: private messages from customers (not you) ---
    bot.on("message:text", async (ctx) => {
      if (ctx.chat.type !== "private") return;
      if (String(ctx.chat.id) === env.OWNER_CHAT_ID) return; // that's you, not a customer

      const chatId = ctx.chat.id;
      const state = await getSupportState(env.BOT_KV, chatId);
      const { state: newState, botReply } = nextSupportStep(state, ctx.message.text);
      await saveSupportState(env.BOT_KV, chatId, newState);

      if (botReply) {
        await ctx.reply(botReply);
        return;
      }

      if (newState.step === "done") {
        const conversationText = `نام: ${newState.name}\nشهر/شغل: ${newState.city}\nمحصول موردنظر: ${newState.product}`;
        const summary = await summarizeSupportRequest(conversationText, env.GROQ_API_KEY, env.GROQ_TEXT_MODEL);

        await ctx.api.sendMessage(
          env.OWNER_CHAT_ID,
          buildOwnerBrief({
            customerName: newState.name,
            customerCity: newState.city,
            customerProduct: newState.product,
            customerTelegramUsername: ctx.from?.username,
            customerTelegramId: chatId,
            aiSummary: summary,
          })
        );

        await ctx.reply(buildCustomerReplyWithContact(env.OWNER_PHONE, env.OWNER_TELEGRAM_USERNAME));
        await clearSupportState(env.BOT_KV, chatId);
      }
    });

    bot.command("start", async (ctx) => {
      if (ctx.chat.type !== "private") return;
      await ctx.reply("سلام 👋 خوش اومدی! هر سوالی داری بپرس تا کمکت کنم.");
    });

    const handleUpdate = webhookCallback(bot, "cloudflare-mod", {
      secretToken: env.WEBHOOK_SECRET,
    });
    return handleUpdate(request);
  },
};
