# Produkt-Piktogramme (1:1 Zuordnung)

Die generierten Vektor-Piktogramme liegen in diesem Ordner. `manifest.json` ordnet die
geprüften Dateien ihren Produkt-IDs zu. Die Anwendung verwendet diese SVGs automatisch
vor den eingebauten Symbolen. Individuell eingestellte Bilder haben weiterhin Vorrang.
Die weissen Dateien werden als Farbmaske angezeigt und übernehmen dadurch die
jeweilige Textfarbe, auch auf hellen Hintergründen.

## Namenskonvention
Die Dateien müssen exakt nach der Produkt-ID benannt sein:
- Dateiname: `<produkt-id>.svg` (oder `.png`)
- Beispiele:
  - `hafermilch.svg`
  - `fotos.svg`
  - `luftentfeuchter.svg`
  - `urmeersalz.svg`
  - `rosenkohl.svg`

## Wie findet man die Produkt-ID?
- Die Produkt-ID entspricht in der Regel dem klein geschriebenen Namen ohne Sonderzeichen (z. B. `hafermilch`, `apfel`, `oliven`).
- Die vollständige Liste aller IDs findest du in `public/products.csv` in der ersten Spalte.

## Stil-Richtlinien (Bring!-Look)
- **Farbe**: Weiß (`#FFFFFF`) auf transparentem Hintergrund.
- **Linienstärke**: ~2 bis 3 Pixel (Hand-drawn chalk doodle).
- **Format**: Quadratisch (z. B. 48x48 bis 512x512 Pixel).
- **Fallback**: Solange keine Datei für ein Produkt existiert, rendert die App automatisch den Bring!-typischen handgezeichneten Kreide-Anfangsbuchstaben!

## Neunergruppen erzeugen und importieren

```sh
python -m pip install -r scripts/requirements-icons.txt
python scripts/product_icons.py status
python scripts/product_icons.py next --output /tmp/product-batch.json
```

Den `prompt` aus der Stapeldatei mit der Bildgenerierung ausführen, dabei echte
Transparenz einschalten. Der gespeicherte Stil entspricht dem Chat „Tischplan - Symbole“:
minimalistische weisse, handgezeichnete Konturen ohne Text, Schatten oder Farbflächen.
Die Motive stehen von links nach rechts und oben nach unten in der Reihenfolge der
Stapeldatei. Bei der letzten Gruppe bleiben unbenutzte Rasterfelder leer.

Das Bild auf dunklem Hintergrund visuell auf Motive, Reihenfolge und Stil prüfen.
Erst danach importieren:

```sh
python scripts/product_icons.py import /path/to/sheet.png --batch /tmp/product-batch.json --reviewed
python -m unittest discover -s test -p '*_test.py'
npm test
npm run build
```

Der Import erkennt freie Rastergassen nahe den Drittelgrenzen, schneidet neun Motive
verlustfrei auseinander, normalisiert die Grössen auf 512 × 512 und vektorisiert die
sichtbaren weissen Striche mit VTracer. Die SVGs bestehen aus echten Pfaden ohne
eingebettete Rasterbilder. Das Originalraster und der Stapelauftrag werden unter
`scripts/pictogram_batches/` aufbewahrt. Das Manifest dokumentiert den Quellbild-Hash.
Vorhandene Dateien werden nicht überschrieben. Ein fehlerhaftes Raster wird vor
dem Schreiben des gesamten Stapels abgelehnt. Die Sichtprüfung bleibt erforderlich,
da geometrische Prüfungen keine semantische Zuordnung gewährleisten können.

Die Bildgenerierung erfolgt in ChatGPT, nicht durch das Python-Skript. Das Skript
benötigt keinen Bildgenerierungs-Schlüssel und löst keine kostenpflichtigen Aufrufe aus.
Ein täglicher ChatGPT-Auftrag kann jeweils die nächste fehlende Neunergruppe erzeugen,
prüfen, importieren und auf denselben GitHub-Arbeitszweig übertragen. Solange dieser
Zweig noch nicht zusammengeführt ist, dient er als Fortschrittsstand. Nach der
Zusammenführung wird vom aktuellen Hauptzweig fortgesetzt.
