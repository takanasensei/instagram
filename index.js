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

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events || [];

    for (const ev of events) {
      if (ev.type !== "message") continue;

      if (ev.message.type === "image") {
        const messageId = ev.message.id;

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
        console.log("Text message:", ev.message.text);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.use("/uploads", express.static(uploadDir));

app.get("/", (req, res) => res.send("LINE Webhook running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
