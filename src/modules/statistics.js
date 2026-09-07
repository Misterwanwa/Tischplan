// Modul für interne Nutzungsstatistiken und den Jahresrückblick (Rewind)
// Arbeitet rein lokal ohne externe Tracker oder SDKs.

export const STATS_STORAGE_KEY = 'app_stats_v1';

export const EVENT_TYPES = {
  SHOPPING_ADD: 'shopping_add',
  RECIPE_COOKED: 'recipe_cooked',
  RECIPE_UNCOOKED: 'recipe_uncooked',
};

const GERMAN_STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'und', 'oder', 'aber', 'mit', 'ohne', 'fur', 'für', 'vom', 'von', 'zum', 'zur', 'zu',
  'auf', 'in', 'im', 'aus', 'bei', 'nach', 'uber', 'über', 'unter', 'vor', 'an', 'am',
  'wie', 'so', 'nicht', 'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'rezept', 'art',
  'klassisch', 'klassische', 'klassisches', 'klassischer', 'klassischem', 'klassischen',
  'schnell', 'schnelle', 'schnelles', 'schneller', 'schnellem', 'schnellen',
  'einfach', 'einfache', 'einfaches', 'einfacher', 'einfachem', 'einfachen',
  'selbstgemacht', 'selbstgemachte', 'selbstgemachtes',
  'lecker', 'leckere', 'leckeres', 'leckerer', 'leckerem', 'leckeren',
  'fein', 'feine', 'feines', 'feiner', 'feinem', 'feinen',
  'original', 'hausgemacht', 'portion', 'teller', 'ofen', 'pfanne', 'schussel', 'schüssel', 'glas'
]);

/**
 * Extracts and cleans meaningful words from titles.
 */
export function extractMeaningfulWords(title) {
  if (!title || typeof title !== 'string') return [];
  const cleaned = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9äöü]/g, ' ');

  const tokens = cleaned.split(/\s+/).filter(w => w.length >= 3);
  return tokens.filter(w => !GERMAN_STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Creates a unique, idempotent event object.
 */
export function createStatEvent(type, payload = {}) {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return {
    id: `stat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp: Date.now(),
    date: dateStr,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    ...payload,
  };
}

/**
 * Appends an event to the local statistics log with duplicate protection.
 */
export function appendStatEvent(statsState, event) {
  if (!statsState || statsState.enabled === false) return statsState;
  const events = Array.isArray(statsState.events) ? statsState.events : [];

  // Deduplication check: prevent identical events within 10 seconds
  const isDuplicate = events.some(e =>
    e.type === event.type &&
    e.actionId && event.actionId &&
    e.actionId === event.actionId &&
    Math.abs(e.timestamp - event.timestamp) < 10000
  );

  if (isDuplicate) return statsState;

  // If uncooked event, mark the previous cooked event
  if (event.type === EVENT_TYPES.RECIPE_UNCOOKED && event.recipeId) {
    const nextEvents = events.filter(e => !(e.type === EVENT_TYPES.RECIPE_COOKED && e.recipeId === event.recipeId && e.date === event.date));
    return { ...statsState, events: nextEvents };
  }

  return {
    ...statsState,
    events: [...events, event],
    lastUpdated: Date.now(),
  };
}

/**
 * Generates the Rewind year-in-review analysis.
 * 
 * @param {Object} params
 * @param {number} params.targetYear - Year to evaluate (e.g. 2026)
 * @param {Object} params.statsState - Stored events state
 * @param {Array} params.recipes - All recipes
 * @param {Object} params.streakSummary - Streak info for current profile
 * @param {boolean} [params.isPreview=false] - Whether triggered via test code preview
 * @returns {Object} Structured Rewind summary
 */
export function generateRewindReport({ targetYear, statsState = {}, recipes = [], streakSummary = {}, isPreview = false }) {
  const events = Array.isArray(statsState.events) ? statsState.events : [];

  // Filter events by target year
  const yearEvents = events.filter(e => {
    const y = e.year || (e.date ? parseInt(e.date.split('-')[0], 10) : new Date(e.timestamp).getFullYear());
    return y === targetYear;
  });

  // 1. Most cooked recipes
  const cookedCountMap = new Map();
  yearEvents
    .filter(e => e.type === EVENT_TYPES.RECIPE_COOKED && e.recipeId)
    .forEach(e => {
      const prev = cookedCountMap.get(e.recipeId) || { count: 0, title: e.recipeTitle || 'Rezept', recipeId: e.recipeId };
      prev.count += 1;
      if (e.recipeTitle) prev.title = e.recipeTitle;
      cookedCountMap.set(e.recipeId, prev);
    });

  const topCookedRecipes = Array.from(cookedCountMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalCookedCount = Array.from(cookedCountMap.values()).reduce((sum, r) => sum + r.count, 0);

  // 2. Shopping products added (manual vs auto)
  const shoppingProductMap = new Map();
  let manualShoppingCount = 0;
  let autoShoppingCount = 0;

  yearEvents
    .filter(e => e.type === EVENT_TYPES.SHOPPING_ADD)
    .forEach(e => {
      const isManual = e.source === 'manual';
      if (isManual) manualShoppingCount++;
      else autoShoppingCount++;

      const key = e.productName || e.productId || 'Unbenannt';
      const prev = shoppingProductMap.get(key) || { name: key, count: 0, icon: e.icon || 'Package' };
      prev.count += 1;
      shoppingProductMap.set(key, prev);
    });

  const topShoppingProducts = Array.from(shoppingProductMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 3. Active cooking & planning months
  const monthlyActivity = Array(12).fill(0);
  yearEvents.forEach(e => {
    const m = e.month || (e.date ? parseInt(e.date.split('-')[1], 10) : new Date(e.timestamp).getMonth() + 1);
    if (m >= 1 && m <= 12) {
      monthlyActivity[m - 1]++;
    }
  });

  const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const monthBreakdown = monthNames.map((name, idx) => ({ name, count: monthlyActivity[idx] }));
  const mostActiveMonthIdx = monthlyActivity.indexOf(Math.max(...monthlyActivity));
  const mostActiveMonth = monthlyActivity[mostActiveMonthIdx] > 0 ? monthNames[mostActiveMonthIdx] : null;

  // 4. Recipes created in target year
  const newRecipesInYear = recipes.filter(r => {
    if (!r.createdAt) return false;
    const y = new Date(r.createdAt).getFullYear();
    return y === targetYear;
  });

  // 5. Title word frequency: (A) in recipe catalog vs (B) weighted by cooking frequency
  const catalogWordMap = new Map();
  recipes.forEach(r => {
    const words = extractMeaningfulWords(r.title);
    words.forEach(w => catalogWordMap.set(w, (catalogWordMap.get(w) || 0) + 1));
  });

  const cookedWordMap = new Map();
  topCookedRecipes.forEach(r => {
    const words = extractMeaningfulWords(r.title);
    words.forEach(w => cookedWordMap.set(w, (cookedWordMap.get(w) || 0) + r.count));
  });

  const topCatalogWords = Array.from(catalogWordMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }));

  const topCookedWords = Array.from(cookedWordMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }));

  return {
    targetYear,
    isPreview,
    startDate: statsState.startedAt || `${targetYear}-01-01`,
    totalCookedCount,
    topCookedRecipes,
    topShoppingProducts,
    shoppingCounts: {
      manual: manualShoppingCount,
      auto: autoShoppingCount,
      total: manualShoppingCount + autoShoppingCount
    },
    monthBreakdown,
    mostActiveMonth,
    newRecipesCount: newRecipesInYear.length,
    topCatalogWords,
    topCookedWords,
    streakHighlights: {
      currentStreak: streakSummary.currentStreak || 0,
      longestStreak: streakSummary.longestStreak || 0,
      totalActiveDays: streakSummary.totalActiveDays || 0,
    }
  };
}
