import "dotenv/config";
import { AzureChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getStandings, getRecentMatches, getUpcomingMatches } from "./tools.js";
import { searchDocuments } from "./embeddings.js";

const llm = new AzureChatOpenAI({
    temperature: 0.7,
    streaming: true,
});

const SYSTEM_PROMPT = `Je bent "De Analist" — een gepassioneerde voetbaltactiek-expert die praat als een slimme voetbalvriend die echt verstand van zaken heeft.

Je doelgroep zijn fanatieke voetbalfans (16-35 jaar) die al weten wat een 4-3-3 is, pressing begrijpen en houden van tactische diepgang. Leg nooit basisregels uit.

Je hebt toegang tot twee soorten tools:

LIVE DATA TOOLS (gebruik voor actuele informatie):
- getStandings: actuele stand van een competitie. De data wordt automatisch als tabel getoond aan de gebruiker, je hoeft de stand dus NIET als tekst op te sommen. Geef een korte tactische analyse bij de stand.
- getRecentMatches: recente wedstrijden van een team. De data wordt automatisch als tabel getoond, je hoeft de scores NIET op te sommen. Geef een korte analyse.
- getUpcomingMatches: aankomende wedstrijden van een team. De data wordt automatisch als tabel getoond.

DOCUMENT SEARCH TOOL (gebruik voor tactische kennis):
- searchDocuments: zoek in tactische documenten over pressing, formaties en coaches

Beschikbare competitiecodes: PL (Premier League), DED (Eredivisie), CL (Champions League), PD (La Liga), BL1 (Bundesliga), SA (Serie A), FL1 (Ligue 1)
Beschikbare team IDs: liverpool=64, manchester city=65, arsenal=57, chelsea=61, manchester united=66, ajax=678, psv=674, feyenoord=675, barcelona=81, real madrid=86, atletico madrid=78, bayern münchen=5, borussia dortmund=4

Jouw stijl:
- Enthousiast, direct en opinionated — jij hebt een mening en verdedigt die
- Combineer documentkennis met live data voor complete antwoorden
- Gebruik voetbaljargon: pressing lines, half-spaces, balbezit, counterpressing
- Korte alinea's, geen opsommingslijsten tenzij het echt helpt
- Vermeld altijd de bron als je info uit een document haalt

Beperkingen:
- Geen blessure-diagnoses of medisch advies
- Geen wedtips of gokadvies
- Voor live scores: verwijs naar Livescore`;

const standingsTool = tool(
    async ({ competitionCode }) => {
        try {
            const data = await getStandings(competitionCode);
            return JSON.stringify(data);
        } catch (e) {
            return `Fout bij ophalen stand: ${e.message}`;
        }
    },
    {
        name: "getStandings",
        description: "Haal de actuele stand op van een voetbalcompetitie.",
        schema: z.object({
            competitionCode: z.string().describe("De competitiecode, bijv. PL voor Premier League"),
        }),
    }
);

const recentMatchesTool = tool(
    async ({ teamId, limit }) => {
        try {
            const data = await getRecentMatches(teamId, limit ?? 5);
            return JSON.stringify(data);
        } catch (e) {
            return `Fout bij ophalen wedstrijden: ${e.message}`;
        }
    },
    {
        name: "getRecentMatches",
        description: "Haal recente gespeelde wedstrijden op van een team.",
        schema: z.object({
            teamId: z.number().describe("Het team ID, bijv. 64 voor Liverpool"),
            limit: z.number().optional().describe("Aantal wedstrijden, standaard 5"),
        }),
    }
);

const upcomingMatchesTool = tool(
    async ({ teamId, limit }) => {
        try {
            const data = await getUpcomingMatches(teamId, limit ?? 5);
            return JSON.stringify(data);
        } catch (e) {
            return `Fout bij ophalen aankomende wedstrijden: ${e.message}`;
        }
    },
    {
        name: "getUpcomingMatches",
        description: "Haal aankomende geplande wedstrijden op van een team.",
        schema: z.object({
            teamId: z.number().describe("Het team ID, bijv. 678 voor Ajax"),
            limit: z.number().optional().describe("Aantal wedstrijden, standaard 5"),
        }),
    }
);

const searchDocumentsTool = tool(
    async ({ query }) => {
        try {
            const results = await searchDocuments(query, 3);
            return JSON.stringify(results.map(r => ({
                bron: r.source,
                inhoud: r.content,
            })));
        } catch (e) {
            return `Fout bij zoeken in documenten: ${e.message}`;
        }
    },
    {
        name: "searchDocuments",
        description: "Zoek in tactische kennisdocumenten over pressing, formaties en coaches.",
        schema: z.object({
            query: z.string().describe("De zoekterm, bijv. 'gegenpressing Klopp' of '4-3-3 voordelen'"),
        }),
    }
);

const tools = [standingsTool, recentMatchesTool, upcomingMatchesTool, searchDocumentsTool];
const llmWithTools = llm.bindTools(tools);

let chatHistory = [];
let totalTokensUsed = 0;

export async function chatStream(userMessage, res) {
    chatHistory.push(new HumanMessage(userMessage));

    const messages = [
        new SystemMessage(SYSTEM_PROMPT),
        ...chatHistory,
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const initialResponse = await llmWithTools.invoke(messages);

    if (initialResponse.tool_calls && initialResponse.tool_calls.length > 0) {
        res.write(`data: ${JSON.stringify({ status: "Data ophalen..." })}\n\n`);

        const toolResults = [];

        for (const toolCall of initialResponse.tool_calls) {
            console.log(`[tool] ${toolCall.name} aangeroepen met`, toolCall.args);

            let result;
            if (toolCall.name === "getStandings") result = await standingsTool.invoke(toolCall.args);
            else if (toolCall.name === "getRecentMatches") result = await recentMatchesTool.invoke(toolCall.args);
            else if (toolCall.name === "getUpcomingMatches") result = await upcomingMatchesTool.invoke(toolCall.args);
            else if (toolCall.name === "searchDocuments") result = await searchDocumentsTool.invoke(toolCall.args);

            toolResults.push(new ToolMessage({
                content: result,
                tool_call_id: toolCall.id,
            }));

            const toolInfo = { toolUsed: toolCall.name };

            // Stuur ruwe tabeldata mee voor standings en matches
            if (["getStandings", "getRecentMatches", "getUpcomingMatches"].includes(toolCall.name)) {
                try {
                    toolInfo.tableData = {
                        type: toolCall.name,
                        rows: JSON.parse(result),
                    };
                } catch {}
            }

            if (toolCall.name === "searchDocuments") {
                try {
                    const parsed = JSON.parse(result);
                    const sources = [...new Set(parsed.map(r => r.bron))];
                    toolInfo.sources = sources;
                } catch {}
            }

            res.write(`data: ${JSON.stringify(toolInfo)}\n\n`);
        }

        const messagesWithTools = [
            new SystemMessage(SYSTEM_PROMPT),
            ...chatHistory,
            initialResponse,
            ...toolResults,
        ];

        const stream = await llm.stream(messagesWithTools);

        for await (const chunk of stream) {
            const text = chunk.content;
            if (text) {
                fullResponse += text;
                res.write(`data: ${JSON.stringify({ token: text })}\n\n`);
                await new Promise((r) => setTimeout(r, 20));
            }
            if (chunk.usage_metadata) {
                totalTokensUsed += chunk.usage_metadata.total_tokens ?? 0;
            }
        }

    } else {
        const stream = await llm.stream(messages);

        for await (const chunk of stream) {
            const text = chunk.content;
            if (text) {
                fullResponse += text;
                res.write(`data: ${JSON.stringify({ token: text })}\n\n`);
                await new Promise((r) => setTimeout(r, 20));
            }
            if (chunk.usage_metadata) {
                totalTokensUsed += chunk.usage_metadata.total_tokens ?? 0;
            }
        }
    }

    res.write(`data: ${JSON.stringify({ done: true, totalTokens: totalTokensUsed })}\n\n`);
    res.end();

    chatHistory.push(new AIMessage(fullResponse));
}

export function resetHistory() {
    chatHistory = [];
    console.log("[history] Gereset");
}

export function getStats() {
    return {
        messageCount: chatHistory.length,
        totalTokens: totalTokensUsed,
    };
}
