const BASE_URL = "https://api.football-data.org/v4";

async function footballFetch(endpoint) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
            "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY,
        },
    });

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

// Tool 1: Haal de stand op van een competitie (seizoen 2024)
export async function getStandings(competitionCode) {
    const data = await footballFetch(`/competitions/${competitionCode}/standings?season=2025`);
    const table = data.standings.find(s => s.type === "TOTAL")?.table ?? [];

 return table.map(entry => ({
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

export const TEAM_IDS = {
    "liverpool": 64,
    "manchester city": 65,
    "arsenal": 57,
    "chelsea": 61,
    "manchester united": 66,
    "ajax": 678,
    "psv": 674,
    "feyenoord": 675,
    "barcelona": 81,
    "real madrid": 86,
    "atletico madrid": 78,
    "bayern münchen": 5,
    "borussia dortmund": 4,
};
