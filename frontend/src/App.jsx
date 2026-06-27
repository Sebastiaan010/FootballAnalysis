import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

const TOOL_LABELS = {
    getStandings: "📊 Stand ophalen",
    getRecentMatches: "📋 Recente wedstrijden ophalen",
    getUpcomingMatches: "📅 Aankomende wedstrijden ophalen",
    searchDocuments: "📖 Tactische documenten raadplegen",
};

const SOURCE_LABELS = {
    "pressing.txt": "Pressing & Gegenpressing",
    "formations.txt": "Formaties & Systemen",
    "coaches.txt": "Coaches & Filosofieën",
};

function StandingsTable({ rows }) {
    return (
        <div className="data-table-wrapper">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Team</th>
                        <th>G</th>
                        <th>W</th>
                        <th>G</th>
                        <th>V</th>
                        <th>DS</th>
                        <th>Pnt</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i}>
                            <td>{row.positie}</td>
                            <td className="team-name">{row.team}</td>
                            <td>{row.gespeeld}</td>
                            <td>{row.gewonnen}</td>
                            <td>{row.gelijk}</td>
                            <td>{row.verloren}</td>
                            <td>{row.doelpuntensaldo > 0 ? `+${row.doelpuntensaldo}` : row.doelpuntensaldo}</td>
                            <td><strong>{row.punten}</strong></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function MatchesTable({ rows }) {
    return (
        <div className="data-table-wrapper">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Competitie</th>
                        <th>Thuis</th>
                        <th>Score</th>
                        <th>Uit</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i}>
                            <td>{row.datum}</td>
                            <td>{row.competitie}</td>
                            <td className="team-name">{row.thuis}</td>
                            <td><strong>{row.score ?? "—"}</strong></td>
                            <td className="team-name">{row.uit}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function App() {
    const [messages, setMessages] = useState([
        {
            role: "assistant",
            content: "Welke wedstrijd of tactiek wil je analyseren? Ik kan live standen opzoeken én tactische documenten raadplegen.",
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [totalTokens, setTotalTokens] = useState(0);
    const [statusLabel, setStatusLabel] = useState("");
    const [lastSources, setLastSources] = useState([]);
    const [tableData, setTableData] = useState(null);
    const bottomRef = useRef(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, tableData]);

    async function sendMessage() {
        const trimmed = input.trim();
        if (!trimmed || loading) return;

        setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
        setInput("");
        setLoading(true);
        setStatusLabel("");
        setLastSources([]);
        setTableData(null);

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

                    if (json.status) setStatusLabel(json.status);

                    if (json.toolUsed) {
                        setStatusLabel(TOOL_LABELS[json.toolUsed] ?? json.toolUsed);
                        if (json.sources) setLastSources(json.sources);
                        if (json.tableData) setTableData(json.tableData);
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

                    if (json.done) setTotalTokens(json.totalTokens);
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
        setMessages([{
            role: "assistant",
            content: "Welke wedstrijd of tactiek wil je analyseren? Ik kan live standen opzoeken én tactische documenten raadplegen.",
        }]);
        setTotalTokens(0);
        setLastSources([]);
        setTableData(null);
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

                {tableData && !loading && (
                    <div className="bubble-wrapper assistant">
                        <div className="bubble assistant table-bubble">
                            {tableData.type === "getStandings" && (
                                <StandingsTable rows={tableData.rows} />
                            )}
                            {(tableData.type === "getRecentMatches" || tableData.type === "getUpcomingMatches") && (
                                <MatchesTable rows={tableData.rows} />
                            )}
                        </div>
                    </div>
                )}

                {lastSources.length > 0 && !loading && (
                    <div className="sources">
                        <span className="sources-label">Bronnen:</span>
                        {lastSources.map((src) => (
                            <span key={src} className="source-badge">
                                📄 {SOURCE_LABELS[src] ?? src}
                            </span>
                        ))}
                    </div>
                )}

                <div ref={bottomRef} />
            </main>

            <footer className="input-area">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Vraag naar tactiek, standen, coaches of formaties..."
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
