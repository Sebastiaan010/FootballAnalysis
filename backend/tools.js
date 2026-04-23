const BASE_URL = "https://api.football-data.org/v4";


async function footballFetch(endpoint) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
            "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY,
        },
    });

    // Rate limit check zoals de API aanbeveelt
    const remaining = response.headers.get("X-Requests-Available-Minute");
    if (remaining && parseInt(remaining) < 3) {
        console.warn(`[rate-limit] Nog maar ${remaining} requests beschikbaar deze minuut`);
    }

    if (!response.ok) {
        const err = await response.json();
        throw new Error(`API fout: ${err.message}`);
    }

    return response.json();
}

// Tool 1: Haal de stand op van een competitie
export async function getStandings(competitionCode) {
    const data = await footballFetch(`/competitions/${competitionCode}/standings`);
    const table = data.standings.find(s => s.type === "TOTAL")?.table ?? [];

    return table.slice(0, 10).map(entry => ({
        positie: entry.position,
        team: entry.team.name,
        gespeeld: entry.playedGames,
        gewonnen: entry.won,
        gelijk: entry.draw,
        verloren: entry.lost,
        doelpuntensaldo: entry.goalDifference,
        punten: entry.points,
    }));
}

// Tool 2: Haal recente wedstrijden op van een team
export async function getRecentMatches(teamId, limit = 5) {
    const data = await footballFetch(`/teams/${teamId}/matches?status=FINISHED&limit=${limit}`);
    const matches = data.matches ?? [];

    return matches.slice(-limit).map(m => ({
        datum: m.utcDate.split("T")[0],
        competitie: m.competition.name,
        thuis: m.homeTeam.name,
        uit: m.awayTeam.name,
        score: m.score.fullTime
            ? `${m.score.fullTime.home} - ${m.score.fullTime.away}`
            : "onbekend",
    }));
}

// Tool 3: Haal aankomende wedstrijden op van een team
export async function getUpcomingMatches(teamId, limit = 5) {
    const data = await footballFetch(`/teams/${teamId}/matches?status=SCHEDULED&limit=${limit}`);
    const matches = data.matches ?? [];

    return matches.slice(0, limit).map(m => ({
        datum: m.utcDate.split("T")[0],
        competitie: m.competition.name,
        thuis: m.homeTeam.name,
        uit: m.awayTeam.name,
    }));
}
