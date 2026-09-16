# Produkt-Piktogramme (1:1 Zuordnung)

Lege in diesem Ordner individuelle Vektor-Piktogramme (SVG) oder Bilder (PNG/WebP) für deine Produkte ab.

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
