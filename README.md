# Tischplan 🍽️

2-Personen Speiseplaner mit KI-gestützter Rezeptsuche, Nährwerttracking und digitalem Kochbuch.

## Installation

```bash
npm install
npm run dev
```

Öffnet automatisch `http://localhost:5173`

## Build

```bash
npm run build
```

Artefakte landen in `dist/`

## Features

- 📅 Kalender-basierter Speiseplan (Frühstück, Mittag, Abend)
- 🤖 KI-Websuche + Google-Link-Extraktion
- 🔖 Firefox-Favoriten-Import
- 📊 Nährwert-Tracking pro Tag & Woche
- 👥 2-Personen-Profile mit individuellen Zielen
- 📚 Digitales Kochbuch mit Bänden & Bewertungen
- 🛒 Automatische Einkaufslisten
- 🧬 Wochenplaner mit Nährwert-Ausgleich

## Hinweise

- Daten werden lokal im Browser gespeichert (IndexedDB/window.storage)
- API-Calls an Claude (claude-sonnet-4-6) benötigen Anthropic API Key
- Firefox-Bookmarks-Export: Firefox → Bibliothek → Exportieren als HTML
