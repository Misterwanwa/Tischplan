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
| OPENROUTER_API_KEY | sk-or-v1-...      | Production  |
| OPENROUTER_API_KEY | sk-or-v1-...      | Preview     |
| OPENROUTER_MODEL   | (optional) z. B. google/gemini-3.5-flash-lite | beide |

## KI-Anbieter wechseln
In der App unter **Einstellungen → KI-Modell** zwischen *Google Gemini* und *OpenRouter* umschalten.
Bei OpenRouter kann jede Modell-ID von https://openrouter.ai/models eingetragen werden
(Default: `google/gemini-3.5-flash-lite`). Der API-Key bleibt immer serverseitig.

## OpenRouter API-Key erhalten
1. https://openrouter.ai/keys
2. Guthaben aufladen (Abrechnung pro Token, je nach Modell); Websuche kostet extra.

## Gemini API-Key erhalten
1. https://aistudio.google.com/apikey
2. Kostenloses Free Tier: 15 RPM, 1M Tokens/Tag
3. Pay-as-you-go: ~$0.10/1M Input-Token

## Lokale Entwicklung
Erstelle `.dev.vars` (ist in .gitignore!):

