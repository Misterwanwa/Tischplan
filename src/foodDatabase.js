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

function normalizeStr(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

/**
 * Kuratierte Offline-Lebensmittel-Referenzdatenbank für blitzschnelle Autovervollständigung,
 * Nährwertberechnung und Einkaufslisten-Zuordnung.
 */
export const BUILTIN_FOODS = [
  // --- OBST ---
  { id: 'apfel', name: 'Apfel / Äpfel', defaultGrams: 150, per100g: { kcal: 52, protein: 0.3, carbs: 14.0, fat: 0.2 }, keywords: ['apfel', 'aepfel', 'elstar', 'gala', 'braeburn'] },
  { id: 'banane', name: 'Banane / Bananen', defaultGrams: 120, per100g: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3 }, keywords: ['banane', 'bananen'] },
  { id: 'birne', name: 'Birne / Birnen', defaultGrams: 150, per100g: { kcal: 57, protein: 0.4, carbs: 12.4, fat: 0.1 }, keywords: ['birne', 'birnen', 'williams'] },
  { id: 'erdbeeren', name: 'Erdbeeren', defaultGrams: 150, per100g: { kcal: 32, protein: 0.7, carbs: 7.7, fat: 0.3 }, keywords: ['erdbeere', 'erdbeeren'] },
  { id: 'himbeeren', name: 'Himbeeren', defaultGrams: 125, per100g: { kcal: 52, protein: 1.2, carbs: 11.9, fat: 0.7 }, keywords: ['himbeere', 'himbeeren'] },
  { id: 'heidelbeeren', name: 'Blaubeeren / Heidelbeeren', defaultGrams: 125, per100g: { kcal: 57, protein: 0.7, carbs: 14.5, fat: 0.3 }, keywords: ['heidelbeeren', 'blaubeeren'] },
  { id: 'brombeeren', name: 'Brombeeren', defaultGrams: 125, per100g: { kcal: 43, protein: 1.4, carbs: 9.6, fat: 0.5 }, keywords: ['brombeere', 'brombeeren'] },
  { id: 'kirschen', name: 'Kirschen / Süßkirschen', defaultGrams: 150, per100g: { kcal: 63, protein: 1.1, carbs: 13.3, fat: 0.2 }, keywords: ['kirsche', 'kirschen', 'sauerkirschen'] },
  { id: 'orangen', name: 'Orangen / Apfelsinen', defaultGrams: 180, per100g: { kcal: 47, protein: 0.9, carbs: 9.4, fat: 0.1 }, keywords: ['orange', 'orangen', 'apfelsine', 'blutorange'] },
  { id: 'mandarinen', name: 'Mandarinen / Clementinen', defaultGrams: 80, per100g: { kcal: 53, protein: 0.8, carbs: 13.3, fat: 0.3 }, keywords: ['mandarine', 'mandarinen', 'clementine', 'clementinen'] },
  { id: 'zitronen', name: 'Zitronen', defaultGrams: 60, per100g: { kcal: 29, protein: 1.1, carbs: 9.3, fat: 0.3 }, keywords: ['zitrone', 'zitronen', 'zitronensaft'] },
  { id: 'limetten', name: 'Limetten', defaultGrams: 50, per100g: { kcal: 30, protein: 0.7, carbs: 10.5, fat: 0.2 }, keywords: ['limette', 'limetten'] },
  { id: 'weintrauben', name: 'Weintrauben / Trauben', defaultGrams: 150, per100g: { kcal: 69, protein: 0.7, carbs: 15.7, fat: 0.2 }, keywords: ['trauben', 'weintrauben'] },
  { id: 'kiwi', name: 'Kiwi', defaultGrams: 80, per100g: { kcal: 61, protein: 1.1, carbs: 14.7, fat: 0.5 }, keywords: ['kiwi', 'kiwis'] },
  { id: 'wassermelone', name: 'Wassermelone', defaultGrams: 300, per100g: { kcal: 30, protein: 0.6, carbs: 7.6, fat: 0.2 }, keywords: ['melone', 'wassermelone'] },
  { id: 'honigmelone', name: 'Honigmelone / Galia', defaultGrams: 200, per100g: { kcal: 36, protein: 0.5, carbs: 8.1, fat: 0.1 }, keywords: ['honigmelone', 'galiamelone', 'cantaloupe'] },
  { id: 'pfirsich', name: 'Pfirsich / Nektarine', defaultGrams: 140, per100g: { kcal: 39, protein: 0.9, carbs: 9.5, fat: 0.3 }, keywords: ['pfirsich', 'pfirsiche', 'nektarine', 'nektarinen'] },
  { id: 'mango', name: 'Mango', defaultGrams: 200, per100g: { kcal: 60, protein: 0.8, carbs: 15.0, fat: 0.4 }, keywords: ['mango'] },
  { id: 'ananas', name: 'Ananas frisch', defaultGrams: 150, per100g: { kcal: 50, protein: 0.5, carbs: 13.1, fat: 0.1 }, keywords: ['ananas'] },
  { id: 'avocado', name: 'Avocado', defaultGrams: 100, per100g: { kcal: 160, protein: 2.0, carbs: 8.5, fat: 14.7 }, keywords: ['avocado', 'avocados'] },
  { id: 'pflaumen', name: 'Pflaumen / Zwetschgen', defaultGrams: 100, per100g: { kcal: 46, protein: 0.7, carbs: 11.4, fat: 0.3 }, keywords: ['pflaume', 'pflaumen', 'zwetschge', 'zwetschgen'] },

  // --- GEMÜSE & SALAT ---
  { id: 'tomaten', name: 'Tomaten / Rispentomaten', defaultGrams: 120, per100g: { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 }, keywords: ['tomate', 'tomaten', 'cherrytomaten', 'strauchtomaten'] },
  { id: 'gurke', name: 'Gurke / Salatgurke', defaultGrams: 150, per100g: { kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1 }, keywords: ['gurke', 'gurken', 'salatgurke'] },
  { id: 'paprika', name: 'Paprika (rot / gelb / grün)', defaultGrams: 120, per100g: { kcal: 31, protein: 1.0, carbs: 6.0, fat: 0.3 }, keywords: ['paprika', 'spitzpaprika', 'gemuesepaprika'] },
  { id: 'karotten', name: 'Karotten / Möhren', defaultGrams: 100, per100g: { kcal: 41, protein: 0.9, carbs: 9.6, fat: 0.2 }, keywords: ['karotte', 'karotten', 'moehre', 'moehren', 'ruebli'] },
  { id: 'zwiebeln', name: 'Zwiebeln (gelb / rot)', defaultGrams: 80, per100g: { kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1 }, keywords: ['zwiebel', 'zwiebeln', 'schalotten'] },
  { id: 'knoblauch', name: 'Knoblauchzehe', defaultGrams: 5, per100g: { kcal: 149, protein: 6.4, carbs: 33.1, fat: 0.5 }, keywords: ['knoblauch', 'knoblauchzehe'] },
  { id: 'kartoffeln_gekocht', name: 'Kartoffeln gekocht / Salzkartoffeln', defaultGrams: 200, per100g: { kcal: 77, protein: 2.0, carbs: 17.0, fat: 0.1 }, keywords: ['kartoffel', 'kartoffeln', 'speisekartoffeln'] },
  { id: 'suesskartoffel', name: 'Süßkartoffel', defaultGrams: 200, per100g: { kcal: 86, protein: 1.6, carbs: 20.1, fat: 0.1 }, keywords: ['suesskartoffel', 'suesskartoffeln'] },
  { id: 'zucchini', name: 'Zucchini', defaultGrams: 150, per100g: { kcal: 17, protein: 1.2, carbs: 3.1, fat: 0.3 }, keywords: ['zucchini'] },
  { id: 'aubergine', name: 'Aubergine', defaultGrams: 150, per100g: { kcal: 25, protein: 1.0, carbs: 5.9, fat: 0.2 }, keywords: ['aubergine', 'auberginen'] },
  { id: 'champignons', name: 'Champignons / Pilze frisch', defaultGrams: 150, per100g: { kcal: 22, protein: 3.1, carbs: 3.3, fat: 0.3 }, keywords: ['champignon', 'champignons', 'pilze', 'steinpilze'] },
  { id: 'brokkoli', name: 'Brokkoli frisch / gedämpft', defaultGrams: 150, per100g: { kcal: 34, protein: 2.8, carbs: 7.0, fat: 0.4 }, keywords: ['brokkoli', 'broccoli'] },
  { id: 'blumenkohl', name: 'Blumenkohl', defaultGrams: 150, per100g: { kcal: 25, protein: 1.9, carbs: 5.0, fat: 0.3 }, keywords: ['blumenkohl', 'karfiol'] },
  { id: 'spinat', name: 'Blattspinat frisch / TK', defaultGrams: 150, per100g: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 }, keywords: ['spinat', 'blattspinat', 'rahmspinat'] },
  { id: 'kohlrabi', name: 'Kohlrabi', defaultGrams: 150, per100g: { kcal: 27, protein: 1.7, carbs: 6.2, fat: 0.1 }, keywords: ['kohlrabi'] },
  { id: 'salat', name: 'Salat / Eisbergsalat / Kopfsalat', defaultGrams: 100, per100g: { kcal: 14, protein: 1.2, carbs: 2.0, fat: 0.1 }, keywords: ['salat', 'eisbergsalat', 'kopfsalat', 'feldsalat'] },
  { id: 'rucola', name: 'Rucola / Rauke', defaultGrams: 50, per100g: { kcal: 25, protein: 2.6, carbs: 3.7, fat: 0.7 }, keywords: ['rucola', 'rauke'] },
  { id: 'lauch', name: 'Lauch / Porree', defaultGrams: 100, per100g: { kcal: 61, protein: 1.5, carbs: 14.2, fat: 0.3 }, keywords: ['lauch', 'porree', 'lauchzwiebeln', 'fruehlingszwiebeln'] },
  { id: 'sellerie', name: 'Staudensellerie / Knollensellerie', defaultGrams: 100, per100g: { kcal: 16, protein: 0.7, carbs: 3.0, fat: 0.2 }, keywords: ['sellerie', 'staudensellerie'] },
  { id: 'erbsen_tk', name: 'Erbsen grün (TK / frisch)', defaultGrams: 100, per100g: { kcal: 81, protein: 5.4, carbs: 14.5, fat: 0.4 }, keywords: ['erbsen', 'gruene erbsen'] },
  { id: 'mais_dose', name: 'Zuckermais / Mais (Dose)', defaultGrams: 140, per100g: { kcal: 86, protein: 3.2, carbs: 18.7, fat: 1.2 }, keywords: ['mais', 'zuckermais', 'dosenmais'] },
  { id: 'ingwer', name: 'Ingwer frisch', defaultGrams: 10, per100g: { kcal: 80, protein: 1.8, carbs: 17.8, fat: 0.8 }, keywords: ['ingwer'] },
  { id: 'spargel', name: 'Spargel (weiß / grün)', defaultGrams: 200, per100g: { kcal: 20, protein: 2.2, carbs: 3.9, fat: 0.1 }, keywords: ['spargel'] },

  // --- MILCHPRODUKTE & PFLANZLICHE ALTERNATIVEN ---
  { id: 'milch_15', name: 'Milch 1,5% Fett', defaultGrams: 200, per100g: { kcal: 47, protein: 3.4, carbs: 4.8, fat: 1.5 }, keywords: ['milch', 'fettarme milch', 'h-milch'] },
  { id: 'milch_35', name: 'Vollmilch 3,5% Fett', defaultGrams: 200, per100g: { kcal: 64, protein: 3.3, carbs: 4.8, fat: 3.5 }, keywords: ['vollmilch', 'frischmilch'] },
  { id: 'hafermilch', name: 'Hafermilch / Haferdrink', defaultGrams: 200, per100g: { kcal: 45, protein: 0.8, carbs: 6.5, fat: 1.5 }, keywords: ['hafermilch', 'haferdrink', 'oat milk'] },
  { id: 'mandelmilch', name: 'Mandelmilch (ungesüßt)', defaultGrams: 200, per100g: { kcal: 13, protein: 0.4, carbs: 0.1, fat: 1.1 }, keywords: ['mandelmilch', 'mandeldrink'] },
  { id: 'sojamilch', name: 'Sojamilch / Sojadrink', defaultGrams: 200, per100g: { kcal: 42, protein: 3.8, carbs: 1.8, fat: 1.9 }, keywords: ['sojamilch', 'sojadrink'] },
  { id: 'magerquark', name: 'Magerquark (Magerstufe)', defaultGrams: 250, per100g: { kcal: 68, protein: 12.0, carbs: 4.0, fat: 0.2 }, keywords: ['magerquark', 'quark'] },
  { id: 'speisequark_20', name: 'Speisequark 20% Fett i.Tr.', defaultGrams: 200, per100g: { kcal: 104, protein: 11.0, carbs: 3.5, fat: 4.4 }, keywords: ['quark 20', 'speisequark'] },
  { id: 'speisequark_40', name: 'Speisequark 40% Fett (Sahnequark)', defaultGrams: 150, per100g: { kcal: 155, protein: 9.0, carbs: 3.2, fat: 11.5 }, keywords: ['sahnequark', 'quark 40'] },
  { id: 'naturjoghurt', name: 'Naturjoghurt 1,5% Fett', defaultGrams: 150, per100g: { kcal: 50, protein: 4.3, carbs: 5.6, fat: 1.5 }, keywords: ['joghurt', 'naturjoghurt', 'fettarmer joghurt'] },
  { id: 'griechischer_joghurt', name: 'Griechischer Joghurt (10%)', defaultGrams: 150, per100g: { kcal: 125, protein: 9.0, carbs: 4.0, fat: 10.0 }, keywords: ['griechischer joghurt', 'greek yogurt'] },
  { id: 'skyr', name: 'Skyr Natur', defaultGrams: 200, per100g: { kcal: 63, protein: 11.0, carbs: 4.0, fat: 0.2 }, keywords: ['skyr'] },
  { id: 'huettenkaese', name: 'Hüttenkäse / Körniger Frischkäse', defaultGrams: 200, per100g: { kcal: 102, protein: 12.5, carbs: 2.7, fat: 4.3 }, keywords: ['huettenkaese', 'koerniger frischkaese', 'cottage cheese'] },
  { id: 'schlagsahne', name: 'Schlagsahne / Süße Sahne 30%', defaultGrams: 50, per100g: { kcal: 292, protein: 2.4, carbs: 3.2, fat: 30.0 }, keywords: ['sahne', 'schlagsahne', 'suessesahne'] },
  { id: 'schmand', name: 'Schmand (24% Fett)', defaultGrams: 50, per100g: { kcal: 240, protein: 2.5, carbs: 3.2, fat: 24.0 }, keywords: ['schmand', 'saure sahne', 'creme fraiche', 'sauerrahm'] },
  { id: 'butter', name: 'Butter', defaultGrams: 15, per100g: { kcal: 717, protein: 0.9, carbs: 0.7, fat: 81.0 }, keywords: ['butter', 'suessrahmbutter', 'sauerrahmbutter'] },

  // --- KÄSE ---
  { id: 'gouda', name: 'Gouda (jung / mittelalt)', defaultGrams: 30, per100g: { kcal: 356, protein: 25.0, carbs: 0.0, fat: 27.0 }, keywords: ['gouda', 'schnittkaese', 'scheibenkaese'] },
  { id: 'emmentaler', name: 'Emmentaler', defaultGrams: 30, per100g: { kcal: 395, protein: 29.0, carbs: 0.0, fat: 31.0 }, keywords: ['emmentaler', 'hartkaese'] },
  { id: 'feta', name: 'Feta Schafskäse / Hirtenkäse', defaultGrams: 50, per100g: { kcal: 264, protein: 14.2, carbs: 4.1, fat: 21.3 }, keywords: ['feta', 'schabskaese', 'hirtenkaese'] },
  { id: 'mozzarella', name: 'Mozzarella (1 Kugel ca. 125g)', defaultGrams: 125, per100g: { kcal: 280, protein: 28.0, carbs: 3.1, fat: 17.0 }, keywords: ['mozzarella', 'bueffelmozzarella'] },
  { id: 'parmesan', name: 'Parmesan / Grana Padano gerieben', defaultGrams: 20, per100g: { kcal: 431, protein: 38.0, carbs: 4.1, fat: 29.0 }, keywords: ['parmesan', 'grana padano', 'parmigiano'] },
  { id: 'frischkaese', name: 'Frischkäse Doppelrahmstufe', defaultGrams: 30, per100g: { kcal: 255, protein: 6.0, carbs: 3.5, fat: 24.5 }, keywords: ['frischkaese', 'philadelphia'] },
  { id: 'camembert', name: 'Camembert / Weichkäse 45%', defaultGrams: 40, per100g: { kcal: 290, protein: 20.0, carbs: 0.5, fat: 23.0 }, keywords: ['camembert', 'brie', 'weichkaese'] },

  // --- FLEISCH & GEFLÜGEL & WURST ---
  { id: 'haehnchenbrust', name: 'Hähnchenbrustfilet (roh)', defaultGrams: 200, per100g: { kcal: 110, protein: 23.0, carbs: 0.0, fat: 1.5 }, keywords: ['haehnchen', 'haehnchenbrust', 'huhn', 'gefluegel'] },
  { id: 'haehnchenbrust_gebraten', name: 'Hähnchenbrust gebraten', defaultGrams: 150, per100g: { kcal: 165, protein: 31.0, carbs: 0.0, fat: 3.6 }, keywords: ['haehnchen gebraten'] },
  { id: 'putenbrust', name: 'Putenbrustfilet (roh)', defaultGrams: 200, per100g: { kcal: 107, protein: 24.0, carbs: 0.0, fat: 1.0 }, keywords: ['pute', 'putenbrust', 'truthahn'] },
  { id: 'rinderhack', name: 'Rinderhackfleisch', defaultGrams: 150, per100g: { kcal: 250, protein: 19.0, carbs: 0.0, fat: 19.0 }, keywords: ['hackfleisch', 'rinderhack', 'hack'] },
  { id: 'gemischtes_hack', name: 'Hackfleisch gemischt (Rind & Schwein)', defaultGrams: 150, per100g: { kcal: 228, protein: 18.0, carbs: 0.0, fat: 17.0 }, keywords: ['gemischtes hack', 'mett'] },
  { id: 'rindersteak', name: 'Rindersteak / Rumpsteak / Rindfleisch', defaultGrams: 200, per100g: { kcal: 140, protein: 22.0, carbs: 0.0, fat: 5.5 }, keywords: ['steak', 'rindersteak', 'rindfleisch', 'roastbeef'] },
  { id: 'schweineschnitzel', name: 'Schweineschnitzel / Schweinefilet', defaultGrams: 160, per100g: { kcal: 125, protein: 22.5, carbs: 0.0, fat: 3.5 }, keywords: ['schnitzel', 'schweinefleisch', 'schweinefilet'] },
  { id: 'bratwurst', name: 'Bratwurst / Rostbratwurst', defaultGrams: 100, per100g: { kcal: 305, protein: 13.0, carbs: 1.0, fat: 28.0 }, keywords: ['bratwurst', 'rostbratwurst'] },
  { id: 'wiener_wuerstchen', name: 'Wiener Würstchen / Bockwurst', defaultGrams: 70, per100g: { kcal: 275, protein: 12.0, carbs: 1.0, fat: 25.0 }, keywords: ['wiener', 'wuerstchen', 'bockwurst'] },
  { id: 'kochschinken', name: 'Kochschinken', defaultGrams: 40, per100g: { kcal: 110, protein: 20.0, carbs: 1.0, fat: 3.0 }, keywords: ['schinken', 'kochschinken', 'hinterkochschinken'] },
  { id: 'rohschinken', name: 'Rohschinken / Serrano / Parmaschinken', defaultGrams: 30, per100g: { kcal: 220, protein: 26.0, carbs: 0.5, fat: 12.0 }, keywords: ['rohschinken', 'serrano', 'parmaschinken', 'prosciutto'] },
  { id: 'salami', name: 'Salami', defaultGrams: 25, per100g: { kcal: 410, protein: 22.0, carbs: 1.0, fat: 35.0 }, keywords: ['salami'] },
  { id: 'landjaeger', name: 'Landjäger', defaultGrams: 50, per100g: { kcal: 460, protein: 25.0, carbs: 1.0, fat: 40.0 }, keywords: ['landjaeger', 'kaminwurz', 'beisser'] },
  { id: 'bacon', name: 'Bacon / Frühstücksspeck', defaultGrams: 30, per100g: { kcal: 390, protein: 15.0, carbs: 0.5, fat: 37.0 }, keywords: ['bacon', 'speck', 'fruehstuecksspeck'] },

  // --- FISCH & MEERESFRÜCHTE ---
  { id: 'lachs', name: 'Lachsfilet (gebraten / gedünstet)', defaultGrams: 150, per100g: { kcal: 208, protein: 20.4, carbs: 0.0, fat: 13.4 }, keywords: ['lachs', 'lachsfilet', 'wildlachs'] },
  { id: 'thunfisch_dose', name: 'Thunfisch im eigenen Saft (Dose)', defaultGrams: 150, per100g: { kcal: 116, protein: 26.0, carbs: 0.0, fat: 1.0 }, keywords: ['thunfisch', 'dosenthunfisch'] },
  { id: 'kabeljau', name: 'Kabeljau / Seelachs / Weißfisch', defaultGrams: 150, per100g: { kcal: 82, protein: 18.0, carbs: 0.0, fat: 0.7 }, keywords: ['seelachs', 'kabeljau', 'dorsch', 'weissfisch'] },
  { id: 'garnelen', name: 'Garnelen / Shrimps', defaultGrams: 120, per100g: { kcal: 85, protein: 18.5, carbs: 0.5, fat: 1.0 }, keywords: ['garnelen', 'shrimps', 'crevetten', 'prawns'] },
  { id: 'fischstaebchen', name: 'Fischstäbchen gebacken', defaultGrams: 120, per100g: { kcal: 195, protein: 13.0, carbs: 18.0, fat: 7.5 }, keywords: ['fischstaebchen'] },

  // --- EIER & VEGANE PROTEINE ---
  { id: 'ei_gekocht', name: 'Hühnerei (Größe M)', defaultGrams: 55, per100g: { kcal: 155, protein: 13.0, carbs: 1.1, fat: 11.0 }, keywords: ['ei', 'eier', 'huehnerei', 'fruehstuecksei'] },
  { id: 'spiegelei', name: 'Spiegelei (in Butter/Öl)', defaultGrams: 60, per100g: { kcal: 196, protein: 13.5, carbs: 0.8, fat: 15.0 }, keywords: ['spiegelei', 'ruehrei'] },
  { id: 'tofu_natur', name: 'Tofu natur', defaultGrams: 150, per100g: { kcal: 125, protein: 14.0, carbs: 1.5, fat: 7.0 }, keywords: ['tofu', 'raeuchertofu'] },

  // --- TEIGWAREN, REIS & GETREIDE ---
  { id: 'haferflocken', name: 'Haferflocken', defaultGrams: 50, per100g: { kcal: 370, protein: 13.5, carbs: 58.7, fat: 7.0 }, keywords: ['haferflocken', 'oats', 'porridge'] },
  { id: 'muesli', name: 'Müsli / Früchtemüsli', defaultGrams: 60, per100g: { kcal: 365, protein: 10.0, carbs: 62.0, fat: 6.5 }, keywords: ['muesli', 'knuspermuesli', 'granola'] },
  { id: 'nudeln_gekocht', name: 'Nudeln / Pasta / Spaghetti gekocht', defaultGrams: 200, per100g: { kcal: 158, protein: 5.8, carbs: 30.9, fat: 0.9 }, keywords: ['nudeln', 'pasta', 'spaghetti', 'penne'] },
  { id: 'reis_gekocht', name: 'Reis gekocht (Basmati / Jasmin)', defaultGrams: 180, per100g: { kcal: 130, protein: 2.7, carbs: 28.0, fat: 0.3 }, keywords: ['reis', 'basmatireis', 'jasminreis', 'langkornreis'] },
  { id: 'couscous', name: 'Couscous gekocht', defaultGrams: 150, per100g: { kcal: 112, protein: 3.8, carbs: 23.2, fat: 0.2 }, keywords: ['couscous', 'kuskus'] },
  { id: 'bulgur', name: 'Bulgur gekocht', defaultGrams: 150, per100g: { kcal: 83, protein: 3.1, carbs: 18.6, fat: 0.2 }, keywords: ['bulgur'] },
  { id: 'quinoa', name: 'Quinoa gekocht', defaultGrams: 150, per100g: { kcal: 120, protein: 4.4, carbs: 21.3, fat: 1.9 }, keywords: ['quinoa'] },

  // --- HÜLSENFRÜCHTE ---
  { id: 'kidneybohnen', name: 'Kidneybohnen (Dose abgetropft)', defaultGrams: 125, per100g: { kcal: 110, protein: 8.5, carbs: 15.0, fat: 0.6 }, keywords: ['kidneybohnen', 'bohnen', 'chilibohnen'] },
  { id: 'kichererbsen', name: 'Kichererbsen (Dose abgetropft)', defaultGrams: 125, per100g: { kcal: 120, protein: 7.0, carbs: 17.0, fat: 2.5 }, keywords: ['kichererbsen', 'chickpeas'] },
  { id: 'linsen', name: 'Linsen gekocht (braun / rot)', defaultGrams: 150, per100g: { kcal: 116, protein: 9.0, carbs: 20.0, fat: 0.4 }, keywords: ['linsen', 'berglinsen', 'tellerlinsen'] },

  // --- BROT & BACKWAREN ---
  { id: 'vollkornbrot', name: 'Vollkornbrot (1 Scheibe ca. 50g)', defaultGrams: 50, per100g: { kcal: 210, protein: 7.5, carbs: 39.0, fat: 1.5 }, keywords: ['vollkornbrot', 'brot', 'roggenbrot'] },
  { id: 'toast_weiss', name: 'Toastbrot / Weißbrot (1 Scheibe ca. 30g)', defaultGrams: 30, per100g: { kcal: 265, protein: 8.0, carbs: 49.0, fat: 3.2 }, keywords: ['toast', 'toastbrot', 'sandwichbrot'] },
  { id: 'broetchen', name: 'Brötchen / Semmel (1 Stück ca. 60g)', defaultGrams: 60, per100g: { kcal: 260, protein: 8.5, carbs: 51.0, fat: 1.4 }, keywords: ['broetchen', 'semmel', 'schrippe', 'rundstueck'] },
  { id: 'croissant', name: 'Buttercroissant (1 Stück ca. 60g)', defaultGrams: 60, per100g: { kcal: 406, protein: 8.2, carbs: 45.0, fat: 21.0 }, keywords: ['croissant'] },
  { id: 'tortilla_wrap', name: 'Tortilla / Weizenwrap (1 Stück ca. 60g)', defaultGrams: 60, per100g: { kcal: 300, protein: 8.0, carbs: 51.0, fat: 6.5 }, keywords: ['wrap', 'tortilla', 'fladenbrot'] },

  // --- NÜSSE, KERNE & AUFSTRICHE ---
  { id: 'mandeln', name: 'Mandeln', defaultGrams: 30, per100g: { kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9 }, keywords: ['mandeln'] },
  { id: 'walnuesse', name: 'Walnüsse', defaultGrams: 30, per100g: { kcal: 654, protein: 15.2, carbs: 13.7, fat: 65.2 }, keywords: ['walnuesse'] },
  { id: 'cashews', name: 'Cashewkerne', defaultGrams: 30, per100g: { kcal: 553, protein: 18.2, carbs: 30.2, fat: 43.8 }, keywords: ['cashews', 'cashewkerne'] },
  { id: 'erdnussbutter', name: 'Erdnussbutter (100% Erdnuss)', defaultGrams: 20, per100g: { kcal: 588, protein: 25.0, carbs: 20.0, fat: 50.0 }, keywords: ['erdnussbutter', 'peanut butter'] },
  { id: 'honig', name: 'Bienenhonig (1 TL ca. 10g)', defaultGrams: 10, per100g: { kcal: 304, protein: 0.3, carbs: 82.4, fat: 0.0 }, keywords: ['honig', 'bienenhonig'] },
  { id: 'marmelade', name: 'Marmelade / Konfitüre (1 EL ca. 20g)', defaultGrams: 20, per100g: { kcal: 250, protein: 0.5, carbs: 60.0, fat: 0.1 }, keywords: ['marmelade', 'konfituere', 'erdbeermarmelade'] },
  { id: 'nutella', name: 'Nuss-Nougat-Creme / Nutella', defaultGrams: 20, per100g: { kcal: 540, protein: 6.3, carbs: 57.5, fat: 30.9 }, keywords: ['nutella', 'schokocreme', 'nuss nougat creme'] },

  // --- ÖLE & KOCHZUTATEN ---
  { id: 'olivenoel', name: 'Olivenöl (1 EL ca. 10g)', defaultGrams: 10, per100g: { kcal: 884, protein: 0.0, carbs: 0.0, fat: 100.0 }, keywords: ['olivenoel', 'oel'] },
  { id: 'rapsoel', name: 'Rapsöl / Sonnenblumenöl (1 EL ca. 10g)', defaultGrams: 10, per100g: { kcal: 884, protein: 0.0, carbs: 0.0, fat: 100.0 }, keywords: ['rapsoel', 'sonnenblumenoel', 'pflanzenoel'] },
  { id: 'weizenmehl', name: 'Weizenmehl (Type 405 / 550)', defaultGrams: 100, per100g: { kcal: 345, protein: 10.5, carbs: 71.0, fat: 1.0 }, keywords: ['mehl', 'weizenmehl', 'dinkelmehl'] },
  { id: 'zucker', name: 'Haushaltszucker (1 TL ca. 5g)', defaultGrams: 10, per100g: { kcal: 400, protein: 0.0, carbs: 100.0, fat: 0.0 }, keywords: ['zucker', 'kristallzucker'] },
  { id: 'passierte_tomaten', name: 'Passierte Tomaten / Gehackte Tomaten', defaultGrams: 200, per100g: { kcal: 24, protein: 1.3, carbs: 4.2, fat: 0.2 }, keywords: ['passierte tomaten', 'gehackte tomaten', 'polpa', 'tomatenstuecke'] },
  { id: 'tomatenmark', name: 'Tomatenmark (2-fach / 3-fach)', defaultGrams: 20, per100g: { kcal: 85, protein: 4.5, carbs: 15.0, fat: 0.5 }, keywords: ['tomatenmark'] },
  { id: 'pesto_genovese', name: 'Pesto Genovese (grün)', defaultGrams: 40, per100g: { kcal: 480, protein: 5.0, carbs: 6.0, fat: 48.0 }, keywords: ['pesto', 'pesto genovese', 'basilikumpesto'] },
  { id: 'ketchup', name: 'Tomatenketchup (1 EL ca. 20g)', defaultGrams: 20, per100g: { kcal: 110, protein: 1.5, carbs: 24.0, fat: 0.2 }, keywords: ['ketchup'] },
  { id: 'mayonnaise', name: 'Mayonnaise 80% (1 EL ca. 15g)', defaultGrams: 15, per100g: { kcal: 720, protein: 1.0, carbs: 3.0, fat: 80.0 }, keywords: ['mayo', 'mayonnaise', 'salatmayonnaise'] },
  { id: 'senf', name: 'Senf mittelscharf (1 TL ca. 10g)', defaultGrams: 10, per100g: { kcal: 115, protein: 6.0, carbs: 5.0, fat: 7.0 }, keywords: ['senf', 'dijonsenf'] },
  { id: 'sojasauce', name: 'Sojasauce', defaultGrams: 15, per100g: { kcal: 60, protein: 9.0, carbs: 5.5, fat: 0.1 }, keywords: ['sojasauce', 'soy sauce'] },

  // --- FERTIGGERICHTE & SNACKS ---
  { id: 'pizza_margherita', name: 'Pizza Margherita (ganz ca. 350g)', defaultGrams: 350, per100g: { kcal: 240, protein: 9.5, carbs: 32.0, fat: 8.0 }, keywords: ['pizza', 'margherita'] },
  { id: 'doener_kebap', name: 'Döner Kebab (1 Stück ca. 400g)', defaultGrams: 400, per100g: { kcal: 185, protein: 12.0, carbs: 18.0, fat: 7.5 }, keywords: ['doener', 'kebab', 'doenerteller'] },
  { id: 'currywurst', name: 'Currywurst mit Sauce (ca. 200g)', defaultGrams: 200, per100g: { kcal: 260, protein: 12.0, carbs: 14.0, fat: 17.0 }, keywords: ['currywurst'] },
  { id: 'pommes', name: 'Pommes Frites gebacken', defaultGrams: 150, per100g: { kcal: 290, protein: 3.5, carbs: 41.0, fat: 12.0 }, keywords: ['pommes', 'fritten'] },
  { id: 'whey_protein', name: 'Proteinpulver / Whey (1 Scoop ca. 30g)', defaultGrams: 30, per100g: { kcal: 380, protein: 75.0, carbs: 6.0, fat: 5.0 }, keywords: ['whey', 'proteinpulver', 'protein shake'] },
  { id: 'schokolade_zartbitter', name: 'Zartbitterschokolade 70%', defaultGrams: 25, per100g: { kcal: 598, protein: 7.8, carbs: 45.9, fat: 42.6 }, keywords: ['schokolade', 'zartbitterschokolade', 'dunkle schokolade'] },
  { id: 'schokolade_vollmilch', name: 'Vollmilchschokolade', defaultGrams: 25, per100g: { kcal: 535, protein: 7.5, carbs: 59.0, fat: 30.0 }, keywords: ['vollmilchschokolade'] },
  { id: 'chips', name: 'Kartoffelchips / Chips', defaultGrams: 30, per100g: { kcal: 535, protein: 6.0, carbs: 51.0, fat: 34.0 }, keywords: ['chips', 'kartoffelchips'] },

  // --- GETRÄNKE ---
  { id: 'wasser', name: 'Wasser / Mineralwasser', defaultGrams: 250, per100g: { kcal: 0, protein: 0.0, carbs: 0.0, fat: 0.0 }, keywords: ['wasser', 'mineralwasser', 'sprudel'] },
  { id: 'apfelsaft', name: 'Apfelsaft / Orangensaft', defaultGrams: 200, per100g: { kcal: 46, protein: 0.2, carbs: 11.0, fat: 0.1 }, keywords: ['apfelsaft', 'orangensaft', 'saft', 'apfelschorle'] },
  { id: 'cola', name: 'Cola / Softdrink mit Zucker', defaultGrams: 330, per100g: { kcal: 42, protein: 0.0, carbs: 10.6, fat: 0.0 }, keywords: ['cola', 'fanta', 'sprite', 'limonade'] },
  { id: 'cola_zero', name: 'Cola Zero / Light (zuckerfrei)', defaultGrams: 330, per100g: { kcal: 1, protein: 0.0, carbs: 0.0, fat: 0.0 }, keywords: ['cola zero', 'cola light', 'zero'] },
  { id: 'bier', name: 'Bier / Pils (0,5 l ca. 500g)', defaultGrams: 500, per100g: { kcal: 43, protein: 0.5, carbs: 3.1, fat: 0.0 }, keywords: ['bier', 'pils', 'weizenbier', 'radler'] },
  { id: 'wein', name: 'Wein (Rotwein / Weißwein / Rosé)', defaultGrams: 200, per100g: { kcal: 83, protein: 0.1, carbs: 2.6, fat: 0.0 }, keywords: ['wein', 'rotwein', 'weisswein', 'sekt'] },
  { id: 'kaffee_schwarz', name: 'Kaffee schwarz / Espresso', defaultGrams: 150, per100g: { kcal: 2, protein: 0.1, carbs: 0.0, fat: 0.0 }, keywords: ['kaffee', 'espresso'] },
  { id: 'cappuccino', name: 'Cappuccino mit Milchschaum', defaultGrams: 200, per100g: { kcal: 45, protein: 2.5, carbs: 3.8, fat: 2.2 }, keywords: ['cappuccino', 'latte macchiato', 'milchkaffee'] },
];

/**
 * Durchsucht die integrierten Lebensmittel intelligent nach Suchbegriff oder Produktname.
 * Unterstützt Wortstämme, Einzahl/Mehrzahl und Keywords für blitzschnelle Treffer.
 */
export function searchBuiltinFoods(query) {
  if (!query || !query.trim()) return [];
  const rawQ = query.trim().toLowerCase();
  const normQ = normalizeStr(rawQ);

  // Einfache deutsche Plural-Stämme entfernen
  let stem = normQ;
  if (stem.endsWith('en') && stem.length > 4) {
    stem = stem.slice(0, -2);
  } else if (stem.endsWith('n') && stem.length > 3) {
    stem = stem.slice(0, -1);
  } else if (stem.endsWith('e') && stem.length > 3) {
    stem = stem.slice(0, -1);
  }

  const scored = [];

  for (const item of BUILTIN_FOODS) {
    const rawName = item.name.toLowerCase();
    const normName = normalizeStr(item.name);
    let score = 0;

    // 1. Exakter Treffer oder Startet-mit Treffer
    if (rawName === rawQ || normName === normQ) {
      score = 100;
    } else if (rawName.startsWith(rawQ) || normName.startsWith(normQ)) {
      score = 80;
    } else if (rawName.includes(rawQ) || normName.includes(normQ)) {
      score = 60;
    } else if (stem.length >= 3 && (rawName.includes(stem) || normName.includes(stem))) {
      score = 50;
    }

    // 2. Keywords / Synonyme abgleichen
    if (item.keywords) {
      for (const kw of item.keywords) {
        const normK = normalizeStr(kw);
        if (normK === normQ || normK === stem) {
          score = Math.max(score, 90);
        } else if (normK.startsWith(normQ) || normQ.startsWith(normK)) {
          score = Math.max(score, 70);
        } else if (normK.includes(normQ) || normQ.includes(normK) || (stem.length >= 3 && normK.includes(stem))) {
          score = Math.max(score, 55);
        }
      }
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 12).map(s => s.item);
}
