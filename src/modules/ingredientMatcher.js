// Intelligenter Zutatenabgleich für die Wochen-Übernahme in die Einkaufsliste

export function normalizeIngredientName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Known culinary units in German and international recipes
 */
export const KNOWN_UNITS_SET = new Set([
  'g', 'gramm', 'kg', 'kilo', 'kilogramm', 'pound', 'pounds', 'lb', 'lbs',
  'ml', 'milliliter', 'l', 'liter', 'dl', 'cl',
  'el', 'esslöffel', 'tl', 'teelöffel',
  'stk', 'stück', 'stueck',
  'prise', 'prisen', 'tasse', 'tassen', 'becher',
  'dose', 'dosen', 'packung', 'packungen', 'pck', 'pkg',
  'bund', 'bünde', 'zehe', 'zehen', 'scheibe', 'scheiben',
  'msp', 'handvoll', 'glas', 'gläser', 'tropfen'
]);

export function isKnownUnit(unitStr) {
  if (!unitStr) return false;
  return KNOWN_UNITS_SET.has(unitStr.toLowerCase().trim());
}

/**
 * Robust ingredient line parser that extracts quantity, unit and food name,
 * supporting leading quantities ("600g Gnocchi", "600 g Gnocchi", "1 Dose Tomaten"),
 * trailing quantities ("Gnocchi 600g", "Gnocchi 600 g", "Gnocchi (600g)"),
 * and standalone names ("Gnocchi").
 */
export function parseIngredientTextLine(line) {
  if (!line || typeof line !== 'string') {
    return { amount: null, unit: '', name: '', raw: '' };
  }
  const trimmed = line.trim();
  if (!trimmed) {
    return { amount: null, unit: '', name: '', raw: '' };
  }

  // 1. Check for trailing quantity: e.g. "Gnocchi 600g", "Gnocchi 600 g", "Gnocchi (600g)", "Gnocchi, 600g"
  const trailingMatch = trimmed.match(/^(.*?)(?:,\s*|\s+-\s*|\s*\(\s*|\s+)(\d+(?:[.,]\d+)?)\s*([a-zA-ZäöüÄÖÜß]+)?\s*\)?$/i);
  if (trailingMatch) {
    const potentialName = trailingMatch[1].replace(/[(),\-:]/g, '').trim();
    const num = parseFloat(trailingMatch[2].replace(',', '.'));
    const unitStr = (trailingMatch[3] || '').trim();
    if (potentialName && (isKnownUnit(unitStr) || !unitStr)) {
      return {
        amount: num,
        unit: unitStr,
        name: potentialName,
        raw: trimmed,
      };
    }
  }

  // 2. Check for leading quantity with space: "600 g Gnocchi", "1 Dose Tomaten", "2 Äpfel"
  const leadingSpaceMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s+([a-zA-ZäöüÄÖÜß]+)(?:\s*-\s*|\s+)(.+)$/i);
  if (leadingSpaceMatch) {
    const num = parseFloat(leadingSpaceMatch[1].replace(',', '.'));
    const unitCand = leadingSpaceMatch[2].trim();
    const restName = leadingSpaceMatch[3].trim();
    if (isKnownUnit(unitCand)) {
      return {
        amount: num,
        unit: unitCand,
        name: restName,
        raw: trimmed,
      };
    } else {
      return {
        amount: num,
        unit: '',
        name: `${unitCand} ${restName}`.trim(),
        raw: trimmed,
      };
    }
  }

  // 3. Check for leading quantity with attached unit or standalone number: "600g Gnocchi", "2 Äpfel"
  const leadingAttachedMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-ZäöüÄÖÜß]+)?(?:\s*-\s*|\s+)(.+)$/i);
  if (leadingAttachedMatch) {
    const num = parseFloat(leadingAttachedMatch[1].replace(',', '.'));
    const unitCand = (leadingAttachedMatch[2] || '').trim();
    const restName = leadingAttachedMatch[3].trim();
    if (isKnownUnit(unitCand) || !unitCand) {
      return {
        amount: num,
        unit: unitCand,
        name: restName,
        raw: trimmed,
      };
    }
  }

  return {
    amount: null,
    unit: '',
    name: trimmed,
    raw: trimmed,
  };
}

/**
 * Compatible unit groups for arithmetic aggregation
 */
const UNIT_GROUPS = {
  WEIGHT: {
    g: 1,
    gramm: 1,
    kg: 1000,
    kilo: 1000,
    kilogramm: 1000,
    pound: 453.6,
    pounds: 453.6,
    lb: 453.6,
    lbs: 453.6,
  },
  VOLUME: {
    ml: 1,
    milliliter: 1,
    l: 1000,
    liter: 1000,
    dl: 100,
    cl: 10,
  },
  COUNT: {
    stk: 1,
    stück: 1,
    stueck: 1,
  }
};

/**
 * Normalizes amount and unit to base standard (grams, milliliters, pieces)
 */
export function normalizeUnitAndAmount(amount, unit) {
  if (amount == null || isNaN(amount)) {
    return { amount: null, unit: unit || '', baseUnit: null, baseAmount: null };
  }
  const uLower = (unit || '').toLowerCase().trim();

  // Weight
  if (UNIT_GROUPS.WEIGHT[uLower]) {
    return {
      amount,
      unit: uLower,
      baseUnit: 'g',
      baseAmount: amount * UNIT_GROUPS.WEIGHT[uLower]
    };
  }

  // Volume
  if (UNIT_GROUPS.VOLUME[uLower]) {
    return {
      amount,
      unit: uLower,
      baseUnit: 'ml',
      baseAmount: amount * UNIT_GROUPS.VOLUME[uLower]
    };
  }

  // Count
  if (UNIT_GROUPS.COUNT[uLower]) {
    return {
      amount,
      unit: 'Stück',
      baseUnit: 'Stück',
      baseAmount: amount
    };
  }

  // Non-convertible unit (e.g. Dose, Bund, Prise, Packung)
  return {
    amount,
    unit: unit || '',
    baseUnit: null,
    baseAmount: null
  };
}

/**
 * Formats aggregated base amounts cleanly (e.g. 1500g -> 1.5kg)
 */
export function formatAggregatedDetail(baseAmount, baseUnit, rawUnit) {
  if (baseAmount == null || baseAmount <= 0) {
    return rawUnit ? rawUnit : '';
  }

  if (baseUnit === 'g') {
    if (baseAmount >= 1000) {
      const kg = Math.round((baseAmount / 1000) * 10) / 10;
      return `${kg}kg`;
    }
    return `${Math.round(baseAmount)}g`;
  }

  if (baseUnit === 'ml') {
    if (baseAmount >= 1000) {
      const l = Math.round((baseAmount / 1000) * 10) / 10;
      return `${l}l`;
    }
    return `${Math.round(baseAmount)}ml`;
  }

  if (baseUnit === 'Stück') {
    return `${Math.round(baseAmount * 10) / 10} Stk.`;
  }

  return `${Math.round(baseAmount * 10) / 10} ${rawUnit || ''}`.trim();
}

/**
 * Checks if a candidate product is an exact or safe match for an ingredient,
 * taking care NOT to confuse distinct items like Hafermilch with Milch.
 */
export function findProductMatch(ingredientName, allProducts = []) {
  if (!ingredientName) return { type: 'none', product: null };
  const raw = ingredientName.trim();
  const rawLower = raw.toLowerCase();
  const norm = normalizeIngredientName(raw);

  // 1. Exact name or ID match
  const exact = allProducts.find(p =>
    p.id === rawLower ||
    p.name.toLowerCase() === rawLower ||
    normalizeIngredientName(p.name) === norm
  );
  if (exact) {
    return { type: 'exact', product: exact };
  }

  // Explicit distinct pairs that MUST NEVER be merged
  const distinctKeywords = [
    ['hafermilch', 'milch'],
    ['mandelmilch', 'milch'],
    ['sojamilch', 'milch'],
    ['kokosmilch', 'milch'],
    ['schlagsahne', 'sahne', 'sojasahne', 'hafensahne'],
    ['rinderhack', 'hackfleisch', 'gemischtes hackfleisch', 'veganes hack'],
    ['olivenol', 'olivenöl', 'rapsol', 'rapsöl', 'sonnenblumenol', 'sonnenblumenöl', 'öl'],
    ['weizenmehl', 'dinkelmehl', 'roggenmehl', 'mehl'],
    ['suesskartoffel', 'süßkartoffel', 'kartoffel'],
  ];

  for (const group of distinctKeywords) {
    const matchedKeyword = group.find(k => norm.includes(normalizeIngredientName(k)));
    if (matchedKeyword) {
      // Find exact product for this specific keyword
      const specific = allProducts.find(p => normalizeIngredientName(p.name) === normalizeIngredientName(matchedKeyword));
      if (specific) {
        return { type: 'exact', product: specific };
      }
      // If no specific product exists, do NOT fall back to generic parent!
      return { type: 'none', product: null, suggestedName: raw };
    }
  }

  // 2. Controlled singular/plural matches
  const simpleVariants = allProducts.filter(p => {
    const pNorm = normalizeIngredientName(p.name);
    return (
      norm === pNorm + 'n' ||
      norm === pNorm + 'en' ||
      norm === pNorm + 's' ||
      pNorm === norm + 'n' ||
      pNorm === norm + 'en' ||
      pNorm === norm + 's'
    );
  });

  if (simpleVariants.length === 1) {
    return { type: 'variant', product: simpleVariants[0] };
  }

  if (simpleVariants.length > 1) {
    return { type: 'ambiguous', candidates: simpleVariants, suggestedName: raw };
  }

  return { type: 'none', product: null, suggestedName: raw };
}

/**
 * Consolidates ingredients from a list of planned recipe usages.
 * Identifies unambiguous matches and collects ambiguous ones for user confirmation.
 * 
 * @param {Array<{ recipe: Object, multiplier: number }>} usageList
 * @param {Array<Object>} allProducts - Built-in + Custom Products
 * @returns {{ autoItems: Array, pendingChoices: Array }}
 */
export function analyzeWeekIngredients(usageList, allProducts) {
  const autoItemsMap = new Map(); // key -> aggregated item
  const pendingChoices = [];

  for (const { recipe, multiplier } of usageList) {
    const recipeTitle = recipe.title || 'Rezept';
    for (const ing of (recipe.ingredients || [])) {
      const rawText = (typeof ing === 'string' ? ing : (ing?.raw || ing?.name || '')).trim();
      if (!rawText) continue;

      let extracted = parseIngredientTextLine(rawText);

      // Determine initial clean name and amounts
      let cleanName = (typeof ing === 'object' && ing.name ? ing.name.trim() : extracted.name) || extracted.name;
      let amt = (typeof ing === 'object' && ing.amount != null ? ing.amount : extracted.amount);
      let unit = (typeof ing === 'object' && ing.unit ? ing.unit : extracted.unit) || '';

      // Safeguard: if cleanName is purely a quantity/unit (e.g. "600g" or "600 g" or "1kg"),
      // recover actual ingredient name from rawText!
      if (/^\d+\s*[a-zA-Z]*$/i.test(cleanName) || isKnownUnit(cleanName)) {
        const fromRaw = parseIngredientTextLine(rawText);
        if (fromRaw.name && !/^\d+\s*[a-zA-Z]*$/i.test(fromRaw.name)) {
          cleanName = fromRaw.name;
          if (amt == null) amt = fromRaw.amount;
          if (!unit) unit = fromRaw.unit;
        }
      }

      // If cleanName still has trailing or leading quantity (e.g. "Gnocchi 600g"), parse it
      if (cleanName) {
        const subParse = parseIngredientTextLine(cleanName);
        if (subParse.amount != null && subParse.name && subParse.name.toLowerCase() !== cleanName.toLowerCase()) {
          cleanName = subParse.name;
          if (amt == null) amt = subParse.amount;
          if (!unit) unit = subParse.unit;
        }
      }

      if (!cleanName) continue;

      const finalAmt = amt != null ? amt * multiplier : null;
      const normAmt = normalizeUnitAndAmount(finalAmt, unit);

      const match = findProductMatch(cleanName, allProducts);

      if (match.type === 'exact' || match.type === 'variant') {
        const prod = match.product;
        const key = prod.id;

        if (autoItemsMap.has(key)) {
          const item = autoItemsMap.get(key);
          if (normAmt.baseUnit && item.baseUnit === normAmt.baseUnit) {
            item.baseAmount = (item.baseAmount || 0) + normAmt.baseAmount;
          } else if (normAmt.amount != null) {
            item.extraAmounts.push({ amount: normAmt.amount, unit: normAmt.unit });
          }
          if (!item.sourceRecipes.includes(recipeTitle)) {
            item.sourceRecipes.push(recipeTitle);
          }
        } else {
          autoItemsMap.set(key, {
            productId: prod.id,
            name: prod.name,
            category: prod.category,
            icon: prod.icon,
            baseAmount: normAmt.baseAmount,
            baseUnit: normAmt.baseUnit,
            rawUnit: normAmt.unit,
            extraAmounts: normAmt.baseUnit ? [] : (normAmt.amount != null ? [{ amount: normAmt.amount, unit: normAmt.unit }] : []),
            sourceRecipes: [recipeTitle]
          });
        }
      } else {
        // Needs user decision: ambiguous or new product
        const defaultCandidate = match.candidates?.[0] || null;
        pendingChoices.push({
          id: 'choice_' + Math.random().toString(36).slice(2, 9),
          rawName: cleanName,
          ingredientRaw: cleanName,
          amount: finalAmt,
          unit: unit,
          sources: [recipeTitle],
          recipeTitle,
          candidates: match.candidates || [],
          suggestedProduct: defaultCandidate,
          suggestedName: defaultCandidate?.name || cleanName,
          isNewProduct: !match.candidates || match.candidates.length === 0,
          selectedAction: match.candidates && match.candidates.length > 0 ? 'candidate' : 'new',
          selectedProductId: defaultCandidate?.id || null,
          customName: defaultCandidate?.name || cleanName,
        });
      }
    }
  }

  // Convert auto items to final shopping items format
  const autoItems = Array.from(autoItemsMap.values()).map(item => {
    const details = ['Automatisch hinzugefügt'];

    const mainDetail = formatAggregatedDetail(item.baseAmount, item.baseUnit, item.rawUnit);
    if (mainDetail) details.push(mainDetail);

    for (const extra of item.extraAmounts) {
      details.push(`${Math.round(extra.amount * 10) / 10} ${extra.unit}`.trim());
    }

    if (item.sourceRecipes.length > 0) {
      details.push(`Rezept: ${item.sourceRecipes.join(', ')}`);
    }

    return {
      productId: item.productId,
      name: item.name,
      category: item.category,
      icon: item.icon,
      details,
      detail: details.join(' · '),
      completed: false,
      isAutoImported: true,
      sourceRecipes: item.sourceRecipes,
    };
  });

  return { autoItems, resolvedItems: autoItems, pendingChoices };
}
