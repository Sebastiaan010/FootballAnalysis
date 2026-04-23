import "dotenv/config";
import { AzureChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getStandings, getRecentMatches, getUpcomingMatches, COMPETITIONS, TEAM_IDS } from "./tools.js";

const llm = new AzureChatOpenAI({
    temperature: 0.7,
    streaming: true,
});

const SYSTEM_PROMPT = `Je bent "De Analist" — een gepassioneerde voetbaltactiek-expert die praat als een slimme voetbalvriend die echt verstand van zaken heeft.

Je doelgroep zijn fanatieke voetbalfans (16-35 jaar) die al weten wat een 4-3-3 is, pressing begrijpen en houden van tactische diepgang. Leg nooit basisregels uit.

Je hebt toegang tot live voetbaldata via tools. Gebruik ze proactief:
- Vraagt iemand naar de stand? → gebruik getStandings
- Vraagt iemand hoe een team het heeft gedaan? → gebruik getRecentMatches
- Vraagt iemand naar aankomende wedstrijden? → gebruik getUpcomingMatches

Beschikbare competitiecodes: PL (Premier League), DED (Eredivisie), CL (Champions League), PD (La Liga), BL1 (Bundesliga), SA (Serie A), FL1 (Ligue 1)
Beschikbare team IDs: liverpool=64, manchester city=65, arsenal=57, chelsea=61, manchester united=66, ajax=678, psv=674, feyenoord=675, barcelona=81, real madrid=86, atletico madrid=78, bayern münchen=5, borussia dortmund=4

Jouw stijl:
- Enthousiast, direct en opinionated — jij hebt een mening en verdedigt die
- Combineer data met tactische analyse — cijfers alleen zijn saai
- Stel tegenvragen als je meer context nodig hebt
- Gebruik voetbaljargon: pressing lines, half-spaces, balbezit, counterpressing
- Korte alinea's, geen opsommingslijsten tenzij het echt helpt

Beperkingen:
- Geen blessure-diagnoses of medisch advies
- Geen wedtips of gokadvies
- Voor live scores: verwijs naar FlashScore of SofaScore`;

// Tool definities voor LangChain
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
        description: "Haal de actuele stand op van een voetbalcompetitie. Gebruik competitiecodes zoals PL, DED, CL, PD, BL1, SA, FL1.",
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
        description: "Haal recente gespeelde wedstrijden op van een team op basis van team ID.",
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
        description: "Haal aankomende geplande wedstrijden op van een team op basis van team ID.",
        schema: z.object({
            teamId: z.number().describe("Het team ID, bijv. 678 voor Ajax"),
            limit: z.number().optional().describe("Aantal wedstrijden, standaard 5"),
        }),
    }
);

const tools = [standingsTool, recentMatchesTool, upcomingMatchesTool];
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

    // Stap 1: vraag de AI of hij tools wil aanroepen
    const initialResponse = await llmWithTools.invoke(messages);

    // Stap 2: als de AI een tool wil aanroepen, voer die dan uit
    if (initialResponse.tool_calls && initialResponse.tool_calls.length > 0) {
        // Laat de frontend weten dat we data ophalen
        res.write(`data: ${JSON.stringify({ status: "Live data ophalen..." })}\n\n`);

        const toolResults = [];

        for (const toolCall of initialResponse.tool_calls) {
            console.log(`[tool] ${toolCall.name} aangeroepen met`, toolCall.args);

            let result;
            if (toolCall.name === "getStandings") result = await standingsTool.invoke(toolCall.args);
            else if (toolCall.name === "getRecentMatches") result = await recentMatchesTool.invoke(toolCall.args);
            else if (toolCall.name === "getUpcomingMatches") result = await upcomingMatchesTool.invoke(toolCall.args);

            toolResults.push(new ToolMessage({
                content: result,
                tool_call_id: toolCall.id,
            }));

            // Stuur tool naam naar frontend voor transparantie
            res.write(`data: ${JSON.stringify({ toolUsed: toolCall.name })}\n\n`);
        }

        // Stap 3: stuur de tool resultaten terug naar de AI voor het echte antwoord
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
        // Geen tool nodig — gewoon streamen
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
