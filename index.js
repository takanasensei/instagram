const { OpenAI } = require("openai");
const axios = require('axios');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- 1. AIキャプション生成関数 ---
async function generateAICaption(imageUrl) {
    const systemPrompt = `
あなたは山梨県河口湖にある、無料の保護猫カフェ・コミュニティスペース「アトリエ高菜先生」の広報担当AIです。
送られた画像を見て、Instagram用の投稿文を作成してください。

【アトリエ高菜の魂】
・「猫に会うのに、理由はいらない。」がコンセプト。
・代表取締役猫の「高菜先生」を筆頭に、訳アリの保護猫7匹が「猫スタッフ」として働いています。
・ここは「ギブの精神」で運営される無料の場所。寄付や応援で成り立っています。

【猫スタッフ名鑑】
1. 高菜先生：代表取締役猫。わがままボディの看板猫。世界一有名な猫を目指している。
2. デイビッド・ウニ：染め物職人。白猫。人見知りゼロ。
3. ししゃも・ノートルダム：Webエンジニア。やる気ゼロ。難病を乗り越えた。
4. ミルク山岡：麺職人。2024年保護。ヤンチャ。
5. 小野のおピッピ：すりだね製造部長。推定10〜15歳のおばあちゃん。
6. 綾小路 嬢ミノ：バイトリーダー。おしとやか。
7. The 副キャプテン翼：カメラマン。嬢ミノの弟。動き回る。

【投稿のトーン】
・猫たちの「役職」に絡めたユーモアのある文章。
・「〜だにゃ」「〜だよ」など、温かく猫が喋っているような雰囲気。
・最後は「河口湖で待ってるにゃ」的な一言。

【必須タグ】
#アトリエ高菜先生 #高菜先生 #保護猫カフェ #河口湖 #富士山 #猫好きさんと繋がりたい #猫スタッフ #保護猫
`;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "この画像で1件、インスタ投稿を作って。猫の名前がわかれば名前を呼んであげて。" },
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

// --- 2. Instagram投稿メイン関数 ---
async function postToInstagram(fileName) {
    const igId = process.env.IG_BUSINESS_ID;
    const token = process.env.IG_ACCESS_TOKEN;
    const baseUrl = process.env.RENDER_EXTERNAL_URL;
    const imageUrl = `${baseUrl}/uploads/${fileName}`;

    console.log("Instagram投稿プロセス開始...");

    // 1. AIに文章を考えてもらう
    const aiCaption = await generateAICaption(imageUrl);
    console.log("生成されたキャプション:", aiCaption);

    try {
        // 2. メディアコンテナ作成
        const container = await axios.post(`https://graph.facebook.com/v21.0/${igId}/media`, {
            image_url: imageUrl,
            caption: aiCaption,
            access_token: token
        });

        // 3. 公開実行
        await axios.post(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
            creation_id: container.data.id,
            access_token: token
        });

        console.log("★アトリエ高菜先生の投稿に成功しました！");
    } catch (err) {
        console.error("★投稿失敗:", err.response?.data || err.message);
    }
}
