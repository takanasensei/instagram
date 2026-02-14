const axios = require('axios');
const path = require('path');

// --- 投稿用関数 ---
async function postToInstagram(fileName) {
    const igId = process.env.IG_BUSINESS_ID;
    const token = process.env.IG_ACCESS_TOKEN;
    
    // Render上のあなたのURL (例: https://my-app.onrender.com)
    const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://あなたのアプリ名.onrender.com';
    const imageUrl = `${baseUrl}/uploads/${fileName}`;

    console.log('Instagram投稿開始。画像URL:', imageUrl);

    try {
        // Step 1: コンテナ作成
        const container = await axios.post(`https://graph.facebook.com/v21.0/${igId}/media`, {
            image_url: imageUrl,
            caption: 'LINEからの自動投稿テスト #bot',
            access_token: token
        });

        // Step 2: 公開
        await axios.post(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
            creation_id: container.data.id,
            access_token: token
        });

        console.log('★Instagram投稿に成功しました！');
    } catch (err) {
        console.error('★投稿失敗:', err.response ? err.response.data : err.message);
    }
}

// --- LINE画像保存処理の中 ---
// Saved image: /opt/.../line_xxxxx.jpg のログの直後に追加
const fileName = path.basename(filePath); 
postToInstagram(fileName); // 投稿関数を呼び出す
