# De Analist ⚽

Een tactische voetbatchatbot voor fanatieke voetbalfans. De Analist combineert live voetbaldata met tactische kennisdocumenten om op hoog niveau te discussiëren over pressing, formaties en coaches.

**Gebouwd met:** Node.js · Express · LangChain · Vite · React

---

## Installatie en opstarten

### Vereisten
- Node.js v18 of hoger
- Een Azure OpenAI account met:
  - Een chat deployment (bijv. `gpt-4.1-mini`)
  - Een embeddings deployment (bijv. `text-embedding-3-small`)
- Een gratis API key van [football-data.org](https://www.football-data.org)

---

### Stap 1 — Backend instellen

```bash
cd backend
npm install --legacy-peer-deps
```

Maak een `.env` bestand aan in de `backend` map:

```
AZURE_OPENAI_API_VERSION=2025-03-01-preview
AZURE_OPENAI_API_INSTANCE_NAME=jouw_instantie_naam
AZURE_OPENAI_API_KEY=jouw_api_key
AZURE_OPENAI_API_DEPLOYMENT_NAME=gpt-4.1-mini
AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME=text-embedding-3-small
FOOTBALL_DATA_API_KEY=jouw_football_data_key
```

---

### Stap 2 — Vectorstore aanmaken

Dit hoef je maar één keer te doen. Dit commando laadt de tactische documenten in, splitst ze in chunks, en slaat ze op als vectordatabase:

```bash
cd backend
npm run create
```

Je ziet in de terminal:
```
coaches.txt → 19 chunks
formations.txt → 15 chunks
pressing.txt → 13 chunks
Totaal: 47 chunks
✅ Vectorstore opgeslagen in /vectorstore
```

---

### Stap 3 — Backend starten

```bash
cd backend
npm run dev
```

Backend draait op `http://localhost:3000`

---

### Stap 4 — Frontend starten

Open een tweede terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend draait op `http://localhost:5173`

De Vite proxy stuurt `/api` requests automatisch door naar de backend — je hoeft niets extra in te stellen.

## Functionaliteit

### Taalmodel
- Streaming responses via Server-Sent Events
- Chat history — de chatbot onthoudt de volledige gesprekscontext
- Token usage bijgehouden en zichtbaar in de UI
- Markdown rendering
- System prompt die tone of voice en gedrag definieert

### Agent
- **getStandings** — actuele stand van een competitie (PL, DED, CL, PD, BL1, SA, FL1)
- **getRecentMatches** — recente wedstrijden van een team
- **getUpcomingMatches** — aankomende wedstrijden van een team
- **searchDocuments** — zoeken in tactische kennisdocumenten via FAISS vectordatabase
- De agent beslist zelf welke tool hij gebruikt op basis van de vraag
- Gebruikte tools en documentbronnen zijn zichtbaar in de UI

---

## API Endpoints

| Methode | Endpoint | Beschrijving |
|--------|----------|--------------|
| POST | `/api/chat` | Stuur een bericht naar de agent |
| POST | `/api/reset` | Wis de chat history |
| GET | `/api/stats` | Bekijk token usage en berichtentelling |
