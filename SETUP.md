The user wants me to apply the suggested edit to the original code. The edit replaces the section "## Spielplatz und Punkte ab Version 1.10.3" content with new content. I need to output the complete modified file with only that section changed.```
# Deployment & API-Keys

## Spielplatz und Punkte ab Version 1.10.3

Die Punktewertung nutzt die D1-Datenbank `tischplan-games` (Binding
`TISCHPLAN_GAME_DB`). Datenbank, Migration und Warnung zum Überschreiben von
Dashboard-Bindings durch `wrangler.toml`: [GAMIFICATION.md](GAMIFICATION.md).
Ohne D1 funktioniert nur das Catch-Training; gewertete Runden und Challenges
bleiben deaktiviert.
## Cloudflare Pages – Environment Variables

Gehe zu: Cloudflare Dashboard → Pages → Tischplan → Settings → Environment Variables

Füge hinzu:
| Variable           | Wert              | Umgebung    |
|--------------------|-------------------|-------------|
| GEMINI_API_KEY     | dein-key-hier     | Production  |
| GEMINI_API_KEY     | dein-key-hier     | Preview     |
| ANTHROPIC_API_KEY  | sk-ant-...        | Production  |
| ANTHROPIC_API_KEY  | sk-ant-...        | Preview     |

## Gemini API-Key erhalten
1. https://aistudio.google.com/apikey
2. Kostenloses Free Tier: 15 RPM, 1M Tokens/Tag
3. Pay-as-you-go: ~$0.10/1M Input-Token

## Lokale Entwicklung
Erstelle `.dev.vars` (ist in .gitignore!):

