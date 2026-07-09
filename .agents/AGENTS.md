# Agent Rules for Tischplan Project

## Versionssystematik und Codenamen
Für dieses Projekt gilt eine feste Systematik für Programmversionen und Codenamen. Jedes Sprachmodell / jeder Agent muss diese Systematik zwingend einhalten und darf keine anderen Versionen oder Codenamen erfinden.

Es gilt eine Systematik für Programmversionen, die ähnlich wie Android auf alphabetisch aufsteigende Speisebezeichnungen setzt. Jedes minor Update, also jede Stelle nach dem ersten Punkt,
bekommt einen neuen Codenamen. Hier sind die bisherigen und die nächsten potenziellen Codenamen:

Es gibt aktuell folgende Versionen und Codenamen:
- **1.0.x**: Apfelkuchen
- **1.1.x**: Brokkoliauflauf
- **1.2.x**: Cacio e Pepe
- **1.3.x**: Dampfnudel (Aktueller Stand ist v1.3.3)

Wird nur ein Patch gemacht und keine neue Funktion hinzugefügt, so muss die Version um eins hochgezählt werden, aber der Codename bleibt gleich. Dabei wird an der Stelle hinter dem zweiten Punkt hochgezählt, die in den obengenannten Beispielen mit einem x als Platzhalter steht.

Jeder Prompt, der Versionen anzeigt, ändert oder hochzählt, muss sich an diese Struktur halten. 

Ist unklar, wie hochzuzählen ist oder wie die nächste Version heißen soll, so muss im Zweifel immer der Nutzer mit der askUser Methode gefragt werden.

Die Versionsnummer befindet sich in der main.py in der Variable "VERSION". 

# Dateistruktur und Namenskonvention

Es herrscht eine strikte Trennung zwischen **Kerncode** (Python) und **Konfigurationsdaten** (JSON). Diese Trennung muss IMMER beachtet werden.

**Dateien im Wurzelverzeichnis:**
- `main.py`: Die ausführbare Hauptanwendung.
- `config_schema.json`: Das Schema zur Validierung der `data.json`.

**Datendateien (JSON):**
Alle Daten müssen zwingend in `data.json` gespeichert werden.
- `data.json`: Speichert die Listen aller Personen, Tische und Einheiten.
  - **Verzeichnis**: Muss sich IMMER im Wurzelverzeichnis (`/`) befinden.

**Wichtige Regeln:**
- Änderungen an der Logik dürfen **NUR in `.py`** Dateien erfolgen.
- Daten dürfen **NUR in `.json`** Dateien geändert werden.
- `data.json` ist eine reine Datenspeicherung, sie darf **KEINE Python-spezifischen Artefakte** (wie Klassenattribute oder Funktionsaufrufe) enthalten.
