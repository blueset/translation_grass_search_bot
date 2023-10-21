import { Composer, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import Fuse from 'fuse.js'

const DATA_URL = "https://blueset.github.io/translation_grass_history/messages.json";
const SUBSCRIPTION_KEY = process.env.SUBSCRIPTION_KEY!;
const ENDPOINT = process.env.ENDPOINT!;
const CHANNEL = `TranslationGrass`;

const helpText = `Send me an image, and I will search it in @${CHANNEL} logs.

Data from https://blueset.github.io/translation_grass_history/
`;

export function setupBot(bot: Telegraf) {
    bot.command("start", async (ctx) => {
        return ctx.reply(helpText);
    });

    bot.command("help", async (ctx) => {
        return ctx.reply(helpText);
    });

    bot.catch(async (err, ctx) => {
        if (`${err}`.indexOf("Forbidden: bot was blocked by the user") >= 0) return;
        if (`${err}`.indexOf("Too Many Requests")) return;
        await ctx.reply(`Error <pre>${err}</pre>`, { parse_mode: "HTML", reply_to_message_id: ctx.message?.message_id })
    });

    bot.on(message("photo"), Composer.privateChat(async (ctx) => {
        const photo = ctx.message.photo;
        // console.log("Photo", photo);
        if (!photo) return;
        const message = await ctx.reply("Processing...", { reply_to_message_id: ctx.message?.message_id });
        const file = photo[photo.length - 1];
        // console.log("File", file);
        const fileId = file.file_id;
        const fileLink = await ctx.telegram.getFileLink(fileId);
        // console.log("File link", fileLink);
        const fileUrl = fileLink.href;

        const response = await fetch(fileUrl);
        const buffer = await response.arrayBuffer();
        const image = Buffer.from(buffer);
        // console.log("Image", image.length);

        const dataResponse = await fetch(DATA_URL);
        const data: {id: number, text: string, ocr?: string}[] = await dataResponse.json();
        // console.log("Data", data.length);

        // OCR image
        const headers = {
            "Ocp-Apim-Subscription-Key": SUBSCRIPTION_KEY,
            "Content-Type": "application/octet-stream"
        };
        const ocrResponse = await fetch(`${ENDPOINT}vision/v3.2/read/analyze`, {
            method: "POST",
            headers,
            body: image
        });
        // console.log("OCR response", ocrResponse.status, ocrResponse.headers.get("Operation-Location"), ocrResponse);
        const result_url = ocrResponse.headers.get("Operation-Location")!;

        let result = {status: "notStarted", analyzeResult: {readResults: [{lines: [{text: ""}]}]}};
        while (result.status === "notStarted" || result.status === "running") {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const resultResponse = await fetch(result_url, { headers });
            // console.log("OCR result", resultResponse.status, resultResponse);
            if (resultResponse.status === 429) {
                await new Promise(resolve => setTimeout(resolve, parseFloat(resultResponse.headers.get("Retry-After")!) * 1000));
                continue;
            }
            result = await resultResponse.json();
            // console.log("OCR result", result);
        }

        if (result.status !== "succeeded") {
            return ctx.telegram.editMessageText(message.chat.id, message.message_id, undefined, `Error recognizing image: ${JSON.stringify(result)}`);
        }

        const outcome = result.analyzeResult.readResults.map(r => r.lines.map(l => l.text).join("\n")).join("\n");
        // console.log("Outcome", outcome);

        const fuse = new Fuse(data, {includeScore: true, keys: ["text", "ocr"]});

        const matches = fuse.search(outcome).slice(0, 5);
        // console.log("Matches", matches);

        if (!matches.length) {
            return ctx.telegram.editMessageText(message.chat.id, message.message_id, undefined, `No matches found.`);
        }

        const text = matches.map(m => `https://t.me/${CHANNEL}/${m.item.id}\nConfidence: ${((1 - (m.score ?? 1)) * 100).toFixed(2)}%`).join("\n\n");

        return ctx.telegram.editMessageText(message.chat.id, message.message_id, undefined, text, { disable_web_page_preview: matches.length !== 1 });
    }));
}