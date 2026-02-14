const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require("openai");
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// --- 1. 設定・初期化 ---
const config = {
    // Renderの設定名と標準名の両方をサポート
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

// ユーザーごとの指示を一時保存するメモリ
const userInstructions = new Map();

// --- 2. AIキャプション生成関数 ---

// --- 2. AIキャプション生成関数（実況・丁寧語・タグ増量版） ---
async function generateAICaption(imageUrl, userInstruction = "特になし") {
    const systemPrompt = `
あなたは山梨県河口湖にある、無料の保護猫カフェ「アトリエ高菜先生」の広報スタッフAIです。

【投稿スタイル】
・口調は丁寧な「です・ます」調で統一してください。
・視点は「現場のスタッフ」として、今まさに目の前で猫たちがしていることを実況するように描写してください。
・最後は必ず「皆様のご来店を猫スタッフ一同、心よりお待ちしております」や「ぜひ、可愛い猫たちに会いに来てくださいね」といった来店を促す文言で締めてください。

【猫スタッフ名鑑】
1. 高菜先生：代表取締役猫。わがままボディ。キジトラでオス。運動嫌い。食べることと寝ること大好き。社長など一部の気に入った人にしか近寄らないけど、気に入った人にはべったり・体重7.5KGある。宮崎県出身。
2. デイビッド・ウニ：染め物職人。人見知りゼロ。大きめの白猫。ししゃもと巨大でいつも高菜先生にちょっかいを出している。おなか触られるのが好き。
3. ししゃも・ノートルダム：Webエンジニア。やる気ゼロ。どこかで寝てる。おなかがすいた時だけ主張する。ウニのお兄ちゃん。
4. ミルク山岡：麺職人。ヤンチャ坊主。常に走り回っている。チュール大好き。
5. 小野のおピッピ：すりだね製造部長。おばあちゃん猫。人の膝の上に乗るのが大好き。
6. 綾小路 嬢ミノ：お転婆娘。チュール大好き。弟の翼といつも一緒に走り回っている。人の方の上に乗るのが好き。
7. The 副キャプテン翼：常に動きまわっている。食べるの大好き。好奇心お政。嬢ミノの弟。

【ミッション】
ユーザーからの【今回の指示】を反映しつつ、画像から読み取れる状況を臨場感たっぷりに伝えてください。
【今回の指示】: ${userInstruction}

【ハッシュタグ】
以下の内容を含むハッシュタグを15個前後、必ず末尾につけてください。
#アトリエ高菜先生 #高菜先生 #保護猫カフェ #河口湖 #山梨観光 #猫スタッフ #保護猫 #猫好きさんと繋がりたい #猫のいる暮らし #もふもふ #富士山近くの猫カフェ #看板猫 #猫実況 #癒やしの時間 #catscafe
`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "この画像と指示に合わせて、丁寧な実況スタイルのインスタ投稿を作ってください。" },
                        { type: "image_url", image_url: { url: imageUrl } },
                    ],
                },
            ],
            max_tokens: 800, // 文章量が増えるため少し拡張
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("AI生成失敗:", error);
        return `アトリエ高菜先生の猫スタッフの様子をお届けします！ぜひ遊びに来てください。 #アトリエ高菜先生 #保護猫カフェ #河口湖 #猫スタッフ`;
    }
}


// --- 3. Instagram投稿関数（待機処理を追加） ---
async function postToInstagram(fileName, instruction) {
    const igId = process.env.IG_BUSINESS_ID;
    const token = process.env.IG_ACCESS_TOKEN;
    const baseUrl = process.env.RENDER_EXTERNAL_URL;
    const imageUrl = `${baseUrl}/uploads/${fileName}`;

    try {
        const aiCaption = await generateAICaption(imageUrl, instruction);
        
        console.log("1. メディアコンテナを作成中...");
        const container = await axios.post(`https://graph.facebook.com/v21.0/${igId}/media`, {
            image_url: imageUrl,
            caption: aiCaption,
            access_token: token
        });

        const creationId = container.data.id;

        // --- 修正ポイント：画像処理待ち時間を導入 ---
        console.log("2. インスタ側の画像処理を10秒待ちます...");
        await new Promise(resolve => setTimeout(resolve, 10000)); 

        console.log("3. 公開（パブリッシュ）実行！");
        await axios.post(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
            creation_id: creationId,
            access_token: token
        });

        console.log("★Instagram投稿に成功しました！");
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
    // 指示（テキスト）の受け取り
    if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text;
        userInstructions.set(event.source.userId, text);
        
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: `指示「${text}」を受け付けたにゃ！次に送る写真に反映させるにゃ。` }]
        });
    }

    // 画像の受け取りと投稿
    if (event.type === 'message' && event.message.type === 'image') {
        const messageId = event.message.id;
        const userId = event.source.userId;
        const fileName = `line_${messageId}.jpg`;
        const filePath = path.join(__dirname, 'uploads', fileName);

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
                    postToInstagram(fileName, instruction);
                    userInstructions.delete(userId);

                    await client.replyMessage({
                        replyToken: event.replyToken,
                        messages: [{ type: 'text', text: '写真を預かったにゃ！10秒くらいでインスタに反映されるはずだにゃ！' }]
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
