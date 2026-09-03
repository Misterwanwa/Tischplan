// foodDatabase.js – Open Food Facts API & Integrierte Nährwert-Referenzdatenbank

/**
 * Ruft Produkt- und Nährwertdaten per Barcode aus der Open Food Facts API ab.
 * Open Food Facts ist weltweit kostenlos, Open-Source und erfordert keinen API-Key.
 */
export async function fetchProductByBarcode(barcode) {
  const cleanCode = String(barcode || '').trim().replace(/[^0-9]/g, '');
  if (!cleanCode) throw new Error('Ungültiger Barcode');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const url = `https://world.openfoodfacts.org/api/v0/product/${cleanCode}.json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TischplanApp/1.9 (kevin@local)' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Open Food Facts antwortete mit Status ${res.status}`);
    }

    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      throw new Error('Produkt nicht in der Datenbank gefunden.');
    }

    const p = data.product;
    const nutriments = p.nutriments || {};

    // Kalorien ermitteln (kcal bevorzugt, sonst kJ umrechnen)
    let kcal = nutriments['energy-kcal_100g'];
    if (kcal === undefined || kcal === null) {
      const kj = nutriments['energy_100g'];
      if (kj) kcal = Math.round(Number(kj) / 4.184);
    }
    kcal = kcal ? Math.round(Number(kcal)) : 0;

    const protein = roundOne(nutriments['proteins_100g'] ?? 0);
    const carbs = roundOne(nutriments['carbohydrates_100g'] ?? 0);
    const fat = roundOne(nutriments['fat_100g'] ?? 0);

    const name = p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || 'Produkt #' + cleanCode;
    const brand = p.brands ? p.brands.split(',')[0].trim() : '';
    const serving = p.serving_size || '100g';

    return {
      barcode: cleanCode,
      name: brand ? `${brand} ${name}` : name,
      brand,
      serving,
      per100g: { kcal, protein, carbs, fat },
      imageUrl: p.image_front_small_url || p.image_url || null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Zeitüberschreitung bei der Abfrage von Open Food Facts.');
    }
    throw err;
  }
}

function roundOne(n) {
  const num = Number(n);
  return isNaN(num) ? 0 : Math.round(num * 10) / 10;
}

/**
 * Berechnet Nährwerte basierend auf 100g-Referenzwerten und einer Mengenangabe in Gramm.
 */
export function calculatePortion(per100g, grams) {
  const factor = (Number(grams) || 0) / 100;
  return {
    kcal: Math.round((per100g.kcal || 0) * factor),
    protein: roundOne((per100g.protein || 0) * factor),
    carbs: roundOne((per100g.carbs || 0) * factor),
    fat: roundOne((per100g.fat || 0) * factor),
  };
}

/**
 * Kuratierte Offline-Lebensmittel-Referenzdatenbank für blitzschnelle Autovervollständigung
 * und Eingabe ohne Internet.
 */
export const BUILTIN_FOODS = [
  { id: 'haferflocken', name: 'Haferflocken', defaultGrams: 50, per100g: { kcal: 370, protein: 13.5, carbs: 58.7, fat: 7.0 } },
  { id: 'banane', name: 'Banane', defaultGrams: 120, per100g: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3 } },
  { id: 'apfel', name: 'Apfel', defaultGrams: 150, per100g: { kcal: 52, protein: 0.3, carbs: 14.0, fat: 0.2 } },
  { id: 'magerquark', name: 'Magerquark', defaultGrams: 250, per100g: { kcal: 68, protein: 12.0, carbs: 4.0, fat: 0.2 } },
  { id: 'haehnchenbrust', name: 'Hähnchenbrustfilet (roh)', defaultGrams: 200, per100g: { kcal: 110, protein: 23.0, carbs: 0.0, fat: 1.5 } },
  { id: 'haehnchenbrust_gebraten', name: 'Hähnchenbrust gebraten', defaultGrams: 150, per100g: { kcal: 165, protein: 31.0, carbs: 0.0, fat: 3.6 } },
  { id: 'ei_gekocht', name: 'Hühnerei (Größe M)', defaultGrams: 55, per100g: { kcal: 155, protein: 13.0, carbs: 1.1, fat: 11.0 } },
  { id: 'spiegelei', name: 'Spiegelei (in Butter/Öl)', defaultGrams: 60, per100g: { kcal: 196, protein: 13.5, carbs: 0.8, fat: 15.0 } },
  { id: 'reis_gekocht', name: 'Reis gekocht (Basmati / Jasmin)', defaultGrams: 180, per100g: { kcal: 130, protein: 2.7, carbs: 28.0, fat: 0.3 } },
  { id: 'nudeln_gekocht', name: 'Nudeln / Pasta gekocht', defaultGrams: 200, per100g: { kcal: 158, protein: 5.8, carbs: 30.9, fat: 0.9 } },
  { id: 'kartoffeln_gekocht', name: 'Kartoffeln gekocht / Salzkartoffeln', defaultGrams: 200, per100g: { kcal: 77, protein: 2.0, carbs: 17.0, fat: 0.1 } },
  { id: 'vollkornbrot', name: 'Vollkornbrot (1 Scheibe ca. 50g)', defaultGrams: 50, per100g: { kcal: 210, protein: 7.5, carbs: 39.0, fat: 1.5 } },
  { id: 'toast_weiss', name: 'Toastbrot (1 Scheibe ca. 30g)', defaultGrams: 30, per100g: { kcal: 265, protein: 8.0, carbs: 49.0, fat: 3.2 } },
  { id: 'butter', name: 'Butter', defaultGrams: 15, per100g: { kcal: 717, protein: 0.9, carbs: 0.7, fat: 81.0 } },
  { id: 'olivenoel', name: 'Olivenöl (1 EL ca. 10g)', defaultGrams: 10, per100g: { kcal: 884, protein: 0.0, carbs: 0.0, fat: 100.0 } },
  { id: 'milch_15', name: 'Milch 1,5% Fett', defaultGrams: 200, per100g: { kcal: 47, protein: 3.4, carbs: 4.8, fat: 1.5 } },
  { id: 'milch_35', name: 'Vollmilch 3,5% Fett', defaultGrams: 200, per100g: { kcal: 64, protein: 3.3, carbs: 4.8, fat: 3.5 } },
  { id: 'hafermilch', name: 'Hafermilch / Haferdrink', defaultGrams: 200, per100g: { kcal: 45, protein: 0.8, carbs: 6.5, fat: 1.5 } },
  { id: 'mandeln', name: 'Mandeln', defaultGrams: 30, per100g: { kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9 } },
  { id: 'walnuesse', name: 'Walnüsse', defaultGrams: 30, per100g: { kcal: 654, protein: 15.2, carbs: 13.7, fat: 65.2 } },
  { id: 'lachs', name: 'Lachsfilet gebraten / gedünstet', defaultGrams: 150, per100g: { kcal: 208, protein: 20.4, carbs: 0.0, fat: 13.4 } },
  { id: 'thunfisch_dose', name: 'Thunfisch im eigenen Saft', defaultGrams: 150, per100g: { kcal: 116, protein: 26.0, carbs: 0.0, fat: 1.0 } },
  { id: 'rinderhack', name: 'Rinderhackfleisch', defaultGrams: 150, per100g: { kcal: 250, protein: 19.0, carbs: 0.0, fat: 19.0 } },
  { id: 'griechischer_joghurt', name: 'Griechischer Joghurt (10%)', defaultGrams: 150, per100g: { kcal: 125, protein: 9.0, carbs: 4.0, fat: 10.0 } },
  { id: 'naturjoghurt', name: 'Naturjoghurt 1,5%', defaultGrams: 150, per100g: { kcal: 50, protein: 4.3, carbs: 5.6, fat: 1.5 } },
  { id: 'avocado', name: 'Avocado', defaultGrams: 100, per100g: { kcal: 160, protein: 2.0, carbs: 8.5, fat: 14.7 } },
  { id: 'gouda', name: 'Gouda jung / mittelalt', defaultGrams: 30, per100g: { kcal: 356, protein: 25.0, carbs: 0.0, fat: 27.0 } },
  { id: 'feta', name: 'Feta Schafskäse', defaultGrams: 50, per100g: { kcal: 264, protein: 14.2, carbs: 4.1, fat: 21.3 } },
  { id: 'mozzarella', name: 'Mozzarella (1 Kugel ca. 125g)', defaultGrams: 125, per100g: { kcal: 280, protein: 28.0, carbs: 3.1, fat: 17.0 } },
  { id: 'brokkoli', name: 'Brokkoli', defaultGrams: 150, per100g: { kcal: 34, protein: 2.8, carbs: 7.0, fat: 0.4 } },
  { id: 'tomaten', name: 'Tomaten', defaultGrams: 100, per100g: { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 } },
  { id: 'gurke', name: 'Gurke / Salatgurke', defaultGrams: 150, per100g: { kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1 } },
  { id: 'paprika', name: 'Paprika (rot / gelb)', defaultGrams: 100, per100g: { kcal: 31, protein: 1.0, carbs: 6.0, fat: 0.3 } },
  { id: 'spinat', name: 'Blattspinat frisch / TK', defaultGrams: 150, per100g: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 } },
  { id: 'erdbeeren', name: 'Erdbeeren frisch', defaultGrams: 150, per100g: { kcal: 32, protein: 0.7, carbs: 7.7, fat: 0.3 } },
  { id: 'heidelbeeren', name: 'Blaubeeren / Heidelbeeren', defaultGrams: 100, per100g: { kcal: 57, protein: 0.7, carbs: 14.5, fat: 0.3 } },
  { id: 'schokolade_zartbitter', name: 'Zartbitterschokolade 70%', defaultGrams: 25, per100g: { kcal: 598, protein: 7.8, carbs: 45.9, fat: 42.6 } },
  { id: 'erdnussbutter', name: 'Erdnussbutter (100% Erdnuss)', defaultGrams: 20, per100g: { kcal: 588, protein: 25.0, carbs: 20.0, fat: 50.0 } },
  { id: 'whey_protein', name: 'Proteinpulver / Whey (1 Scoop ca. 30g)', defaultGrams: 30, per100g: { kcal: 380, protein: 75.0, carbs: 6.0, fat: 5.0 } },
  { id: 'honig', name: 'Bienenhonig (1 TL ca. 10g)', defaultGrams: 10, per100g: { kcal: 304, protein: 0.3, carbs: 82.4, fat: 0.0 } },
  { id: 'pizza_margherita', name: 'Pizza Margherita (ganz ca. 350g)', defaultGrams: 350, per100g: { kcal: 240, protein: 9.5, carbs: 32.0, fat: 8.0 } },
  { id: 'doener_kebap', name: 'Döner Kebab (1 Stück ca. 400g)', defaultGrams: 400, per100g: { kcal: 185, protein: 12.0, carbs: 18.0, fat: 7.5 } },
  { id: 'currywurst', name: 'Currywurst mit Sauce (ca. 200g)', defaultGrams: 200, per100g: { kcal: 260, protein: 12.0, carbs: 14.0, fat: 17.0 } },
  { id: 'pommes', name: 'Pommes Frites gebacken', defaultGrams: 150, per100g: { kcal: 290, protein: 3.5, carbs: 41.0, fat: 12.0 } },
  { id: 'cola', name: 'Cola / Softdrink mit Zucker', defaultGrams: 330, per100g: { kcal: 42, protein: 0.0, carbs: 10.6, fat: 0.0 } },
  { id: 'bier', name: 'Bier / Pils (0,5 l ca. 500g)', defaultGrams: 500, per100g: { kcal: 43, protein: 0.5, carbs: 3.1, fat: 0.0 } },
  { id: 'kaffee_schwarz', name: 'Kaffee schwarz / Espresso', defaultGrams: 150, per100g: { kcal: 2, protein: 0.1, carbs: 0.0, fat: 0.0 } },
  { id: 'cappuccino', name: 'Cappuccino mit Milchschaum', defaultGrams: 200, per100g: { kcal: 45, protein: 2.5, carbs: 3.8, fat: 2.2 } },
];

/**
 * Durchsucht die integrierten Lebensmittel nach Suchbegriff.
 */
export function searchBuiltinFoods(query) {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  return BUILTIN_FOODS.filter(item => item.name.toLowerCase().includes(q)).slice(0, 10);
}
