const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require("openai");
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// --- 1. 設定・初期化 ---
const config = {
    // Renderの設定名（CHANNEL_ACCESS_TOKEN）と標準名の両方に対応
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// ユーザーごとの指示を一時保存するメモリ (再起動でリセットされます)
const userInstructions = new Map();

// --- 2. AIキャプション生成関数（指示反映版） ---
async function generateAICaption(imageUrl, userInstruction = "特になし") {
    const systemPrompt = `
あなたは山梨県河口湖にある、無料の保護猫カフェ「アトリエ高菜先生」の広報担当AIです。
【猫スタッフ】高菜先生(代表)、デイビッド・ウニ(職人)、ししゃも(エンジニア)、ミルク山岡(麺職人)、小野のおピッピ(部長)、嬢ミノ(リーダー)、副キャプテン翼(カメラマン)

【ミッション】
ユーザーからの【今回の指示】を最優先に守りつつ、Instagram用の楽しく温かい投稿文を作成してください。
指示がない場合は、画像から推測して自由に作成してください。

【今回の指示】: ${userInstruction}
`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "この画像と指示に合わせて、最高のインスタ投稿を作ってにゃ。" },
                        { type: "image_url", image_url: { url: imageUrl } },
                    ],
                },
            ],
            max_tokens: 600,
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("AI生成失敗:", error);
        return `アトリエ高菜先生の猫スタッフだにゃ！ ${userInstruction} #アトリエ高菜先生`;
    }
}

// --- 3. Instagram投稿関数 ---
async function postToInstagram(fileName, instruction) {
    const igId = process.env.IG_BUSINESS_ID;
    const token = process.env.IG_ACCESS_TOKEN;
    const baseUrl = process.env.RENDER_EXTERNAL_URL;
    const imageUrl = `${baseUrl}/uploads/${fileName}`;

    try {
        const aiCaption = await generateAICaption(imageUrl, instruction);
        
        // メディアコンテナ作成
        const container = await axios.post(`https://graph.facebook.com/v21.0/${igId}/media`, {
            image_url: imageUrl,
            caption: aiCaption,
            access_token: token
        });

        // 公開
        await axios.post(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
            creation_id: container.data.id,
            access_token: token
        });

        console.log("★Instagram投稿成功！ 指示内容:", instruction);
    } catch (err) {
        console.error("★投稿失敗:", err.response?.data || err.message);
    }
}

// --- 4. LINE Webhook処理 ---
app.post('/webhook', express.json(), (req, res) => {
    const events = req.body.events;
    if (!events) return res.status(200).send('OK');

    Promise.all(events.map(handleEvent))
        .then(() => res.status(200).send('OK'))
        .catch((err) => {
            console.error("イベント処理エラー:", err);
            res.status(500).end();
        });
});

async function handleEvent(event) {
    // A. テキストメッセージが来たら「指示」として保存
    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text;
        userInstructions.set(event.source.userId, text);
        
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `指示「${text}」を受け付けたにゃ！次に送る写真に反映させるにゃ。` }]
        });
    }

    // B. 画像が来たら投稿処理
    if (event.type === 'message' && event.message.type === 'image') {
        const messageId = event.message.id;
        const userId = event.source.userId;
        const fileName = `line_${messageId}.jpg`;
        const filePath = path.join(__dirname, 'uploads', fileName);

        // 保存されていた指示を取得（なければデフォルト）
        const instruction = userInstructions.get(userId) || "自由に可愛く紹介して";

        try {
            const response = await axios({
                method: 'get',
                url: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
                headers: { 'Authorization': `Bearer ${config.channelAccessToken}` },
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            return new Promise((resolve) => {
                writer.on('finish', async () => {
                    // Instagramへ投稿
                    postToInstagram(fileName, instruction);
                    
                    // 指示を使い終わったら削除
                    userInstructions.delete(userId);

                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: 'text', text: '写真を預かったにゃ！指示通りに作ってアップしておくから、インスタを見てにゃ！' }]
                    });
                    resolve();
                });
            });
        } catch (error) {
            console.error("LINE画像取得エラー:", error.message);
        }
    }
}

// --- 5. サーバー起動 ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
