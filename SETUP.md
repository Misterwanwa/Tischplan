# Deployment & API-Keys

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
```env
GEMINI_API_KEY=dein-key
ANTHROPIC_API_KEY=sk-ant-...
```

Starte dann mit: `npx wrangler pages dev --compatibility-date=2024-01-01`
