/** 
 * MIT License
 * 
 * Copyright (c) 2023 SayanthD
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE. 
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
import { FloodWaitError } from "telegram/errors";
import { NewMessageEvent } from "telegram/events/NewMessage";
import { sleep } from "telegram/Helpers";
import { Api } from "telegram/tl/api";

require('dotenv').config({ path: __dirname + '/.env' });

const apiId = Number(process.env.apiId);
if (isNaN(apiId)) {
    throw new Error('Invalid apiId');
}
const apiHash = process.env.apiHash as string;
if (!apiHash) {
    throw new Error('apiHash is required');
}

const stringSession = new StringSession(process.env.stringSession);
const rgxMatches = new RegExp(process.env.rgxPattern as string, "i");
const targetChat = Number(process.env.targetChat);
if (isNaN(targetChat)) {
    throw new Error('Invalid targetChat');
}
const chatsToMonitor = (process.env.sourceChats)?.split(",") as Array<string>;
const availableChats = new Array();

async function sendMedia(media: Api.TypeMessageMedia, caption: String) {
    try {
        await client.sendFile(targetChat, { file: media, caption: `${caption}` });
    } catch (error) {
        if (error instanceof FloodWaitError) {
            await sleep(error.seconds);
        }
    }
};

async function getReported(event: NewMessageEvent) {
    try {
        const message = event.message as Api.Message;
        if (message._sender.bot) return;
        if (!message.replyTo) return;
        console.log(`found keywords at id: ${message.id} pointing -> ${message.replyTo.replyToMsgId}`);
        console.log(`reported text: ${message.message}`);
        const reportedMedia = message.replyTo ? await message.getReplyMessage() : null;
        if (reportedMedia && reportedMedia.media) {
            const chatId = message.chat?.id.toString();
            const customCaption = `this was reported. Reason: ${message.message}, ` +
                `ID: <a href='https://t.me/c/${chatId}/${message.id}'>${message.id}</a>`
            await sendMedia(reportedMedia.media, customCaption);
        };
    } catch (err) {
        console.error(err);
    }
};

async function getMedia(event: NewMessageEvent) {
    const message = event.message as Api.Message;
    if (!message.media) return;
    try {
        const chatId = message.chat?.id.toString();
        const caption = message.text || "";
        console.log(`New ${message.media.className} with id: ${message.id}`);
        let customCaption = `<a href='https://t.me/c/${chatId}/${message.id}'>${message.id}</a>`
        if (caption) {
            customCaption += ` Caption: ${caption}`
        }
        await sendMedia(message.media, customCaption);
    }
    catch (error) {
        console.error(error)
    }
};

const client = new TelegramClient(
    stringSession, apiId,
    apiHash,
    { connectionRetries: 5, floodSleepThreshold: 180 });

(async () => {
    await client.start({ botAuthToken: "" });
    for (let chat of chatsToMonitor) {
        try {
            availableChats.push((await client.getEntity(chat)).id);
        }
        catch (error) {
            console.error(`Invalid chat '${chat} given!`);
        }
    }
    client.addEventHandler(getReported, new NewMessage({ chats: availableChats, pattern: rgxMatches }));
    client.addEventHandler(getMedia, new NewMessage({ chats: availableChats }));

    client.setParseMode("html");
    const me = await client.getMe() as Api.User;
    console.log(`${me.username} started with GramJS ${client.__version__}`);
})();
