import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

const TOOL_LABELS = {
    getStandings: "📊 Stand ophalen",
    getRecentMatches: "📋 Recente wedstrijden ophalen",
    getUpcomingMatches: "📅 Aankomende wedstrijden ophalen",
};

export default function App() {
    const [messages, setMessages] = useState([
        {
            role: "assistant",
            content: "Welke wedstrijd of tactiek wil je analyseren? Ik kan ook live standen en uitslagen opzoeken.",
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [totalTokens, setTotalTokens] = useState(0);
    const [statusLabel, setStatusLabel] = useState("");
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function sendMessage() {
        const trimmed = input.trim();
        if (!trimmed || loading) return;

        setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
        setInput("");
        setLoading(true);
        setStatusLabel("");

        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: trimmed }),
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const raw = decoder.decode(value);
                const lines = raw.split("\n").filter((l) => l.startsWith("data: "));

                for (const line of lines) {
                    const json = JSON.parse(line.replace("data: ", ""));

                    if (json.status) {
                        setStatusLabel(json.status);
                    }

                    if (json.toolUsed) {
                        setStatusLabel(TOOL_LABELS[json.toolUsed] ?? json.toolUsed);
                    }

                    if (json.token) {
                        setStatusLabel("");
                        setMessages((prev) => {
                            const updated = [...prev];
                            updated[updated.length - 1] = {
                                role: "assistant",
                                content: updated[updated.length - 1].content + json.token,
                            };
                            return updated;
                        });
                    }

                    if (json.done) {
                        setTotalTokens(json.totalTokens);
                    }
                }
            }
        } catch (err) {
            setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                    role: "assistant",
                    content: "Er ging iets mis. Probeer het opnieuw.",
                };
                return updated;
            });
        } finally {
            setLoading(false);
            setStatusLabel("");
        }
    }

    async function resetChat() {
        await fetch("/api/reset", { method: "POST" });
        setMessages([
            {
                role: "assistant",
                content: "Welke wedstrijd of tactiek wil je analyseren? Ik kan ook live standen en uitslagen opzoeken.",
            },
        ]);
        setTotalTokens(0);
    }

    function handleKeyDown(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    return (
        <div className="app">
            <header className="header">
                <div className="header-left">
                    <div className="avatar">⚽</div>
                    <div>
                        <h1>De Analist</h1>
                        <p>Tactisch voetbal op jouw niveau</p>
                    </div>
                </div>
                <div className="header-right">
                    {totalTokens > 0 && (
                        <span className="token-badge">{totalTokens} tokens</span>
                    )}
                    <button className="reset-btn" onClick={resetChat}>
                        Nieuw gesprek
                    </button>
                </div>
            </header>

            <main className="chat-window">
                {messages.map((msg, i) => (
                    <div key={i} className={`bubble-wrapper ${msg.role}`}>
                        <div className={`bubble ${msg.role}`}>
                            {msg.content === "" && msg.role === "assistant" ? (
                                <span className="cursor">▍</span>
                            ) : (
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            )}
                        </div>
                    </div>
                ))}

                {statusLabel && (
                    <div className="bubble-wrapper assistant">
                        <div className="bubble assistant status">
                            <span className="status-dot" />
                            {statusLabel}
                        </div>
                    </div>
                )}

                <div ref={bottomRef} />
            </main>

            <footer className="input-area">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Vraag naar tactiek, standen, of uitslagen..."
                    rows={2}
                    disabled={loading}
                />
                <button onClick={sendMessage} disabled={loading || !input.trim()}>
                    {loading ? "..." : "Stuur"}
                </button>
            </footer>
        </div>
    );
}
