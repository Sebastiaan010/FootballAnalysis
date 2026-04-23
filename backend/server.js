import express from "express";
import cors from "cors";
import { chatStream, resetHistory, getStats } from "./chat.js";

const app = express();

app.use(cors());
app.use(express.json());

// POST /api/chat — stuurt de response als stream terug
app.post("/api/chat", async (req, res) => {
    const { message } = req.body;

    if (!message || message.trim() === "") {
        return res.status(400).json({ error: "Geen bericht meegestuurd." });
    }

    console.log(`[user] ${message}`);

    await chatStream(message, res);
});

// POST /api/reset — wis de chat history
app.post("/api/reset", (req, res) => {
    resetHistory();
    res.json({ success: true });
});

// GET /api/stats — token usage en berichtentelling
app.get("/api/stats", (req, res) => {
    res.json(getStats());
});

app.listen(3000, () => {
    console.log("De Analist backend draait op http://localhost:3000");
});
