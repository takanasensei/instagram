const express = require('express');
const line = require('@line/bot-sdk');
const { OpenAI } = require("openai");
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// --- 1. 設定・初期化 ---
const config = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// 最新SDK(v9)対応のクライアント作成
const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: config.channelAccessToken
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const app = express();

// 画像を外部（Instagram）から参照可能にする設定
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// フォルダがない場合は作成
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// --- 2. AIキャプション生成関数（アトリエ高菜先生専用） ---
async function generateAICaption(imageUrl) {
    const systemPrompt = `
あなたは山梨県河口湖にある、無料の保護猫カフェ・コミュニティスペース「アトリエ高菜先生」の広報担当AIです。
送られた画像を見て、Instagram用の投稿文を作成してください。

【アトリエ高菜の魂】
・「猫に会うのに、理由はいらない。」がコンセプト。
・看板猫「高菜先生」をはじめ、個性豊かな7匹の保護猫が「猫スタッフ」として働いています。
・ギブの精神で運営される無料の場所。寄付や応援で成り立っています。

【猫スタッフ名鑑】
1. 高菜先生：代表取締役猫。わがままボディ。
2. デイビッド・ウニ：染め物職人（白猫）。人見知りゼロ。
3. ししゃも・ノートルダム：Webエンジニア。やる気ゼロ。
4. ミルク山岡：麺職人。ヤンチャ坊主。
5. 小野のおピッピ：すりだね製造部長。おばあちゃん猫。
6. 綾小路 嬢ミノ：バイトリーダー。おしとやか。
7. The 副キャプテン翼：カメラマン。常に動き回る。

【投稿のトーン】
・猫たちの役職に触れつつ、温かくユーモアのある文章。
・「〜だにゃ」「〜だね」など、猫が語りかけるような口調。
・最後は「河口湖で待ってるにゃ」的な一言。

【必須タグ】
#アトリエ高菜先生 #高菜先生 #保護猫カフェ #河口湖 #猫スタッフ #保護猫 #猫好きさんと繋がりたい
`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "この画像でInstagram投稿を作って。猫の名前がわかれば呼んであげて。" },
                        { type: "image_url", image_url: { url: imageUrl } },
                    ],
                },
            ],
            max_tokens: 500,
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("AI生成失敗:", error);
        return "アトリエ高菜先生から、今日ものんびりな猫スタッフの様子をお届け。 #アトリエ高菜先生 #保護猫カフェ";
    }
}

// --- 3. Instagram投稿メイン関数 ---
async function postToInstagram(fileName) {
    const igId = process.env.IG_BUSINESS_ID;
    const token = process.env.IG_ACCESS_TOKEN;
    const baseUrl = process.env.RENDER_EXTERNAL_URL; // https://〜.onrender.com
    const imageUrl = `${baseUrl}/uploads/${fileName}`;

    console.log("Instagram投稿プロセス開始... 画像URL:", imageUrl);

    try {
        const aiCaption = await generateAICaption(imageUrl);
        console.log("生成キャプション:", aiCaption);

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

        console.log("★Instagram投稿に成功しました！");
    } catch (err) {
        console.error("★投稿失敗:", err.response?.data || err.message);
    }
}

// --- 4. LINE Webhook処理 ---
app.post('/webhook', express.json(), (req, res) => {
    const events = req.body.events;
    if (!events || events.length === 0) return res.status(200).send('OK');

    Promise.all(events.map(handleEvent))
        .then(() => res.status(200).send('OK'))
        .catch((err) => {
            console.error("イベント処理エラー:", err);
            res.status(500).end();
        });
});

async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'image') {
        return Promise.resolve(null);
    }

    const messageId = event.message.id;
    const fileName = `line_${messageId}.jpg`;
    const filePath = path.join(__dirname, 'uploads', fileName);

    try {
        // LINEから画像をダウンロード (401エラー対策: 直接環境変数を参照)
        const response = await axios({
            method: 'get',
            url: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
            headers: { 'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', async () => {
                console.log(`Saved image: ${filePath}`);
                
                // Instagram投稿を非同期で実行
                postToInstagram(fileName);

                // LINEへ返信
                await client.replyMessage({
                    replyToken: event.replyToken,
                    messages: [{ type: 'text', text: '写真を預かったにゃ！高菜先生（AI）が文章を考えてアップするから待っててにゃ！' }]
                });
                resolve();
            });
            writer.on('error', reject);
        });
    } catch (error) {
        console.error("画像取得エラー（LINE側）:", error.response?.data || error.message);
    }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
