const express = require("express");
const fs = require("fs");
const path = require("path");
const line = require("@line/bot-sdk");

const app = express();
app.use(express.json());

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

const client = new line.Client(config);

// 保存先フォルダ
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Webhook
app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events || [];
    for (const ev of events) {
      if (ev.type !== "message") continue;

      // 画像だけ処理（まずは）
      if (ev.message.type === "image") {
        const messageId = ev.message.id;

        // 画像バイナリ取得（stream）
        const stream = await client.getMessageContent(messageId);

        const filename = `line_${messageId}.jpg`;
        const filepath = path.join(uploadDir, filename);

        await new Promise((resolve, reject) => {
          const writable = fs.createWriteStream(filepath);
          stream.pipe(writable);
          stream.on("end", resolve);
          stream.on("error", reject);
        });

        console.log("Saved image:", filepath);
      } else {
        console.log("Message:", ev.message.type, ev.message.text);
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error(e);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => res.send("LINE Webhook running"));

// 画像を公開（※次のステップで必要）
app.use("/uploads", express.static(uploadDir));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
