# Spielplatz – Version 1.10.3 (Kaiserschmarrn)

## Cloudflare-Einrichtung

Die vorhandenen Rezepte, Einstellungen und Kalorientage bleiben im KV-Namespace
`TISCHPLAN_STORAGE`. Für die Punktewertung ist zusätzlich eine **D1-Datenbank**
notwendig. KV bietet keine atomare Reservierung einer täglichen Spielrunde;
D1 erzwingt die Begrenzung auch bei parallelen Anfragen von mehreren Geräten.

1. Im Cloudflare-Dashboard eine D1-Datenbank `tischplan-games` anlegen.
2. Den Inhalt von `migrations/games/0001_gamification.sql` in deren SQL-Konsole
   ausführen (idempotent; vier Tabellen und ein Index).
3. Im Pages-Projekt eine D1-Bindung mit dem Namen **`TISCHPLAN_GAME_DB`** hinzufügen
   und auf diese Datenbank verweisen lassen. Auch für Preview eine getrennte
   Datenbank einrichten, damit Tests keine produktiven Tagesversuche verbrauchen.
4. Erneut deployen. `/api/games?profile=0` muss eine JSON-Antwort mit `leaderboard`
   liefern. Ohne Binding oder Migration zeigt die App eine verständliche Meldung;
   Training ist trotzdem verfügbar, gewertete Runden bleiben gesperrt.

Alternativ, mit bereits angemeldetem Wrangler und angelegter Datenbank:

```powershell terminal
npx wrangler d1 execute tischplan-games --remote --file=migrations/games/0001_gamification.sql
```

**Die Implementierung erstellt keine Cloudflare-Ressourcen und führt keine
Remote-Migration automatisch aus.** Die Bindung wird nicht ins Repository
festgeschrieben, weil die konkrete Datenbank-ID projektspezifisch ist.

## Lokales Testen

Node.js 22.13+ (hier getestet mit Node 24) ist für die SQL-Integrationstests
mit `node:sqlite` erforderlich. Keine zusätzliche SQLite-Abhängigkeit nötig.

```powershell terminal
npm test
npm run build
npx wrangler d1 execute tischplan-games --local --file=migrations/games/0001_gamification.sql
npx wrangler pages dev dist --kv=TISCHPLAN_STORAGE --d1=TISCHPLAN_GAME_DB=tischplan-games
```

Bei Bedarf die tatsächliche D1-Datenbank-ID statt `tischplan-games` für den
lokalen Binding-Wert verwenden. Alle lokalen Wrangler-Befehle müssen denselben
Persistenzpfad verwenden (standardmäßig `.wrangler/state`). `npm run dev` allein
stellt keine Pages Functions bereit; dort funktioniert nur das Training.

## Charaktere und Bedienung

Die drei vom Nutzer gelieferten Vorlagen liegen unverändert unter
`public/characters/1.png`, `2.jpg`, `3.png`. Sie wurden aus `dist/assets` kopiert,
bevor ein Build diese ursprünglichen Build-Dateien entfernt. Vite übernimmt sie
bei jedem Build automatisch nach `dist/characters`.

Unter **Kalorien → Spielplatz & Leaderboard → Charaktere & Challenge-Einstellungen**
je eine Vorlage als braune und weiße Figur zuordnen und speichern. Die Vorschau
vermeidet eine ungeprüfte Zuordnung der nicht farblich benannten Dateien. Die
Bilder werden proportional und ohne Umfärben oder Neuzeichnen dargestellt;
ein eventuell vorhandener Hintergrund bleibt Bestandteil der Originaldatei.

Catch: Ziehen auf Touch-Geräten, Maus oder Pfeiltasten/A/D. Zufällige Figur pro
Runde. Spielobjekte sind SVG-Symbole mit verschiedenen Farben und Formen.

- Apfel, Karotte, Brokkoli: +1 Punkt.
- Keks und Pizza: −1 Punkt.
- Kochbuch, Messer, Pfanne und Topf: Runde sofort beendet; bisheriger Score zählt.
- Rundenende spätestens nach 60 Sekunden; negative Scores sind möglich.
- Nur eine gestartete Tagesrunde pro Person und Spiel, auch wenn sie abgebrochen
  oder die Seite neu geladen wird. Abbruch/App-Wechsel: 0 Punkte. Danach Training.
- Ein fehlgeschlagenes Ergebnis-POST wird lokal zwischengespeichert und kann mit
  „Ergebnis senden“ wiederholt werden. Die Serverantwort ist maßgeblich;
  wiederholte POSTs buchen niemals zusätzliche Punkte.

## Challenges

Ein serverseitiger Losversuch beim Öffnen von Kalorien pro Person und Kalendertag:
**10 % Gesamtchance**, nicht 10 % pro Challenge. Maximal eine aktive Challenge.
Auch eine erfolglose Ziehung oder das Ablehnen einer Challenge verbraucht den
Losversuch. Ohne eingestellten Erhaltungsbedarf stehen nur die ersten beiden
Challenges zur Auswahl.

| Challenge | Bedingung | Zeitfenster | Punkte |
| --- | --- | --- | --- |
| 7 Tage keine Snacks | Normale Mahlzeiten erfassen, keine Einträge in „Snacks & Getränke“ | 7 aufeinanderfolgende Tage ab Start | 25 |
| Gemüse-Challenge | Gemüseportion mit mehr als 0 kcal erfassen | 5 aufeinanderfolgende Tage ab Start | 10 |
| 100 loss | Mindestens 100 kcal unter dem geschätzten Erhaltungsbedarf | 3 aufeinanderfolgende Tage innerhalb von 15 Tagen ab Start | 15 |

Alle gewerteten Tage müssen normale Mahlzeiteneinträge haben und explizit als
vollständig erfasst bestätigt sein. Leere oder unbestätigte Tage zählen nie.
Gemüse wird ausdrücklich am Eintrag markiert, nicht anhand unsicherer Namens-
oder KI-Heuristiken. Bei gemischten Gerichten den Gemüseanteil separat erfassen.
Änderungen an einem Tag heben dessen Vollständigkeitsbestätigung auf.

Nur bereits abgeschlossene Kalendertage werden ausgewertet. Deshalb gibt es
am letzten Challenge-Tag noch keinen Bonus; er erscheint beim nächsten Aufruf
nach Tagesende. Fehlende Tage werden bei dieser Auswertung als nicht geschafft
gewertet. Bereits abgeschlossene Challenges sind unveränderliche Ergebnisse.
Für „100 loss“ wird der am bestätigten Tag hinterlegte Erhaltungsbedarf benutzt,
nicht das Kalorienziel und nicht nochmals zusätzlich eingetragener Sport.
Mehr Defizit bringt keine zusätzlichen Punkte. Challenges sind freiwillig;
Mahlzeiten sollen nicht für Punkte ausgelassen werden.

## Leaderboard und Tagesgrenzen

Alle Nutzer verwenden **Europe/Berlin** als gemeinsame Tagesgrenze, inklusive
Sommerzeit. Auf dem Leaderboard werden Gesamtpunkte und aktueller Streak sowie
die Aufteilung in Tages-, Spiel- und Challenge-Punkte angezeigt. Sortierung:
Gesamtpunkte, dann aktueller Streak, bei vollständigem Gleichstand Profilnummer.

- Erster Mahlzeiteneintrag am selben Tag: einmalig 5 Punkte.
- Rückwirkender Eintrag: einmalig 1 Punkt.
- Altdaten ohne verlässliches Erfassungsdatum: einmalig 1 Punkt pro aktivem Tag.
- Wasser allein und zukünftige Tage geben keine Punkte.
- Bereits verbuchte Tagespunkte bleiben bei Korrekturen/Löschungen erhalten.
  Löschen und erneutes Eintragen erzeugt keine zweite Prämie.

Die erste Erfassung wird beim Speichern serverseitig datiert. Punkte werden beim
Aufruf der Punkte-API aus den synchronisierten KV-Logs abgeglichen. Offline-
Änderungen und noch nicht im KV sichtbare Änderungen erscheinen daher erst nach
Synchronisation bzw. erneutem Aktualisieren im Leaderboard. Ein offline erfasster
Tag, der erst am Folgetag beim Server ankommt, zählt konservativ als Nachtrag.

## Grenzen / Sicherheit

Die API schützt Tagesreservierung und Doppelbuchungen durch SQL-Constraints und
Transaktionen. Der Server berechnet den Spielscore selbst aus Seed und Eingaben;
ein vom Client übermittelter `score` wird nicht akzeptiert. Das ist jedoch kein
umfassender Bot- oder Manipulationsschutz.

Wie die übrige private Zwei-Personen-App verwendet sie Profilindizes, keine echte
Authentifizierung. Ein Profil-PIN ist nur eine UI-Sperre. Für öffentliche Nutzung
zuerst das gesamte Pages-Projekt mit Cloudflare Access oder echter Authentifizierung
absichern. CORS ist kein Ersatz dafür. Die bestehenden KV-Kalorienlogs bleiben
geteilte JSON-Dokumente ohne transaktionales Editieren; D1 schützt das Punktesystem,
nicht konkurrierende Bearbeitungen der bisherigen Tracker-Daten.
