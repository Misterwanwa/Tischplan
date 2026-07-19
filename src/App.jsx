import React, { useState, useEffect, useMemo, useContext, createContext, useRef, useCallback } from 'react';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, X, Search, ShoppingCart, BookOpen,
  Settings as SettingsIcon, Camera, Upload, Sparkles, Trash2, Edit2, Check,
  AlertTriangle, Utensils, Coffee, Cookie, Cake, Sun, Moon, Loader2, ExternalLink,
  Copy, Printer, User, Users, Star, Save, Download, Bell,
} from 'lucide-react';

/* ---------------------------------- Design tokens ---------------------------------- */
const inputCls = "w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-1 focus:ring-stone-900 bg-white";
const labelCls = "font-mono uppercase tracking-wide text-xs text-stone-400";
const primaryBtnCls = "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-stone-900 text-white font-mono uppercase tracking-wide text-xs font-semibold disabled:opacity-40 active:scale-[0.99]";
const secondaryBtnCls = "w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-stone-300 text-stone-700 text-sm font-medium active:scale-[0.99]";
const cardCls = "bg-white rounded-xl border border-stone-200 p-4";

/* ---------------------------------- Constants ---------------------------------- */
const MEAL_TIMES = [
  { key: 'breakfast', label: 'Frühstück', icon: Coffee, color: 'bg-amber-600', dot: 'bg-amber-500' },
  { key: 'lunch', label: 'Mittagessen', icon: Sun, color: 'bg-emerald-700', dot: 'bg-emerald-600' },
  { key: 'dinner', label: 'Abendessen', icon: Moon, color: 'bg-indigo-700', dot: 'bg-indigo-600' },
];
const COURSES = [
  { key: 'snack', label: 'Snack', icon: Cookie },
  { key: 'main', label: 'Hauptspeise', icon: Utensils },
  { key: 'dessert', label: 'Nachspeise', icon: Cake },
];
const COURSE_KEYS = COURSES.map(c => c.key);
const MEAL_KEYS = MEAL_TIMES.map(m => m.key);
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const LONG_WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const KNOWN_UNITS = ['g', 'kg', 'ml', 'l', 'el', 'tl', 'stück', 'stk', 'prise', 'tasse', 'becher', 'dose', 'packung', 'pck', 'bund', 'zehe', 'zehen', 'scheibe', 'scheiben', 'msp', 'handvoll'];
const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat'];
const NUTRIENT_LABELS = { kcal: 'kcal', protein: 'Eiweiß', carbs: 'Kohlenh.', fat: 'Fett' };

const DEFAULT_SETTINGS = {
  people: [
    { name: 'Person 1', targets: { kcal: 2000, protein: 80, carbs: 250, fat: 70 } },
    { name: 'Person 2', targets: { kcal: 2000, protein: 80, carbs: 250, fat: 70 } },
  ],
  cookbooks: [],
  coverTitle: 'Unser Kochbuch',
  cookbookVolumes: [],
  defaultCalendarView: 'week',
  showNextMonday: false,
  aiProvider: 'gemini',
  notificationEnabled: false,
  notificationDay: 1, // 1 = Montag
  notificationTime: '18:00',
  snoozedUntil: null,
  lastNotifiedAt: null,
  cookbookSort: 'date-desc',
};

/* ---------------------------------- Helpers ---------------------------------- */
function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayKey() { return dateKey(new Date()); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function formatLongDate(dk) {
  const [y, m, d] = dk.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${LONG_WEEKDAYS[date.getDay()]}, ${d}. ${MONTHS[m - 1]} ${y}`;
}

function emptyDayPlan() {
  const p = {};
  for (const mt of MEAL_KEYS) p[mt] = { snack: null, main: null, dessert: null };
  return p;
}

function mealTimeCounts(plan) {
  const counts = {};
  for (const mt of MEAL_KEYS) counts[mt] = COURSE_KEYS.filter(co => plan[mt] && plan[mt][co]).length;
  return counts;
}

function parseIngredientLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/\s+/);
  let amount = null, unit = '', nameTokens = tokens;
  const numToken = tokens[0] ? tokens[0].replace(',', '.') : '';
  if (/^\d+(\.\d+)?$/.test(numToken)) {
    amount = parseFloat(numToken);
    nameTokens = tokens.slice(1);
    if (nameTokens[0] && KNOWN_UNITS.includes(nameTokens[0].toLowerCase())) {
      unit = nameTokens[0];
      nameTokens = nameTokens.slice(1);
    }
  }
  return { amount, unit, name: nameTokens.join(' ') || trimmed, raw: trimmed };
}
function parseIngredientsText(text) {
  return text.split('\n').map(parseIngredientLine).filter(Boolean);
}
function ingredientsToText(ings) {
  return (ings || []).map(i => i.raw || [i.amount, i.unit, i.name].filter(x => x !== null && x !== '' && x !== undefined).join(' ')).join('\n');
}

async function resizeImage(file, maxDim = 700, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function extractRecipeFromHtml(html, url) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    let title = '';
    let servings = 4;
    let ingredients = [];
    let steps = [];
    let nutrition = null;

    const cleanText = (t) => t ? t.replace(/\s+/g, ' ').trim() : '';

    // --- STAGE 1: JSON-LD ---
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const json = JSON.parse(script.textContent);
        
        const findRecipe = (obj) => {
          if (!obj) return null;
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const found = findRecipe(item);
              if (found) return found;
            }
          } else if (typeof obj === 'object') {
            if (obj['@type'] === 'Recipe' || (Array.isArray(obj['@type']) && obj['@type'].includes('Recipe'))) {
              return obj;
            }
            if (obj['@graph']) {
              return findRecipe(obj['@graph']);
            }
          }
          return null;
        };

        const recipeObj = findRecipe(json);
        if (recipeObj) {
          title = cleanText(recipeObj.name || recipeObj.headline);
          
          if (recipeObj.recipeYield) {
            const yieldStr = Array.isArray(recipeObj.recipeYield) ? recipeObj.recipeYield[0] : String(recipeObj.recipeYield);
            const num = parseInt(yieldStr.match(/\d+/)?.[0] || '4');
            servings = num;
          }

          if (recipeObj.recipeIngredient) {
            ingredients = recipeObj.recipeIngredient.map(cleanText).filter(Boolean);
          }

          if (recipeObj.recipeInstructions) {
            const parseInstructions = (instructions) => {
              if (Array.isArray(instructions)) {
                return instructions.map(inst => {
                  if (typeof inst === 'string') return cleanText(inst);
                  if (inst.text) return cleanText(inst.text);
                  if (inst.itemListElement) return parseInstructions(inst.itemListElement);
                  return '';
                }).flat().filter(Boolean);
              } else if (typeof instructions === 'string') {
                return [cleanText(instructions)];
              } else if (typeof instructions === 'object') {
                if (instructions.text) return [cleanText(instructions.text)];
                if (instructions.itemListElement) return parseInstructions(instructions.itemListElement);
              }
              return [];
            };
            steps = parseInstructions(recipeObj.recipeInstructions);
          }

          if (recipeObj.nutrition) {
            const nut = recipeObj.nutrition;
            nutrition = {
              kcal: parseInt(nut.calories || nut.caloriesContent || '0') || 0,
              protein: parseInt(nut.proteinContent || '0') || 0,
              carbs: parseInt(nut.carbohydrateContent || '0') || 0,
              fat: parseInt(nut.fatContent || '0') || 0
            };
          }

          if (ingredients.length >= 3) {
            return { title, servings, ingredients, steps, nutrition, sourceUrl: url };
          }
        }
      } catch (e) {
        console.warn('Error parsing JSON-LD script', e);
      }
    }

    // --- STAGE 2: OpenGraph + Microdata ---
    const ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) title = cleanText(ogTitle.getAttribute('content'));
    if (!title) {
      const h1 = doc.querySelector('h1');
      if (h1) title = cleanText(h1.textContent);
    }

    const itemPropIngs = doc.querySelectorAll('[itemprop="recipeIngredient"]');
    if (itemPropIngs.length > 0) {
      ingredients = Array.from(itemPropIngs).map(el => cleanText(el.textContent)).filter(Boolean);
    }

    const itemPropSteps = doc.querySelectorAll('[itemprop="recipeInstructions"]');
    if (itemPropSteps.length > 0) {
      steps = Array.from(itemPropSteps).map(el => cleanText(el.textContent)).filter(Boolean);
    }

    if (ingredients.length >= 3 && steps.length >= 2) {
      return { title, servings, ingredients, steps, nutrition, sourceUrl: url };
    }

    // --- STAGE 3: Heuristic Scraping ---
    const keywordsIng = ['zutaten', 'ingredients', 'einkaufszettel', 'was du brauchst'];
    const keywordsStep = ['zubereitung', 'instructions', 'schritte', 'zubereiten', 'anleitung', 'directions'];

    const allHeaders = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div'));
    
    const findListsNearKeywords = (keywords) => {
      let longestList = [];
      for (const el of allHeaders) {
        const text = el.textContent.toLowerCase();
        if (keywords.some(kw => text.includes(kw))) {
          let current = el.nextElementSibling;
          let searchCount = 0;
          while (current && searchCount < 4) {
            const uls = current.tagName === 'UL' || current.tagName === 'OL' ? [current] : Array.from(current.querySelectorAll('ul, ol'));
            for (const ul of uls) {
              const items = Array.from(ul.querySelectorAll('li')).map(li => cleanText(li.textContent)).filter(Boolean);
              if (items.length > longestList.length) {
                longestList = items;
              }
            }
            if (longestList.length === 0) {
              const paragraphs = Array.from(current.querySelectorAll('p, div.step, div.ingredient')).map(p => cleanText(p.textContent)).filter(p => p.length > 5);
              if (paragraphs.length > longestList.length) {
                longestList = paragraphs;
              }
            }
            current = current.nextElementSibling;
            searchCount++;
          }
        }
      }
      return longestList;
    };

    if (ingredients.length < 3) {
      ingredients = findListsNearKeywords(keywordsIng);
    }
    if (steps.length < 2) {
      steps = findListsNearKeywords(keywordsStep);
    }

    return {
      title: title || doc.title || 'Rezept',
      servings,
      ingredients,
      steps,
      nutrition,
      sourceUrl: url
    };
  } catch (e) {
    console.error('Error in extractRecipeFromHtml:', e);
    return null;
  }
}

async function callAI(prompt, useSearch = false, provider = 'gemini') {
  let activeProvider = provider;
  try {
    const savedSettings = localStorage.getItem('shared_settings') || localStorage.getItem('settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      if (parsed.value) {
        const valObj = typeof parsed.value === 'string' ? JSON.parse(parsed.value) : parsed.value;
        if (valObj && valObj.aiProvider) activeProvider = valObj.aiProvider;
      } else if (parsed && parsed.aiProvider) {
        activeProvider = parsed.aiProvider;
      }
    }
  } catch (err) {}

  const LOG_GROUP = `[AI-Call] ${new Date().toISOString()}`;
  console.group(LOG_GROUP);
  console.log('Provider:', activeProvider);
  console.log('Prompt (erste 200 Zeichen):', prompt.slice(0, 200));
  console.log('Web Search aktiv:', useSearch);
  
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: activeProvider, prompt, useSearch }),
    });
    
    if (!res.ok) {
      const errBody = await res.text().catch(() => 'Kein Error-Body');
      console.error('HTTP-Fehler:', res.status, res.statusText, errBody);
      throw new Error(`AI-Worker HTTP ${res.status}: ${errBody.slice(0, 100)}`);
    }
    
    const { text, error } = await res.json();
    
    if (error) {
      console.error('Worker-Fehler:', error);
      throw new Error(error);
    }
    
    console.log('Antwort (erste 300 Zeichen):', text?.slice(0, 300));
    
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1) {
      console.error('Kein JSON in Antwort gefunden. Vollständiger Text:', text);
      throw new Error('Keine JSON-Antwort erhalten');
    }
    
    const parsed = JSON.parse(text.slice(first, last + 1));
    console.log('Geparste Felder:', Object.keys(parsed));
    console.groupEnd();
    return parsed;
    
  } catch (e) {
    console.error('callAI fehlgeschlagen:', e.name, e.message);
    console.groupEnd();
    throw e;
  }
}

const RECIPE_JSON_SCHEMA = '{"title": "...", "servings": Zahl, "ingredients": ["Menge Einheit Zutat", ...], "steps": ["Schritt 1", "Schritt 2", ...], "sourceUrl": "...", "nutrition": {"kcal": Zahl, "protein": Zahl, "carbs": Zahl, "fat": Zahl}}';

async function estimateNutrition(ingredientsText, servings) {
  const prompt = `Schätze die Nährwerte PRO PORTION für ein Rezept mit ${servings} Portionen. Zutaten:\n${ingredientsText}\n\nAntworte NUR mit JSON, ohne weiteren Text, im Format: {"kcal": Zahl, "protein": Zahl, "carbs": Zahl, "fat": Zahl}`;
  return callAI(prompt, false);
}
async function searchRecipeOnline(query) {
  const prompt = `Suche im Web nach einem echten, existierenden Rezept für "${query}". Antworte NUR mit JSON, ohne weiteren Text, im Format: ${RECIPE_JSON_SCHEMA}. Halte "steps" kurz und knapp (max. 8 Schritte). "nutrition" = Schätzung pro Portion.`;
  return callAI(prompt, true);
}
async function extractRecipeFromUrl(url) {
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
  const html = await fetch(proxyUrl).then(r => r.text());
  
  const scraped = extractRecipeFromHtml(html, url);
  if (scraped && scraped.ingredients.length >= 3 && scraped.steps.length >= 2) {
    return scraped;
  }
  
  return callAI(
    `Extrahiere das Rezept aus dieser URL: ${url}\n\nHTML-Snippet (erste 8000 Zeichen):\n${html.slice(0, 8000)}\n\nAntworte NUR mit JSON im Format: ${RECIPE_JSON_SCHEMA}`,
    true
  );
}
async function searchRecipeOnSite(domain, query) {
  const prompt = `Suche auf der Website ${domain} (site:${domain}) nach einem passenden Rezept: ${query}. Antworte NUR mit JSON, ohne weiteren Text, im Format: ${RECIPE_JSON_SCHEMA}. Halte "steps" kurz (max. 8 Schritte). "nutrition" = Schätzung pro Portion.`;
  return callAI(prompt, true);
}
function buildRecipeFromExtraction(result, source) {
  if (!result) return { title: 'Unbekanntes Rezept', servings: 1, ingredients: [], steps: [], nutrition: null, photo: null, source };
  return {
    title: result.title || 'Rezept',
    servings: result.servings || 1,
    ingredients: parseIngredientsText((result.ingredients || []).join('\n')),
    steps: result.steps || [],
    nutrition: result.nutrition ? {
      kcal: Math.round(result.nutrition.kcal) || 0, protein: Math.round(result.nutrition.protein) || 0,
      carbs: Math.round(result.nutrition.carbs) || 0, fat: Math.round(result.nutrition.fat) || 0,
    } : null,
    photo: null,
    source,
  };
}

function getRecipePreview(recipe) {
  if (!recipe) return null;
  if (recipe.photo) return recipe.photo;
  if (recipe.source && typeof recipe.source.url === 'string' && recipe.source.url.trim() !== '') {
    return `https://image.thum.io/get/width/400/crop/800/${recipe.source.url.trim()}`;
  }
  return null;
}


async function storageGet(key, shared, fallback) {
  try {
    if (window.storage && typeof window.storage.get === 'function') {
      const r = await window.storage.get(key, shared);
      return r ? JSON.parse(r.value) : fallback;
    }
    if (shared) {
      try {
        const res = await fetch(`/api/storage?key=${encodeURIComponent(key)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && 'value' in data && data.value !== null) {
            localStorage.setItem(`shared_${key}`, JSON.stringify(data.value));
            return data.value;
          }
        }
      } catch (apiError) {
        console.warn('KV storage get failed, falling back to local cache:', apiError);
      }
      const cachedVal = localStorage.getItem(`shared_${key}`);
      if (cachedVal !== null) return JSON.parse(cachedVal);
    }
    const localVal = localStorage.getItem(key);
    return localVal ? JSON.parse(localVal) : fallback;
  } catch (e) { return fallback; }
}
async function storageSet(key, value, shared) {
  try {
    if (window.storage && typeof window.storage.set === 'function') {
      await window.storage.set(key, JSON.stringify(value), shared);
      return;
    }
    if (shared) {
      localStorage.setItem(`shared_${key}`, JSON.stringify(value));
      try {
        const res = await fetch('/api/storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value })
        });
        if (res.ok) return;
      } catch (apiError) {
        console.warn('KV storage set failed, stored locally in cache:', apiError);
      }
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }
  catch (e) { console.error('storage set failed', key, e); }
}

function aggregateIngredients(usageList) {
  const map = new Map();
  for (const { recipe, multiplier } of usageList) {
    for (const ing of recipe.ingredients || []) {
      const nameKey = (ing.name || ing.raw || '').toLowerCase().trim();
      const unitKey = (ing.unit || '').toLowerCase().trim();
      const key = nameKey + '|' + unitKey;
      const amt = ing.amount != null ? ing.amount * multiplier : null;
      if (map.has(key)) {
        const ex = map.get(key);
        if (amt != null) ex.amount = (ex.amount || 0) + amt;
      } else {
        map.set(key, { name: ing.name || ing.raw, unit: ing.unit, amount: amt });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

function computeDayNutrition(plan, recipes) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const mt of MEAL_KEYS) for (const co of COURSE_KEYS) {
    const slot = plan[mt] && plan[mt][co];
    if (!slot) continue;
    const recipe = recipes.find(r => r.id === slot.recipeId);
    if (!recipe || !recipe.nutrition) continue;
    for (const k of NUTRIENT_KEYS) totals[k] += (recipe.nutrition[k] || 0) * slot.multiplier;
  }
  return totals;
}

function getMonday(d) {
  const dow = (d.getDay() + 6) % 7;
  const m = new Date(d); m.setDate(d.getDate() - dow); m.setHours(0, 0, 0, 0);
  return m;
}
function getNextWeekMonday() {
  const m = getMonday(new Date()); m.setDate(m.getDate() + 7);
  return m;
}
function weekDatesFrom(monday, showNextMonday) {
  const arr = [];
  const count = showNextMonday ? 8 : 7;
  for (let i = 0; i < count; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); arr.push(d); }
  return arr;
}
function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return null; }
}
function looksLikeRecipePage(link) {
  const t = (link.title + ' ' + link.url).toLowerCase();
  let pathDepth = 0;
  try { pathDepth = new URL(link.url).pathname.split('/').filter(Boolean).length; } catch (e) { }
  return /rezept|recipe/.test(t) || pathDepth >= 2;
}
function pickSiteDomains(bookmarks, n) {
  n = n || 2;
  const counts = new Map();
  for (const b of bookmarks) {
    const h = hostnameOf(b.url);
    if (!h) continue;
    counts.set(h, (counts.get(h) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, n);
}
function averageTargets(people) {
  const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const p of people) for (const k of NUTRIENT_KEYS) sum[k] += (p.targets[k] || 0);
  const n = people.length || 1;
  const avg = {}; for (const k of NUTRIENT_KEYS) avg[k] = sum[k] / n;
  return avg;
}
function currentOpenVolume(settings) {
  const vols = settings.cookbookVolumes || [];
  return vols.find(v => !v.closedAt) || vols[0];
}
async function parseBookmarksFile(file) {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const anchors = Array.from(doc.querySelectorAll('a'));
  return anchors.map(a => ({ title: a.textContent.trim() || a.getAttribute('href'), url: a.getAttribute('href') })).filter(l => l.url && l.url.startsWith('http'));
}

/* ---------------------------------- Long Press Hook ---------------------------------- */
function useLongPress(onLongPress, onClick, delay = 500) {
  const timeoutRef = useRef(null);
  const isLongPressRef = useRef(false);
  const startCoordsRef = useRef({ x: 0, y: 0 });

  const start = (e) => {
    isLongPressRef.current = false;
    const touch = e.touches ? e.touches[0] : e;
    startCoordsRef.current = { x: touch.clientX, y: touch.clientY };

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      onLongPress(e);
      isLongPressRef.current = true;
    }, delay);
  };

  const move = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - startCoordsRef.current.x;
    const dy = touch.clientY - startCoordsRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 15) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  };

  const cancel = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleClick = (e) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (isLongPressRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isLongPressRef.current = false;
      return;
    }
    if (onClick) {
      onClick(e);
    }
  };

  return {
    onMouseDown: start,
    onMouseMove: move,
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onClick: handleClick,
  };
}

/* ---------------------------------- Context ---------------------------------- */
const AppCtx = createContext(null);
function useApp() { return useContext(AppCtx); }

/* ---------------------------------- Small shared components ---------------------------------- */
function LoadingScreen() {
  return <div className="min-h-screen bg-stone-100 flex items-center justify-center"><Loader2 className="animate-spin text-stone-400" size={26} /></div>;
}
function Toast({ toast }) {
  return (
    <div className={`fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm text-white z-50 shadow-lg ${toast.type === 'error' ? 'bg-rose-600' : 'bg-stone-900'}`}>
      {toast.msg}
    </div>
  );
}
function NutritionInput({ label, value, onChange }) {
  return (
    <div>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-stone-300 text-sm text-center focus:outline-none focus:ring-1 focus:ring-stone-900" />
      <div className="text-xs text-stone-400 text-center mt-0.5 font-mono">{label}</div>
    </div>
  );
}
function NutrientBar({ label, value, target, unit }) {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const off = pct < 80 || pct > 120;
  const barColor = pct < 80 ? 'bg-sky-400' : pct > 120 ? 'bg-rose-400' : 'bg-emerald-500';
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-xs text-stone-500 mb-0.5">
        <span className="flex items-center gap-1">{label}{off && <AlertTriangle size={11} className="text-rose-500" />}</span>
        <span className="font-mono">{Math.round(value)} / {Math.round(target)} {unit}</span>
      </div>
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
function NutritionSummary({ totals, people }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {people.map((p, i) => (
        <div key={i} className={cardCls}>
          <div className="text-sm font-semibold text-stone-700 mb-2 font-mono">{p.name}</div>
          <NutrientBar label="Kalorien" value={totals.kcal} target={p.targets.kcal} unit="kcal" />
          <NutrientBar label="Eiweiß" value={totals.protein} target={p.targets.protein} unit="g" />
          <NutrientBar label="Kohlenhydrate" value={totals.carbs} target={p.targets.carbs} unit="g" />
          <NutrientBar label="Fett" value={totals.fat} target={p.targets.fat} unit="g" />
        </div>
      ))}
    </div>
  );
}
function StarRating({ value, onChange, size }) {
  const s = size || 16;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={(e) => { e.stopPropagation(); onChange(value === n ? null : n); }} className="p-0">
          <Star size={s} className={(value || 0) >= n ? 'fill-amber-500 text-amber-500' : 'text-stone-300'} />
        </button>
      ))}
    </div>
  );
}
function RemoveButton({ onConfirm, size }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (confirming) { const t = setTimeout(() => setConfirming(false), 3000); return () => clearTimeout(t); } }, [confirming]);
  return confirming ? (
    <button type="button" onClick={(e) => { e.stopPropagation(); onConfirm(); }} className="p-1.5 text-rose-600 flex-shrink-0"><Trash2 size={size || 16} /></button>
  ) : (
    <button type="button" onClick={(e) => { e.stopPropagation(); setConfirming(true); }} className="p-1.5 text-stone-300 hover:text-stone-500 flex-shrink-0"><Trash2 size={size || 16} /></button>
  );
}

/* ---------------------------------- Chrome ---------------------------------- */
function TopBar() {
  const { settings, profile, setProfile } = useApp();
  return (
    <div className="bg-white border-b border-stone-200 no-print sticky top-0 z-30">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <span className="font-mono text-lg font-bold tracking-tight text-stone-900">KARTEI</span>
        <button
          onClick={() => setProfile(null)}
          className="text-xs px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 rounded-full flex items-center gap-1 font-mono transition-colors active:scale-95"
          title="Benutzer wechseln"
        >
          <User size={11} /> {settings.people[profile.personIndex] && settings.people[profile.personIndex].name}
        </button>
      </div>
    </div>
  );
}
function BottomNav({ tab, setTab }) {
  const items = [
    { key: 'calendar', label: 'Plan', icon: Calendar },
    { key: 'recipes', label: 'Rezepte', icon: Utensils },
    { key: 'shopping', label: 'Liste', icon: ShoppingCart },
    { key: 'cookbook', label: 'Buch', icon: BookOpen },
    { key: 'settings', label: 'Einstellungen', icon: SettingsIcon },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 no-print z-30">
      <div className="max-w-2xl mx-auto grid grid-cols-5">
        {items.map(it => (
          <button key={it.key} onClick={() => setTab(it.key)} className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-mono ${tab === it.key ? 'text-stone-900' : 'text-stone-400'}`}>
            <it.icon size={19} />{it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Profile picker (first run) ---------------------------------- */
function ProfilePicker({ settings, onChoose, onUpdateSettings }) {
  const [names, setNames] = useState(settings.people.map(p => p.name));
  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white rounded-xl border border-stone-200 p-6 text-center">
        <div className="w-12 h-12 rounded-lg bg-stone-900 text-white flex items-center justify-center mx-auto mb-3"><Utensils size={20} /></div>
        <div className="font-mono text-xl font-bold tracking-tight mb-1">KARTEI</div>
        <p className="text-sm text-stone-500 mb-4">Wer nutzt dieses Gerät?</p>
        <div className="space-y-2 text-left">
          {names.map((n, i) => (
            <div key={i} className="flex gap-2">
              <input value={n} onChange={e => { const next = [...names]; next[i] = e.target.value; setNames(next); }} className={inputCls} />
              <button onClick={async () => {
                const people = settings.people.map((p, idx) => ({ ...p, name: names[idx] || p.name }));
                await onUpdateSettings({ people });
                onChoose(i);
              }} className="px-3 rounded-lg bg-stone-900 text-white font-mono uppercase tracking-wide text-xs font-semibold whitespace-nowrap">Das bin ich</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Calendar tab ---------------------------------- */
function MonthGrid({ viewDate, setViewDate, selectedDay, setSelectedDay }) {
  const { mealplanIndex } = useApp();
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-stone-100 rounded-lg"><ChevronLeft size={18} /></button>
        <span className="font-mono font-semibold tracking-tight">{MONTHS[month].toUpperCase()} {year}</span>
        <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-stone-100 rounded-lg"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-stone-400 mb-1 font-mono">
        {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = dateKey(d);
          const isSelected = key === selectedDay;
          const isToday = key === todayKey();
          const entry = mealplanIndex[key];
          return (
            <button key={i} onClick={() => setSelectedDay(key)}
              className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm relative ${isSelected ? 'bg-stone-900 text-white' : isToday ? 'bg-stone-200 text-stone-900 font-semibold' : 'hover:bg-stone-100 text-stone-700'}`}>
              {d.getDate()}
              {entry && (
                <div className="flex justify-center mt-0.5 h-1">
                  <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-stone-300' : 'bg-stone-400'}`} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SlotRow({ course, recipe, multiplier, onPick, onRemove, onMultiplier, onClickRecipe, onLongPressRecipe }) {
  const [localVal, setLocalVal] = useState(String(multiplier));

  useEffect(() => {
    setLocalVal(String(multiplier));
  }, [multiplier]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setLocalVal(val);
    if (val === '') return;
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      onMultiplier(parsed);
    }
  };

  const longPressHandlers = useLongPress(
    () => {
      if (onLongPressRecipe) onLongPressRecipe();
    },
    () => {
      if (onClickRecipe) onClickRecipe();
    }
  );

  if (!recipe) {
    return (
      <button onClick={onPick} className="w-full flex items-center gap-2 p-3 rounded-lg border border-dashed border-stone-300 text-stone-400 hover:border-stone-500 hover:text-stone-700 text-sm">
        <course.icon size={16} /> <span className="flex-1 text-left">{course.label}</span> <Plus size={16} />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-stone-50 border border-stone-200">
      <div {...longPressHandlers} className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer hover:opacity-80">
        {getRecipePreview(recipe) ? <img src={getRecipePreview(recipe)} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-stone-200 flex items-center justify-center flex-shrink-0"><course.icon size={16} className="text-stone-400" /></div>}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-stone-400 font-mono uppercase flex items-center gap-1">
            {course.label}{recipe.placeholder && <span className="text-amber-600">· ausfüllen</span>}
          </div>
          <div className="text-sm font-medium truncate">{recipe.title}</div>
        </div>
      </div>
      <input type="number" step="0.5" min="0.1" value={localVal} onChange={handleInputChange} className="w-14 text-center text-sm border border-stone-300 rounded-lg py-1 focus:outline-none focus:ring-1 focus:ring-stone-900" />
      <button onClick={onRemove} className="p-1.5 text-stone-400 hover:text-rose-500 flex-shrink-0"><X size={16} /></button>
    </div>
  );
}

function RecipePickerSheet({ onClose, onPick }) {
  const { recipes, openAddRecipe } = useApp();
  const [query, setQuery] = useState('');
  const filtered = recipes.filter(r => !r.doNotSaveInBook).filter(r => r.title.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-full flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <span className="font-mono font-semibold uppercase tracking-wide text-sm">Rezept wählen</span>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="p-3 flex-shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rezept suchen..." className={inputCls + " pl-9"} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 space-y-1 min-h-0">
          {filtered.map(r => (
            <button key={r.id} onClick={() => onPick(r.id)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-stone-50 text-left">
              {getRecipePreview(r) ? <img src={getRecipePreview(r)} className="w-9 h-9 rounded-lg object-cover" /> : <div className="w-9 h-9 rounded-lg bg-stone-100" />}
              <span className="text-sm">{r.title}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="text-center text-sm text-stone-400 py-6">Keine Rezepte gefunden</div>}
        </div>
        <div className="p-3 border-t border-stone-200 flex-shrink-0">
          <button onClick={() => { onClose(); openAddRecipe({ onSaved: (r) => onPick(r.id) }); }} className={primaryBtnCls}>
            <Plus size={14} /> Neues Rezept
          </button>
        </div>
      </div>
    </div>
  );
}

function DayDetail({ plan, onChange, selectedDay }) {
  const { recipes, settings, openRecipeDetail, openMoveMeal } = useApp();
  const [pickerSlot, setPickerSlot] = useState(null);

  const setSlot = (meal, course, recipeId, multiplier) => {
    const next = { ...plan, [meal]: { ...plan[meal], [course]: recipeId ? { recipeId, multiplier: multiplier || 1 } : null } };
    onChange(next);
  };
  const totals = useMemo(() => computeDayNutrition(plan, recipes), [plan, recipes]);

  return (
    <div className="space-y-3">
      <NutritionSummary totals={totals} people={settings.people} />
      {MEAL_TIMES.map(mt => (
        <div key={mt.key} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className={`px-3 py-1.5 inline-flex items-center gap-1.5 rounded-br-xl text-white text-xs font-mono uppercase tracking-wider ${mt.color}`}>
            <mt.icon size={12} /> {mt.label}
          </div>
          <div className="p-3 pt-2.5 space-y-2">
            {COURSES.map(co => {
              const slot = plan[mt.key] && plan[mt.key][co.key];
              const recipe = slot ? recipes.find(r => r.id === slot.recipeId) : null;
              return (
                <SlotRow key={co.key} course={co} recipe={recipe} multiplier={slot ? slot.multiplier : 1}
                  onPick={() => setPickerSlot({ meal: mt.key, course: co.key })}
                  onRemove={() => setSlot(mt.key, co.key, null)}
                  onMultiplier={(m) => setSlot(mt.key, co.key, slot.recipeId, m)}
                  onClickRecipe={() => recipe && openRecipeDetail({ recipe, multiplier: slot ? slot.multiplier : 1 })}
                  onLongPressRecipe={() => slot && openMoveMeal({ sourceDate: selectedDay, mealKey: mt.key, courseKey: co.key, recipeId: slot.recipeId, multiplier: slot.multiplier })}
                />
              );
            })}
          </div>
        </div>
      ))}
      {pickerSlot && (
        <RecipePickerSheet
          onClose={() => setPickerSlot(null)}
          onPick={(recipeId) => { setSlot(pickerSlot.meal, pickerSlot.course, recipeId, 1); setPickerSlot(null); }}
        />
      )}
    </div>
  );
}

function PlannedMealItem({ meal, course, slot, recipe, onLongPressRecipe, onClickRecipe }) {
  const longPressHandlers = useLongPress(
    () => {
      if (onLongPressRecipe) onLongPressRecipe();
    },
    () => {
      if (onClickRecipe) onClickRecipe();
    }
  );

  const preview = getRecipePreview(recipe);
  return (
    <div 
      {...longPressHandlers}
      className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-200/60 cursor-pointer hover:border-stone-400 hover:bg-stone-100/50 transition-colors"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {preview ? (
          <img src={preview} className="w-10 h-10 rounded-md object-cover flex-shrink-0 border border-stone-200" alt="" />
        ) : (
          <div className="w-10 h-10 rounded-md bg-stone-200/70 flex items-center justify-center flex-shrink-0">
            <course.icon size={14} className="text-stone-400" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[10px] text-stone-400 font-mono uppercase tracking-wider flex items-center gap-1">
            {meal.label} ({course.label})
          </div>
          <div className="text-sm font-medium text-stone-800 truncate">{recipe.title}</div>
        </div>
      </div>
      {slot.multiplier !== 1 && (
        <span className="text-xs font-mono text-stone-500 bg-stone-200/80 px-2 py-0.5 rounded ml-2 flex-shrink-0">
          x{slot.multiplier}
        </span>
      )}
    </div>
  );
}

function WeekAddMealModal({ date, onClose }) {
  const { recipes, getDayPlan, saveDayPlan, triggerRefresh, openAddRecipe } = useApp();
  const [selectedMeal, setSelectedMeal] = useState('dinner');
  const [selectedCourse, setSelectedCourse] = useState('main');
  const [query, setQuery] = useState('');
  const [overwriteTarget, setOverwriteTarget] = useState(null);

  const formattedDate = formatLongDate(dateKey(date));
  const filtered = recipes.filter(r => !r.doNotSaveInBook).filter(r => r.title.toLowerCase().includes(query.toLowerCase()));

  const handlePick = async (recipeId) => {
    const dk = dateKey(date);
    const plan = await getDayPlan(dk);
    const existingSlot = plan[selectedMeal] && plan[selectedMeal][selectedCourse];
    if (existingSlot) {
      const existingRecipe = recipes.find(r => r.id === existingSlot.recipeId);
      const existingTitle = existingRecipe ? existingRecipe.title : 'Unbekanntes Rezept';
      setOverwriteTarget({ recipeId, existingTitle, plan });
    } else {
      await executeSave(recipeId, plan);
    }
  };

  const executeSave = async (recipeId, plan) => {
    const dk = dateKey(date);
    const next = { 
      ...plan, 
      [selectedMeal]: { 
        ...plan[selectedMeal], 
        [selectedCourse]: { recipeId, multiplier: 1 } 
      } 
    };
    await saveDayPlan(dk, next);
    triggerRefresh();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 animate-fade-in" onClick={onClose}>
        <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="p-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
            <div>
              <span className="font-mono font-semibold uppercase tracking-wide text-sm block">Gericht hinzufügen</span>
              <span className="text-xs text-stone-400 font-mono">{formattedDate}</span>
            </div>
            <button onClick={onClose} className="text-stone-450 hover:text-stone-750 transition-colors"><X size={20} /></button>
          </div>
          <div className="p-3 border-b border-stone-100 flex-shrink-0 space-y-3">
            <div>
              <label className={labelCls + " mb-1 block"}>Mahlzeit</label>
              <div className="grid grid-cols-3 gap-2">
                {MEAL_TIMES.map(mt => (
                  <button
                    key={mt.key}
                    type="button"
                    onClick={() => setSelectedMeal(mt.key)}
                    className={`py-1.5 rounded-lg text-xs font-semibold font-mono uppercase border tracking-wider transition-colors ${selectedMeal === mt.key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
                  >
                    {mt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls + " mb-1 block"}>Gang</label>
              <div className="grid grid-cols-3 gap-2">
                {COURSES.map(co => (
                  <button
                    key={co.key}
                    type="button"
                    onClick={() => setSelectedCourse(co.key)}
                    className={`py-1.5 rounded-lg text-xs font-semibold font-mono uppercase border tracking-wider transition-colors ${selectedCourse === co.key ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
                  >
                    {co.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-3 flex-shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rezept suchen..." className={inputCls + " pl-9"} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 space-y-1 min-h-0">
            {filtered.map(r => (
              <button key={r.id} onClick={() => handlePick(r.id)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-stone-50 text-left">
                {getRecipePreview(r) ? <img src={getRecipePreview(r)} className="w-9 h-9 rounded-lg object-cover" /> : <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center"><Utensils size={14} className="text-stone-300" /></div>}
                <span className="text-sm">{r.title}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-center text-sm text-stone-400 py-6">Keine Rezepte gefunden</div>}
          </div>
          <div className="p-3 border-t border-stone-200 flex-shrink-0">
            <button onClick={() => { onClose(); openAddRecipe({ onSaved: (r) => handlePick(r.id) }); }} className={primaryBtnCls}>
              <Plus size={14} /> Neues Rezept
            </button>
          </div>
        </div>
      </div>

      {overwriteTarget && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[60] p-4 animate-fade-in">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl space-y-4 border border-stone-200 animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="bg-amber-50 p-2.5 rounded-full text-amber-600 animate-pulse">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-semibold text-stone-850 font-mono uppercase tracking-wide text-xs">Eintrag überschreiben?</h3>
                <p className="text-[10px] text-stone-400 font-mono">Planungskonflikt</p>
              </div>
            </div>
            <p className="text-sm text-stone-600 leading-relaxed">
              Für <strong>{formattedDate}</strong> ({MEAL_TIMES.find(m => m.key === selectedMeal)?.label} – {COURSES.find(c => c.key === selectedCourse)?.label}) ist bereits das Rezept <span className="font-medium text-stone-900">„{overwriteTarget.existingTitle}“</span> geplant.
              <br /><br />
              Möchtest du es überschreiben?
            </p>
            <div className="flex gap-2 pt-2">
              <button 
                type="button"
                onClick={async () => {
                  await executeSave(overwriteTarget.recipeId, overwriteTarget.plan);
                  setOverwriteTarget(null);
                }} 
                className="flex-1 py-2 rounded-lg bg-stone-900 text-white font-mono uppercase tracking-wide text-xs font-semibold active:scale-[0.99] hover:bg-stone-850 transition-colors"
              >
                Ja
              </button>
              <button 
                type="button"
                onClick={() => setOverwriteTarget(null)} 
                className="flex-1 py-2 rounded-lg border border-stone-300 text-stone-700 text-sm font-medium active:scale-[0.99] hover:bg-stone-50 transition-colors"
              >
                Nein
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WeekSummary({ selectedDay }) {
  const { recipes, settings, getDayPlan, saveDayPlan, triggerRefresh, openRecipeDetail, openMoveMeal, refreshKey } = useApp();
  const [addMealModal, setAddMealModal] = useState(null);
  const [totals, setTotals] = useState(null);
  const [plans, setPlans] = useState([]);
  const [y, m, d] = selectedDay.split('-').map(Number);
  const monday = getMonday(new Date(y, m - 1, d));
  const endDate = new Date(monday); endDate.setDate(monday.getDate() + (settings.showNextMonday ? 7 : 6));
  const rangeLabel = `${monday.getDate()}.${monday.getMonth() + 1}. – ${endDate.getDate()}.${endDate.getMonth() + 1}.`;

  useEffect(() => {
    let alive = true;
    setTotals(null);
    setPlans([]);
    (async () => {
      const [yVal, mVal, dVal] = selectedDay.split('-').map(Number);
      const mon = getMonday(new Date(yVal, mVal - 1, dVal));
      const days = weekDatesFrom(mon, settings.showNextMonday);
      const sums = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      const loadedPlans = [];
      for (const day of days) {
        const plan = await getDayPlan(dateKey(day));
        loadedPlans.push({ day, plan });
        const t = computeDayNutrition(plan, recipes);
        for (const k of NUTRIENT_KEYS) sums[k] += t[k];
      }
      if (alive) {
        setTotals(sums);
        setPlans(loadedPlans);
      }
    })();
    return () => { alive = false; };
  }, [selectedDay, recipes, settings.showNextMonday, getDayPlan, refreshKey]);

  if (!totals) return <div className={cardCls + " text-center text-stone-300"}><Loader2 className="animate-spin inline" size={18} /></div>;

  const dayCount = settings.showNextMonday ? 8 : 7;
  const weeklyPeople = settings.people.map(p => ({ ...p, targets: { kcal: p.targets.kcal * dayCount, protein: p.targets.protein * dayCount, carbs: p.targets.carbs * dayCount, fat: p.targets.fat * dayCount } }));
  return (
    <div className="space-y-2">
      <div className="text-xs text-stone-400 font-mono px-1">WOCHE {rangeLabel}</div>
      <NutritionSummary totals={totals} people={weeklyPeople} />
      
      <div className="space-y-3 mt-4">
        {plans.map(({ day, plan }) => {
          const formattedDate = formatLongDate(dateKey(day));
          const plannedSlots = [];
          if (plan) {
            for (const mt of MEAL_TIMES) {
              for (const co of COURSES) {
                const slot = plan[mt.key] && plan[mt.key][co.key];
                if (slot) {
                  const recipe = recipes.find(r => r.id === slot.recipeId);
                  if (recipe) {
                    plannedSlots.push({ meal: mt, course: co, slot, recipe });
                  }
                }
              }
            }
          }
          
          return (
            <div key={dateKey(day)} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3">
              <div className="text-sm font-semibold text-stone-700 font-mono border-b border-stone-100 pb-1.5 flex justify-between items-center">
                <span>{formattedDate}</span>
                <div className="flex items-center gap-1.5">
                  {plannedSlots.length > 0 && (
                    <span className="text-xs font-normal text-stone-400">
                      {plannedSlots.length} {plannedSlots.length === 1 ? 'Gericht' : 'Gerichte'}
                    </span>
                  )}
                  <button onClick={() => setAddMealModal({ date: day })} className="text-stone-400 hover:text-stone-700 p-0.5 rounded transition-colors" title="Gericht hinzufügen">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              
              {plannedSlots.length === 0 ? (
                <div className="text-xs text-stone-400 italic py-1 px-1">Keine Gerichte geplant</div>
              ) : (
                <div className="space-y-2">
                  {plannedSlots.map(({ meal, course, slot, recipe }) => (
                    <PlannedMealItem
                      key={`${meal.key}-${course.key}`}
                      meal={meal}
                      course={course}
                      slot={slot}
                      recipe={recipe}
                      onClickRecipe={() => openRecipeDetail({ recipe, multiplier: slot.multiplier })}
                      onLongPressRecipe={() => openMoveMeal({ sourceDate: dateKey(day), mealKey: meal.key, courseKey: course.key, recipeId: slot.recipeId, multiplier: slot.multiplier })}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {addMealModal && (
        <WeekAddMealModal
          date={addMealModal.date}
          onClose={() => setAddMealModal(null)}
        />
      )}
    </div>
  );
}

function WeekPlannerModal({ onClose }) {
  const { recipes, settings, bookmarksRecipes, bookmarksPages, addRecipe, getDayPlan, saveDayPlan, showToast } = useApp();
  const [motto, setMotto] = useState('');
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [log, setLog] = useState([]);

  const monday = getNextWeekMonday();
  const days = weekDatesFrom(monday, settings.showNextMonday);
  const sunday = days[days.length - 1];
  const rangeLabel = `${monday.getDate()}.${monday.getMonth() + 1}. – ${sunday.getDate()}.${sunday.getMonth() + 1}.`;

  const setEntry = (i, patch) => setLog(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e));

  const start = async () => {
    setStarted(true); setRunning(true);
    const plans = {};
    for (const d of days) plans[dateKey(d)] = await getDayPlan(dateKey(d));

    const needDinner = days.filter(d => {
      const plan = plans[dateKey(d)];
      return !plan || !plan.dinner || !plan.dinner.main;
    });
    const weekend = days.filter(d => d.getDay() === 6 || d.getDay() === 0);
    const needBreakfast = weekend.filter(d => {
      const plan = plans[dateKey(d)];
      return !plan || !plan.breakfast || !plan.breakfast.main;
    });

    const dinnerTypes = ['firefox-direct', 'firefox-site', 'firefox-site', 'ai-search', 'ai-search', 'cookbook', 'cookbook'];
    const queue = [];
    needDinner.slice(0, 7).forEach((d, i) => queue.push({ type: dinnerTypes[i], day: d, meal: 'dinner' }));
    needBreakfast.forEach(d => queue.push({ type: 'breakfast', day: d, meal: 'breakfast' }));

    if (queue.length === 0) { setRunning(false); showToast('Alle Ziel-Slots sind bereits belegt'); return; }

    setLog(queue.map(t => ({ label: `${LONG_WEEKDAYS[t.day.getDay()].slice(0, 2)} ${t.day.getDate()}.${t.day.getMonth() + 1}. – ${t.meal === 'dinner' ? 'Abendessen' : 'Frühstück'}`, status: 'pending', title: '' })));

    const target = averageTargets(settings.people);
    const chosen = [];
    const usedUrls = new Set(recipes.map(r => r.source && r.source.url).filter(Boolean));
    let directBm = bookmarksRecipes.find(b => looksLikeRecipePage(b) && !usedUrls.has(b.url));
    let siteDomains = pickSiteDomains(bookmarksPages, 2);
    let cookbookQueue = [...settings.cookbooks];

    for (let i = 0; i < queue.length; i++) {
      const task = queue[i];
      try {
        const isBreakfast = task.meal === 'breakfast';
        const share = isBreakfast ? 0.25 : 0.35;
        const kcalBudget = Math.round(target.kcal * share);
        let recipe;

        if (task.type === 'firefox-direct' && directBm) {
          const result = await extractRecipeFromUrl(directBm.url);
          recipe = buildRecipeFromExtraction(result, { type: 'firefox', url: directBm.url, label: 'Firefox-Favoriten' });
          usedUrls.add(directBm.url);
        } else if (task.type === 'firefox-site' && siteDomains.length) {
          const domain = siteDomains.shift();
          const q = `${motto ? motto + ' ' : ''}Hauptgericht Abendessen, ca. ${kcalBudget} kcal`;
          const result = await searchRecipeOnSite(domain, q);
          recipe = buildRecipeFromExtraction(result, { type: 'ai', url: result.sourceUrl || '', label: `Firefox-Website (${domain})` });
        } else if (task.type === 'cookbook' && cookbookQueue.length) {
          const cb = cookbookQueue.shift();
          const cookbookTitle = typeof cb === 'string' ? cb : cb.title;
          setEntry(i, { status: 'done', title: `Hinweis: Rezept aus „${cookbookTitle}“ wählen` });
          continue;
        } else {
          const dishHint = isBreakfast ? 'Frühstücksrezept' : 'Hauptgericht Abendessen';
          const q = `${motto ? motto + ' ' : ''}${dishHint}, ca. ${kcalBudget} kcal${chosen.length ? `. Bitte nicht ähnlich zu: ${chosen.join(', ')}` : ''}`;
          const result = await searchRecipeOnline(q);
          recipe = buildRecipeFromExtraction(result, { type: 'ai', url: result.sourceUrl || '', label: 'KI-Websuche' });
        }

        const saved = await addRecipe(recipe);
        chosen.push(saved.title);

        const dk = dateKey(task.day);
        const fresh = await getDayPlan(dk);
        if (!fresh[task.meal].main) {
          await saveDayPlan(dk, { ...fresh, [task.meal]: { ...fresh[task.meal], main: { recipeId: saved.id, multiplier: 1 } } });
        }
        setEntry(i, { status: 'done', title: saved.title });
      } catch (e) {
        setEntry(i, { status: 'error' });
      }
    }
    setRunning(false);
    showToast('Wochenplan aktualisiert');
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-full flex flex-col">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <span className="font-mono font-semibold uppercase tracking-wide text-sm">Woche planen</span>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0 space-y-3">
          <p className="text-sm text-stone-500">{rangeLabel} · Belegte Slots werden nicht überschrieben.</p>
          {!started && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Motto / Ernährungsweise (optional)</label>
                <input value={motto} onChange={e => setMotto(e.target.value)} placeholder="z. B. Low-Carb, Vegan, sommerlich" className={inputCls + " mt-1"} />
              </div>
              <div className="text-xs text-stone-500 bg-stone-100 rounded-lg p-3 leading-relaxed">
                Geplant: 1× direkt aus Firefox-Favoriten, 2× per Websuche auf Firefox-Websites, 2× KI-Websuche, 2× Platzhalter aus Kochbüchern (jeweils Hauptspeise Abendessen) sowie 2× Frühstück für Sa/So. Nährwerte orientieren sich am Durchschnitt beider Tagesziele.
              </div>
              <button onClick={start} className={primaryBtnCls}><Sparkles size={14} /> Woche planen</button>
            </div>
          )}
          {started && (
            <div className="space-y-1.5">
              {log.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-sm py-1.5 border-b border-stone-100 last:border-0">
                  {e.status === 'pending' && <Loader2 size={14} className="animate-spin text-stone-300 flex-shrink-0" />}
                  {e.status === 'done' && <Check size={14} className="text-emerald-600 flex-shrink-0" />}
                  {e.status === 'error' && <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />}
                  <span className="text-stone-400 font-mono text-xs w-28 flex-shrink-0">{e.label}</span>
                  <span className="truncate">{e.title || (e.status === 'error' ? 'Fehlgeschlagen' : '…')}</span>
                </div>
              ))}
              {!running && <button onClick={onClose} className={secondaryBtnCls + " mt-2"}>Fertig</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarTab() {
  const { getDayPlan, saveDayPlan, settings, refreshKey, plannerOpen, setPlannerOpen } = useApp();
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [dayPlan, setDayPlan] = useState(null);
  const [dayLoading, setDayLoading] = useState(true);
  const [mode, setMode] = useState(settings.defaultCalendarView || 'week');

  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  const navigateCalendar = (direction) => {
    const [y, m, d] = selectedDay.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (mode === 'day') {
      date.setDate(date.getDate() + direction);
    } else {
      date.setDate(date.getDate() + (direction * 7));
    }
    const newKey = dateKey(date);
    setSelectedDay(newKey);
    setViewDate(date);
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = null;
  };

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const diffX = touchStartX.current - touchEndX.current;
    const minDistance = 50;

    if (diffX > minDistance) {
      navigateCalendar(1);
    } else if (diffX < -minDistance) {
      navigateCalendar(-1);
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  useEffect(() => {
    let alive = true;
    setDayLoading(true);
    getDayPlan(selectedDay).then(plan => { if (alive) { setDayPlan(plan); setDayLoading(false); } });
    return () => { alive = false; };
  }, [selectedDay, refreshKey]);

  const handleChange = (plan) => { setDayPlan(plan); saveDayPlan(selectedDay, plan); };

  return (
    <div
      className="space-y-4 touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <MonthGrid viewDate={viewDate} setViewDate={setViewDate} selectedDay={selectedDay} setSelectedDay={setSelectedDay} />
      <div className="flex items-center justify-between px-1">
        <div className="text-sm text-stone-500 font-mono">{formatLongDate(selectedDay)}</div>
        <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5">
          <button onClick={() => setMode('day')} className={`px-2.5 py-1 rounded-md text-xs font-mono ${mode === 'day' ? 'bg-white shadow-sm' : 'text-stone-500'}`}>Tag</button>
          <button onClick={() => setMode('week')} className={`px-2.5 py-1 rounded-md text-xs font-mono ${mode === 'week' ? 'bg-white shadow-sm' : 'text-stone-500'}`}>Woche</button>
        </div>
      </div>
      {mode === 'week' ? <WeekSummary selectedDay={selectedDay} /> : (
        dayLoading || !dayPlan ? <div className="text-center py-8 text-stone-300"><Loader2 className="animate-spin inline" size={20} /></div> : <DayDetail plan={dayPlan} onChange={handleChange} selectedDay={selectedDay} />
      )}
      <button onClick={() => setPlannerOpen(true)} className={secondaryBtnCls}><Sparkles size={16} /> Nächste Woche automatisch planen</button>
      {plannerOpen && <WeekPlannerModal onClose={() => setPlannerOpen(false)} />}
    </div>
  );
}

/* ---------------------------------- Add recipe flow ---------------------------------- */
function SourcePicker({ onPick }) {
  const items = [
    { key: 'form', label: 'Manuell eingeben', icon: Edit2, desc: 'Rezept selbst eintippen' },
    { key: 'firefox', label: 'Aus Firefox-Favoriten', icon: BookOpen, desc: 'Gespeicherte Favoriten durchsuchen' },
    { key: 'cookbook', label: 'Aus Kochbuch', icon: Camera, desc: 'Titel, Seite & Foto erfassen' },
    { key: 'ai', label: 'KI- oder Google-Suche', icon: Sparkles, desc: 'Rezept online finden lassen' },
    { key: 'other', label: 'Weiteres', icon: Plus, desc: 'Aktivitäten wie Essen gehen, Urlaub, etc.' },
  ];
  return (
    <div className="space-y-2">
      {items.map(it => (
        <button key={it.key} onClick={() => onPick(it.key)} className="w-full flex items-center gap-3 p-3 rounded-lg border border-stone-200 hover:border-stone-400 hover:bg-stone-50 text-left">
          <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600 flex-shrink-0"><it.icon size={18} /></div>
          <div>
            <div className="text-sm font-medium">{it.label}</div>
            <div className="text-xs text-stone-400">{it.desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function FirefoxImportPanel({ onBack, onNext }) {
  const { bookmarksRecipes, bookmarksPages, saveBookmarksRecipes, saveBookmarksPages } = useApp();
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [category, setCategory] = useState('recipes');

  const activeBookmarks = category === 'recipes' ? bookmarksRecipes : bookmarksPages;

  const handleFile = async (file) => {
    setError(null); setImporting(true);
    try {
      const parsed = await parseBookmarksFile(file);
      if (parsed.length === 0) {
        setError('Keine Links in der Datei gefunden.');
      } else {
        if (category === 'recipes') {
          await saveBookmarksRecipes(parsed);
        } else {
          await saveBookmarksPages(parsed);
        }
      }
    } catch (e) { setError('Datei konnte nicht gelesen werden.'); }
    finally { setImporting(false); }
  };

  const filtered = activeBookmarks.filter(l => l.title.toLowerCase().includes(query.toLowerCase()) || l.url.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm text-stone-400 flex items-center gap-1"><ChevronLeft size={14} /> Zurück</button>
      
      <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5 w-full">
        <button onClick={() => setCategory('recipes')} className={`flex-1 py-1.5 rounded-md text-xs font-mono ${category === 'recipes' ? 'bg-white shadow-sm font-semibold' : 'text-stone-500'}`}>Rezepte</button>
        <button onClick={() => setCategory('pages')} className={`flex-1 py-1.5 rounded-md text-xs font-mono ${category === 'pages' ? 'bg-white shadow-sm font-semibold' : 'text-stone-500'}`}>Seiten</button>
      </div>

      {activeBookmarks.length === 0 ? (
        <div>
          <p className="text-sm text-stone-500 mb-3">Firefox → Bibliothek → Bookmarks → „Exportieren als HTML" – Datei hier hochladen. Wird dauerhaft in der Liste "{category === 'recipes' ? 'Rezepte' : 'Seiten'}" gespeichert.</p>
          <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-stone-300 text-stone-400 cursor-pointer hover:border-stone-500">
            {importing ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
            <span className="text-sm">Bookmarks-HTML auswählen ({category === 'recipes' ? 'Rezepte' : 'Seiten'})</span>
            <input type="file" accept=".html,.htm" className="hidden" onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
          </label>
          {error && <p className="text-sm text-rose-500 mt-2">{error}</p>}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-stone-400 font-mono">{activeBookmarks.length} {category === 'recipes' ? 'REZEPTE' : 'SEITEN'} GESPEICHERT</span>
            <label className="text-xs text-stone-500 hover:text-stone-900 cursor-pointer font-mono uppercase tracking-wide">
              Aktualisieren
              <input type="file" accept=".html,.htm" className="hidden" onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
            </label>
          </div>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filtern..." className={inputCls + " mb-2"} />
          <div className="max-h-72 overflow-y-auto space-y-1">
            {filtered.map((l, i) => (
              <button key={i} onClick={() => onNext({ title: l.title, source: { type: 'firefox', url: l.url, label: `Firefox-Favoriten (${category === 'recipes' ? 'Rezepte' : 'Seiten'})` } })} className="w-full text-left p-2.5 rounded-lg hover:bg-stone-50 border border-stone-100">
                <div className="text-sm font-medium truncate">{l.title}</div>
                <div className="text-xs text-stone-400 truncate">{l.url}</div>
              </button>
            ))}
            {filtered.length === 0 && <div className="text-sm text-stone-400 text-center py-4">Keine Treffer</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function CookbookPanel({ onBack, onNext }) {
  const { settings, updateSettings, showToast } = useApp();
  const [cookbook, setCookbook] = useState('');
  const [newCookbook, setNewCookbook] = useState('');
  const [title, setTitle] = useState('');
  const [page, setPage] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);

  const handlePhoto = async (file) => {
    setBusy(true);
    try { setPhoto(await resizeImage(file)); } catch (e) { } finally { setBusy(false); }
  };

  const submit = async () => {
    let cb = cookbook;
    if (newCookbook.trim()) {
      cb = newCookbook.trim();
      const exists = settings.cookbooks.some(c => (typeof c === 'string' ? c : c.title) === cb);
      if (exists) {
        showToast('Dieses Kochbuch existiert bereits!', 'error');
        return;
      }
      await updateSettings({ cookbooks: [...settings.cookbooks, { title: cb, addedAt: Date.now() }] });
    }
    onNext({ title, photo, source: { type: 'cookbook', cookbook: cb, page, label: cb } });
  };

  const sortedCookbooks = [...settings.cookbooks].sort((a, b) => {
    const titleA = (typeof a === 'string' ? a : a.title).toLowerCase();
    const titleB = (typeof b === 'string' ? b : b.title).toLowerCase();
    return titleA.localeCompare(titleB);
  });

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm text-stone-400 flex items-center gap-1"><ChevronLeft size={14} /> Zurück</button>
      <p className="text-sm text-stone-500">Rezept im Buch suchen und hier eintragen.</p>
      <div>
        <label className={labelCls}>Kochbuch</label>
        <select value={cookbook} onChange={e => setCookbook(e.target.value)} className={inputCls + " mt-1"}>
          <option value="">– auswählen –</option>
          {sortedCookbooks.map(c => {
            const val = typeof c === 'string' ? c : c.title;
            return <option key={val} value={val}>{val}</option>;
          })}
        </select>
        <input value={newCookbook} onChange={e => setNewCookbook(e.target.value)} placeholder="oder neues Kochbuch anlegen" className={inputCls + " mt-2"} />
      </div>
      <div>
        <label className={labelCls}>Rezeptname</label>
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls + " mt-1"} />
      </div>
      <div>
        <label className={labelCls}>Seite</label>
        <input value={page} onChange={e => setPage(e.target.value)} className={inputCls + " mt-1"} />
      </div>
      <div>
        <label className={labelCls}>Foto (optional)</label>
        <div className="mt-1">
          {photo ? (
            <div className="relative w-24 h-24">
              <img src={photo} className="w-24 h-24 rounded-lg object-cover" />
              <button onClick={() => setPhoto(null)} className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 border border-stone-300"><X size={12} /></button>
            </div>
          ) : (
            <label className="flex items-center justify-center w-24 h-24 rounded-lg border-2 border-dashed border-stone-300 text-stone-400 cursor-pointer">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files[0] && handlePhoto(e.target.files[0])} />
            </label>
          )}
        </div>
      </div>
      <button disabled={!title || (!cookbook && !newCookbook.trim())} onClick={submit} className={primaryBtnCls}>Weiter</button>
    </div>
  );
}

function AIDirectSearch({ onNext }) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const search = async () => {
    if (!query.trim()) return;
    setBusy(true); setError(null);
    try {
      const result = await searchRecipeOnline(query.trim());
      onNext({ title: result.title || query, servingsText: result.servings ? String(result.servings) : '4', ingredientsText: (result.ingredients || []).join('\n'), stepsText: (result.steps || []).join('\n'), nutrition: result.nutrition || null, source: { type: 'ai', url: result.sourceUrl || '', label: 'KI-Websuche' } });
    } catch (e) { setError('Suche fehlgeschlagen. Bitte manuell eingeben.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">Claude durchsucht das Web nach einem passenden Rezept.</p>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="z. B. Spaghetti Carbonara" className={inputCls} onKeyDown={e => e.key === 'Enter' && search()} />
      <button onClick={search} disabled={busy || !query.trim()} className={primaryBtnCls}>
        {busy ? <><Loader2 size={14} className="animate-spin" /> Suche läuft</> : <><Sparkles size={14} /> Suchen</>}
      </button>
      {error && <p className="text-sm text-rose-500">{error}</p>}
    </div>
  );
}

function InAppBrowser({ initialUrl, onClose, onSaveRecipe }) {
  const iframeRef = useRef(null);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [iframeUrl] = useState(() => `/api/proxy?url=${encodeURIComponent(initialUrl)}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [extracted, setExtracted] = useState(null);

  const handleIframeLoad = () => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    try {
      const loc = iframeRef.current.contentWindow.location;
      const searchParams = new URLSearchParams(loc.search);
      const urlParam = searchParams.get('url');
      if (urlParam) {
        setCurrentUrl(urlParam);
      } else {
        setCurrentUrl(loc.href);
      }
    } catch (e) {
      console.warn("Iframe location read blocked or failed", e);
    }
  };

  const handleBack = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.history.back();
      } catch (e) {
        console.warn("Iframe history back failed", e);
      }
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    console.group(`[handleSave] ${currentUrl}`);
    console.log('Starte Rezept-Extraktion...');
    
    try {
      const result = await extractRecipeFromUrl(currentUrl);
      console.log('Extraktion erfolgreich:', result.title, '|', result.ingredients?.length, 'Zutaten');
      
      const screenshot = `https://image.thum.io/get/width/600/crop/800/${currentUrl}`;
      result.photo = screenshot;
      
      setExtracted(result);
    } catch (e) {
      const msg = e.message || 'Unbekannter Fehler';
      console.error('[handleSave] Fehler:', e.name, msg, e.stack);
      setError(`Extraktion fehlgeschlagen: ${msg}. Bitte andere Seite wählen oder manuell eingeben.`);
    } finally {
      setBusy(false);
      console.groupEnd();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex flex-col z-50 animate-fade-in">
      <div className="bg-stone-900 text-white p-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={handleBack} className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-300 hover:text-white" title="Zurück">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 bg-stone-800 rounded-lg px-3 py-1.5 text-xs font-mono truncate text-stone-300 select-all">
          {currentUrl}
        </div>
        {!extracted && (
          <button onClick={handleSave} disabled={busy} className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 text-xs font-semibold px-3 disabled:opacity-50" title="Rezept speichern">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            <span>Speichern</span>
          </button>
        )}
        <button onClick={onClose} className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-300 hover:text-white" title="Schließen">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 bg-white relative overflow-hidden flex flex-col">
        {busy && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white z-10 p-6 text-center">
            <Loader2 size={36} className="animate-spin mb-3 text-emerald-400" />
            <div className="font-mono text-sm font-semibold tracking-wide uppercase">KI-Extraktion läuft</div>
            <div className="text-xs text-stone-300 mt-1 max-w-xs">Claude liest die Seite aus, extrahiert die Zutaten, Schritte und schätzt die Nährwerte...</div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border-b border-rose-200 text-rose-800 p-3 text-xs flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold underline">Ausblenden</button>
          </div>
        )}

        {extracted ? (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-xl mx-auto w-full">
            <div className="text-center pb-2 border-b border-stone-200">
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-600 font-bold">Extrahiertes Rezept</span>
              <h2 className="text-xl font-bold mt-1 text-stone-900">{extracted.title || 'Rezept'}</h2>
              <p className="text-sm text-stone-500 mt-1">{extracted.servings || 4} Portionen</p>
            </div>

            {extracted.nutrition && (
              <div className="grid grid-cols-4 gap-2 text-center">
                {['kcal', 'protein', 'carbs', 'fat'].map(k => (
                  <div key={k} className="bg-stone-50 rounded-lg py-2 border border-stone-200">
                    <div className="text-sm font-bold font-mono text-stone-850">{extracted.nutrition[k] || 0}</div>
                    <div className="text-[10px] uppercase text-stone-400 font-mono tracking-wider">{NUTRIENT_LABELS[k]}</div>
                  </div>
                ))}
              </div>
            )}

            {extracted.ingredients && extracted.ingredients.length > 0 && (
              <div>
                <h3 className="font-mono uppercase tracking-wide text-xs text-stone-400 mb-1.5 font-bold">Zutaten</h3>
                <ul className="text-sm text-stone-700 space-y-1">
                  {extracted.ingredients.map((ing, i) => (
                    <li key={i} className="py-1 border-b border-stone-100 last:border-0">• {ing}</li>
                  ))}
                </ul>
              </div>
            )}

            {extracted.steps && extracted.steps.length > 0 && (
              <div>
                <h3 className="font-mono uppercase tracking-wide text-xs text-stone-400 mb-1.5 font-bold">Zubereitung</h3>
                <ol className="text-sm text-stone-700 space-y-2 list-decimal list-inside">
                  {extracted.steps.map((step, i) => (
                    <li key={i} className="pl-1 align-top leading-relaxed">{step}</li>
                  ))}
                </ol>
              </div>
            )}

            <div className="pt-4 border-t border-stone-200 flex gap-2">
              <button onClick={() => setExtracted(null)} className="w-1/3 py-2.5 rounded-lg border border-stone-300 text-stone-600 text-sm font-medium hover:bg-stone-50">
                Zurück
              </button>
              <button
                onClick={() => {
                  onSaveRecipe({
                    title: extracted.title || 'Rezept',
                    servingsText: extracted.servings ? String(extracted.servings) : '4',
                    ingredientsText: (extracted.ingredients || []).join('\n'),
                    stepsText: (extracted.steps || []).join('\n'),
                    nutrition: extracted.nutrition || null,
                    photo: extracted.photo || null,
                    source: { type: 'ai', url: currentUrl, label: 'In-App-Browser' }
                  });
                }}
                className="flex-1 py-2.5 bg-stone-900 text-white rounded-lg font-semibold text-sm hover:bg-stone-850 active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <Check size={16} /> Rezept übernehmen &amp; Speichern
              </button>
            </div>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            onLoad={handleIframeLoad}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-forms allow-scripts"
          />
        )}
      </div>
    </div>
  );
}

function GoogleLinkSearch({ onNext }) {
  const [query, setQuery] = useState('');
  const [browserUrl, setBrowserUrl] = useState(null);

  const startSearch = () => {
    if (!query.trim()) return;
    const gUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.trim() + ' rezept')}`;
    setBrowserUrl(gUrl);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        Gib unten die Bezeichnung vom Rezept ein. Es öffnet sich ein werbefreier In-App-Browser mit DuckDuckGo. Dort kannst du auf Rezepte klicken und diese per Klick auf „Speichern“ direkt einlesen.
      </p>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="z. B. Spaghetti Carbonara"
        className={inputCls}
        onKeyDown={e => e.key === 'Enter' && startSearch()}
      />
      <button onClick={startSearch} disabled={!query.trim()} className={primaryBtnCls}>
        <Search size={14} /> Suchen
      </button>

      {browserUrl && (
        <InAppBrowser
          initialUrl={browserUrl}
          onClose={() => setBrowserUrl(null)}
          onSaveRecipe={(recipeData) => {
            setBrowserUrl(null);
            onNext(recipeData);
          }}
        />
      )}
    </div>
  );
}

function URLPasteSearch({ onNext }) {
  const { showToast } = useApp();
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [extracted, setExtracted] = useState(null);

  const handleImport = async () => {
    if (!urlInput.trim()) {
      showToast('Bitte eine gültige URL eingeben', 'error');
      return;
    }
    setBusy(true);
    setError(null);
    setExtracted(null);
    try {
      const result = await extractRecipeFromUrl(urlInput.trim());
      result.photo = `https://image.thum.io/get/width/600/crop/800/${urlInput.trim()}`;
      setExtracted(result);
    } catch (e) {
      setError('Rezept-Extraktion fehlgeschlagen. Die Seite blockiert eventuell automatische Zugriffe oder das Rezept-Format wurde nicht erkannt.');
      showToast('Import fehlgeschlagen', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (extracted) {
    return (
      <div className="space-y-4">
        <div className="text-center pb-2 border-b border-stone-200">
          <span className="font-mono text-xs uppercase tracking-widest text-emerald-600 font-bold">Extrahiertes Rezept</span>
          <h2 className="text-xl font-bold mt-1 text-stone-900">{extracted.title || 'Rezept'}</h2>
          <p className="text-sm text-stone-500 mt-1">{extracted.servings || 4} Portionen</p>
        </div>

        {extracted.nutrition && (
          <div className="grid grid-cols-4 gap-2 text-center">
            {NUTRIENT_KEYS.map(k => (
              <div key={k} className="bg-stone-50 rounded-lg py-2 border border-stone-200">
                <div className="text-sm font-bold font-mono text-stone-850">{extracted.nutrition[k] || 0}</div>
                <div className="text-[10px] uppercase text-stone-450 font-mono tracking-wider">{NUTRIENT_LABELS[k]}</div>
              </div>
            ))}
          </div>
        )}

        {extracted.ingredients && extracted.ingredients.length > 0 && (
          <div>
            <h3 className="font-mono uppercase tracking-wide text-xs text-stone-400 mb-1.5 font-bold">Zutaten</h3>
            <ul className="text-sm text-stone-700 space-y-1">
              {extracted.ingredients.map((ing, i) => (
                <li key={i} className="py-1 border-b border-stone-100 last:border-0">• {ing}</li>
              ))}
            </ul>
          </div>
        )}

        {extracted.steps && extracted.steps.length > 0 && (
          <div>
            <h3 className="font-mono uppercase tracking-wide text-xs text-stone-400 mb-1.5 font-bold">Zubereitung</h3>
            <ol className="text-sm text-stone-700 space-y-2 list-decimal list-inside">
              {extracted.steps.map((step, i) => (
                <li key={i} className="pl-1 align-top leading-relaxed">{step}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="pt-4 border-t border-stone-200 flex gap-2">
          <button onClick={() => setExtracted(null)} className="w-1/3 py-2.5 rounded-lg border border-stone-300 text-stone-600 text-sm font-medium hover:bg-stone-50">
            Zurück
          </button>
          <button
            onClick={() => {
              onNext({
                title: extracted.title || 'Rezept',
                servingsText: extracted.servings ? String(extracted.servings) : '4',
                ingredientsText: (extracted.ingredients || []).join('\n'),
                stepsText: (extracted.steps || []).join('\n'),
                nutrition: extracted.nutrition || null,
                photo: extracted.photo || null,
                source: { type: 'ai', url: urlInput.trim(), label: 'Webseiten-Import' }
              });
            }}
            className="flex-1 py-2.5 bg-stone-900 text-white rounded-lg font-semibold text-sm hover:bg-stone-850 active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <Check size={16} /> Rezept übernehmen &amp; Speichern
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-500">
        Füge hier die Webadresse (URL) eines Rezeptes ein (z. B. von Chefkoch, Blogs, etc.).
      </p>
      <input
        value={urlInput}
        onChange={e => setUrlInput(e.target.value)}
        placeholder="https://www.chefkoch.de/rezepte/..."
        className={inputCls}
        onKeyDown={e => e.key === 'Enter' && handleImport()}
      />
      <button 
        onClick={handleImport} 
        disabled={busy || !urlInput.trim()} 
        className={primaryBtnCls}
      >
        {busy ? (
          <><Loader2 size={15} className="animate-spin" /> Claude extrahiert...</>
        ) : (
          <><Download size={15} /> Rezept importieren</>
        )}
      </button>
      {error && <p className="text-sm text-rose-500 mt-2">{error}</p>}
    </div>
  );
}

function AISearchPanel({ onBack, onNext }) {
  const [subTab, setSubTab] = useState('ai');
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm text-stone-400 flex items-center gap-1"><ChevronLeft size={14} /> Zurück</button>
      <div className="flex gap-1 bg-stone-100 rounded-lg p-0.5 w-fit">
        <button onClick={() => setSubTab('ai')} className={`px-3 py-1.5 rounded-md text-xs font-mono ${subTab === 'ai' ? 'bg-white shadow-sm font-semibold text-stone-800' : 'text-stone-500'}`}>KI-Suche</button>
        <button onClick={() => setSubTab('google')} className={`px-3 py-1.5 rounded-md text-xs font-mono ${subTab === 'google' ? 'bg-white shadow-sm font-semibold text-stone-800' : 'text-stone-500'}`}>Browser</button>
        <button onClick={() => setSubTab('link')} className={`px-3 py-1.5 rounded-md text-xs font-mono ${subTab === 'link' ? 'bg-white shadow-sm font-semibold text-stone-800' : 'text-stone-500'}`}>Link Import</button>
      </div>
      {subTab === 'ai' && <AIDirectSearch onNext={onNext} />}
      {subTab === 'google' && <GoogleLinkSearch onNext={onNext} />}
      {subTab === 'link' && <URLPasteSearch onNext={onNext} />}
    </div>
  );
}

function RecipeForm({ initial, onBack, backLabel, onSave }) {
  const { showToast } = useApp();
  const [title, setTitle] = useState((initial && initial.title) || '');
  const [doNotSaveInBook, setDoNotSaveInBook] = useState((initial && initial.doNotSaveInBook) || false);
  const [servingsText, setServingsText] = useState((initial && initial.servingsText) || '4');
  const [ingredientsText, setIngredientsText] = useState((initial && initial.ingredientsText) || '');
  const [stepsText, setStepsText] = useState((initial && initial.stepsText) || '');
  const [nutrition, setNutrition] = useState((initial && initial.nutrition) || { kcal: '', protein: '', carbs: '', fat: '' });
  const [photo, setPhoto] = useState((initial && initial.photo) || null);
  const [busyPhoto, setBusyPhoto] = useState(false);
  const [busyNutrition, setBusyNutrition] = useState(false);
  const source = (initial && initial.source) || { type: 'manual', label: 'Manuell' };

  const handlePhoto = async (file) => {
    setBusyPhoto(true);
    try { setPhoto(await resizeImage(file)); } catch (e) { showToast('Foto konnte nicht geladen werden', 'error'); }
    finally { setBusyPhoto(false); }
  };

  const guessNutrition = async () => {
    if (!ingredientsText.trim()) { showToast('Bitte zuerst Zutaten eintragen', 'error'); return; }
    setBusyNutrition(true);
    try {
      const n = await estimateNutrition(ingredientsText, parseFloat(servingsText) || 1);
      setNutrition({ kcal: Math.round(n.kcal) || '', protein: Math.round(n.protein) || '', carbs: Math.round(n.carbs) || '', fat: Math.round(n.fat) || '' });
    } catch (e) { showToast('Schätzung fehlgeschlagen', 'error'); }
    finally { setBusyNutrition(false); }
  };

  const save = () => {
    if (!title.trim()) { showToast('Bitte einen Titel eingeben', 'error'); return; }
    const recipe = {
      title: title.trim(),
      servings: parseFloat(servingsText) || 1,
      ingredients: parseIngredientsText(ingredientsText),
      steps: stepsText.split('\n').map(s => s.trim()).filter(Boolean),
      nutrition: nutrition.kcal !== '' ? { kcal: +nutrition.kcal || 0, protein: +nutrition.protein || 0, carbs: +nutrition.carbs || 0, fat: +nutrition.fat || 0 } : null,
      photo,
      source,
      doNotSaveInBook,
    };
    onSave(recipe);
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm text-stone-400 flex items-center gap-1"><ChevronLeft size={14} /> {backLabel || 'Zurück'}</button>
      {source.type !== 'manual' && (
        <div className="text-xs bg-stone-100 text-stone-600 px-3 py-2 rounded-lg flex items-center gap-1.5 font-mono">
          <Sparkles size={12} /> {source.label}{source.cookbook ? ` – ${source.cookbook}${source.page ? `, S. ${source.page}` : ''}` : ''}
        </div>
      )}
      <div>
        <label className={labelCls}>Titel</label>
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls + " mt-1"} />
      </div>
      <label className="flex items-center gap-2 py-1 cursor-pointer">
        <input 
          type="checkbox" 
          checked={doNotSaveInBook} 
          onChange={e => setDoNotSaveInBook(e.target.checked)} 
          className="rounded border-stone-300 text-stone-900 focus:ring-stone-900" 
        />
        <span className="text-sm text-stone-700">Rezept soll nicht im Kochbuch gespeichert werden</span>
      </label>
      <div className="flex gap-3">
        <div className="w-24">
          <label className={labelCls}>Portionen</label>
          <input type="number" value={servingsText} onChange={e => setServingsText(e.target.value)} className={inputCls + " mt-1"} />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Foto</label>
          <div className="mt-1">
            {photo ? (
              <div className="relative w-10 h-10 inline-block">
                <img src={photo} className="w-10 h-10 rounded-lg object-cover" />
                <button onClick={() => setPhoto(null)} className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 border border-stone-300"><X size={10} /></button>
              </div>
            ) : (
              <label className="inline-flex items-center justify-center w-10 h-10 rounded-lg border-2 border-dashed border-stone-300 text-stone-400 cursor-pointer">
                {busyPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && handlePhoto(e.target.files[0])} />
              </label>
            )}
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls}>Zutaten – eine Zeile pro Zutat (z. B. „200 g Mehl")</label>
        <textarea value={ingredientsText} onChange={e => setIngredientsText(e.target.value)} rows={5} className={inputCls + " mt-1 font-mono"} />
      </div>
      <div>
        <label className={labelCls}>Zubereitung – ein Schritt pro Zeile</label>
        <textarea value={stepsText} onChange={e => setStepsText(e.target.value)} rows={5} className={inputCls + " mt-1"} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className={labelCls}>Nährwerte / Portion</label>
          <button onClick={guessNutrition} disabled={busyNutrition} className="text-xs text-stone-500 hover:text-stone-900 flex items-center gap-1 font-mono uppercase tracking-wide">
            {busyNutrition ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} KI schätzen
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <NutritionInput label="kcal" value={nutrition.kcal} onChange={v => setNutrition({ ...nutrition, kcal: v })} />
          <NutritionInput label="Eiw. g" value={nutrition.protein} onChange={v => setNutrition({ ...nutrition, protein: v })} />
          <NutritionInput label="KH g" value={nutrition.carbs} onChange={v => setNutrition({ ...nutrition, carbs: v })} />
          <NutritionInput label="Fett g" value={nutrition.fat} onChange={v => setNutrition({ ...nutrition, fat: v })} />
        </div>
      </div>
      <button onClick={save} className={primaryBtnCls}>Speichern</button>
    </div>
  );
}

function OtherPickerPanel({ onBack, onSelect }) {
  const options = ["Essen gehen", "Party", "bei Freunden", "Urlaub", "Bestellen", "Tiefkühl", "SinfOrMa"];
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm text-stone-400 flex items-center gap-1 mb-2"><ChevronLeft size={14} /> Zurück</button>
      <div className="grid grid-cols-1 gap-2">
        {options.map(opt => (
          <button key={opt} onClick={() => onSelect(opt)} className="w-full text-left p-3 rounded-lg border border-stone-250 hover:border-stone-400 hover:bg-stone-50 text-sm font-medium">
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function AddRecipeModal({ onClose, onSaved }) {
  const { addRecipe, showToast } = useApp();
  const [step, setStep] = useState('source');
  const [draft, setDraft] = useState(null);
  const goForm = (prefill) => { setDraft(prefill); setStep('form'); };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-full flex flex-col">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <span className="font-mono font-semibold uppercase tracking-wide text-sm">Neues Rezept</span>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {step === 'source' && <SourcePicker onPick={setStep} />}
          {step === 'firefox' && <FirefoxImportPanel onBack={() => setStep('source')} onNext={goForm} />}
          {step === 'cookbook' && <CookbookPanel onBack={() => setStep('source')} onNext={goForm} />}
          {step === 'ai' && <AISearchPanel onBack={() => setStep('source')} onNext={goForm} />}
          {step === 'other' && (
            <OtherPickerPanel
              onBack={() => setStep('source')}
              onSelect={async (title) => {
                const recipe = {
                  title,
                  servings: 1,
                  ingredients: [],
                  steps: [],
                  nutrition: null,
                  source: { type: 'other', label: 'Weiteres' },
                };
                const saved = await addRecipe(recipe);
                showToast(`${title} hinzugefügt`);
                if (onSaved) onSaved(saved);
                onClose();
              }}
            />
          )}
          {step === 'form' && <RecipeForm initial={draft} onBack={() => setStep('source')} onSave={async (recipe) => {
            const saved = await addRecipe(recipe);
            showToast('Rezept gespeichert');
            if (onSaved) onSaved(saved);
            onClose();
          }} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Recipes tab ---------------------------------- */
function RecipeDetailModal({ recipe: initialRecipe, multiplier = 1, onClose }) {
  const { recipes, updateRecipe, deleteRecipe, showToast } = useApp();
  const recipe = recipes.find(r => r.id === initialRecipe.id) || initialRecipe;
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  const [isWakeLocked, setIsWakeLocked] = useState(false);
  const wakeLockRef = useRef(null);

  const toggleWakeLock = async () => {
    if (!('wakeLock' in navigator)) {
      showToast('Wake Lock nicht unterstützt');
      return;
    }
    try {
      if (!isWakeLocked) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setIsWakeLocked(true);
        showToast('Bildschirm bleibt aktiv 🔆');
      } else {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        }
        setIsWakeLocked(false);
        showToast('Bildschirm-Ruhezustand aktiv 💤');
      }
    } catch (err) {
      console.error(err);
      showToast('Fehler bei Bildschirmsteuerung');
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.error("Re-acquiring wake lock failed:", err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, []);

  useEffect(() => { if (confirmDelete) { const t = setTimeout(() => setConfirmDelete(false), 3000); return () => clearTimeout(t); } }, [confirmDelete]);

  const formatIngredient = (ing) => {
    if (ing.amount == null) return ing.raw || ing.name;
    const scaledAmount = ing.amount * multiplier;
    const formattedAmt = Math.round(scaledAmount * 100) / 100;
    return `${formattedAmt} ${ing.unit || ''} ${ing.name}`.trim();
  };

  if (editing) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
        <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-full flex flex-col">
          <div className="p-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
            <span className="font-mono font-semibold uppercase tracking-wide text-sm">Rezept bearbeiten</span>
            <button onClick={onClose}><X size={20} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 min-h-0">
            <RecipeForm
              initial={{
                title: recipe.title, servingsText: String(recipe.servings),
                ingredientsText: ingredientsToText(recipe.ingredients), stepsText: recipe.steps.join('\n'),
                nutrition: recipe.nutrition || { kcal: '', protein: '', carbs: '', fat: '' },
                photo: recipe.photo, source: recipe.source,
              }}
              backLabel="Abbrechen"
              onBack={() => setEditing(false)}
              onSave={async (updated) => {
                await updateRecipe(recipe.id, { title: updated.title, servings: updated.servings, ingredients: updated.ingredients, steps: updated.steps, nutrition: updated.nutrition, photo: updated.photo, placeholder: false });
                showToast('Rezept aktualisiert');
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (fullScreen) {
    if (recipe.photo) {
      return (
        <div 
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-[100] cursor-zoom-out animate-fade-in"
          onClick={() => setFullScreen(false)}
        >
          <img 
            src={recipe.photo} 
            className="max-w-full max-h-full object-contain p-4 select-none animate-scale-up" 
            alt={recipe.title} 
          />
          <button 
            className="absolute top-4 right-4 text-white hover:text-stone-300 bg-black/55 p-2.5 rounded-full transition-colors hover:bg-black/75"
            onClick={(e) => { e.stopPropagation(); setFullScreen(false); }}
          >
            <X size={24} />
          </button>
        </div>
      );
    } else if (recipe.source?.url) {
      const preview = getRecipePreview(recipe);
      return (
        <div 
          className="fixed inset-0 bg-black/95 flex flex-col z-[100] animate-fade-in"
          onClick={() => setFullScreen(false)}
        >
          <div className="bg-stone-900 text-white p-3 flex items-center gap-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFullScreen(false)} className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-300 hover:text-white" title="Zurück">
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 bg-stone-800 rounded-lg px-3 py-1.5 text-xs font-mono truncate text-stone-300 select-all">
              {recipe.source.url}
            </div>
            <a href={recipe.source.url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1.5 text-xs font-semibold px-3 flex-shrink-0" title="Website öffnen">
              <ExternalLink size={14} />
              <span>Website öffnen</span>
            </a>
            <button onClick={() => setFullScreen(false)} className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-300 hover:text-white" title="Schließen">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden cursor-zoom-out p-4">
            {preview ? (
              <img 
                src={preview} 
                className="max-w-full max-h-full object-contain select-none animate-scale-up" 
                alt={recipe.title} 
              />
            ) : (
              <div className="text-stone-400 font-mono text-sm">Keine Vorschau verfügbar</div>
            )}
          </div>
        </div>
      );
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-lg max-h-full flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-200 flex items-center justify-between flex-shrink-0">
          <span className="font-mono font-semibold truncate">{recipe.title}</span>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <button onClick={() => setEditing(true)} className="text-stone-400 hover:text-stone-900"><Edit2 size={17} /></button>
            <button onClick={onClose}><X size={20} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {recipe.placeholder && (
            <div className="text-xs bg-amber-50 text-amber-700 px-3 py-2 rounded-lg">Platzhalter – bitte über „Bearbeiten" ausfüllen.</div>
          )}
          {getRecipePreview(recipe) && (
            <div 
              className={`relative group overflow-hidden rounded-lg border border-stone-200 ${
                recipe.source?.url ? 'cursor-pointer' : 'cursor-zoom-in'
              }`}
              onClick={() => {
                if (recipe.source?.url) {
                  window.open(recipe.source.url, '_blank', 'noopener,noreferrer');
                } else {
                  setFullScreen(true);
                }
              }}
              title={recipe.source?.url ? 'Website in neuem Tab öffnen' : 'Bild vergrößern'}
            >
              <img 
                src={getRecipePreview(recipe)} 
                className="w-full h-40 object-cover" 
                alt={recipe.title} 
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                {recipe.source?.url ? (
                  <ExternalLink size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm" />
                ) : (
                  <Search size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-sm" />
                )}
              </div>
              {recipe.source?.url && (
                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-[10px] text-white font-mono px-2 py-0.5 rounded flex items-center gap-1">
                  <ExternalLink size={10} /> {recipe.photo ? 'Link öffnen' : 'Website-Vorschau'}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <StarRating value={recipe.rating} onChange={(v) => updateRecipe(recipe.id, { rating: v })} size={20} />
            <button
              onClick={toggleWakeLock}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono border transition-colors ${
                isWakeLocked
                  ? 'bg-amber-500 text-white border-amber-500 animate-pulse'
                  : 'bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100 hover:text-stone-700'
              }`}
              title={isWakeLocked ? 'Bildschirm-Ruhezustand zulassen' : 'Verhindern, dass der Bildschirm ausgeht'}
            >
              <Sun size={12} className={isWakeLocked ? 'animate-spin' : ''} />
              <span>{isWakeLocked ? 'Wach aktiv' : 'Wach bleiben'}</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-stone-500 font-mono">
            {multiplier !== 1 ? (
              <span className="px-2.5 py-1 bg-amber-100 text-amber-900 font-bold rounded-full">
                {Math.round(recipe.servings * multiplier * 100) / 100} Portionen (Original: {recipe.servings})
              </span>
            ) : (
              <span className="px-2 py-1 bg-stone-100 rounded-full">{recipe.servings} Portionen</span>
            )}
            {recipe.source && recipe.source.label && <span className="px-2 py-1 bg-stone-100 rounded-full">{recipe.source.label}</span>}
            {recipe.source && recipe.source.url && <a href={recipe.source.url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-stone-100 rounded-full flex items-center gap-1">Quelle <ExternalLink size={10} /></a>}
          </div>
          {recipe.nutrition && (
            <div className="grid grid-cols-4 gap-2 text-center">
              {NUTRIENT_KEYS.map(k => (
                <div key={k} className="bg-stone-50 rounded-lg py-2">
                  <div className="text-sm font-semibold font-mono">{Math.round((recipe.nutrition[k] || 0) * multiplier)}</div>
                  <div className="text-xs text-stone-400">{NUTRIENT_LABELS[k]}</div>
                </div>
              ))}
            </div>
          )}
          {recipe.ingredients.length > 0 && (
            <div>
              <div className={labelCls + " mb-1"}>Zutaten</div>
              <ul className="text-sm text-stone-600 space-y-0.5">{recipe.ingredients.map((ing, i) => <li key={i}>• {formatIngredient(ing)}</li>)}</ul>
            </div>
          )}
          {recipe.steps.length > 0 && (
            <div>
              <div className={labelCls + " mb-1"}>Zubereitung</div>
              <ol className="text-sm text-stone-600 space-y-1 list-decimal list-inside">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </div>
          )}
          <button onClick={() => confirmDelete ? (deleteRecipe(recipe.id), onClose()) : setConfirmDelete(true)} className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium ${confirmDelete ? 'border-rose-600 bg-rose-50 text-rose-700' : 'border-rose-200 text-rose-600'}`}>
            <Trash2 size={16} /> {confirmDelete ? 'Wirklich löschen?' : 'Rezept löschen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipeGridItem({ recipe, onClick, onLongPress }) {
  const handlers = useLongPress(
    () => onLongPress(recipe),
    () => onClick(recipe)
  );
  return (
    <div 
      {...handlers} 
      className="bg-white rounded-xl border border-stone-200 overflow-hidden text-left cursor-pointer hover:border-stone-400 hover:bg-stone-50 transition-colors"
    >
      {getRecipePreview(recipe) ? (
        <img src={getRecipePreview(recipe)} className="w-full h-24 object-cover" alt="" />
      ) : (
        <div className="w-full h-24 bg-stone-100 flex items-center justify-center">
          <Utensils size={20} className="text-stone-300" />
        </div>
      )}
      <div className="p-2.5">
        <div className="text-sm font-medium truncate flex items-center gap-1">
          {recipe.title}
          {recipe.placeholder && <span className="text-amber-500">●</span>}
        </div>
        <div className="text-xs text-stone-400 font-mono">
          {recipe.nutrition ? `${recipe.nutrition.kcal} kcal` : 'keine Nährwerte'}
        </div>
      </div>
    </div>
  );
}

function ManageRecipeModal({ recipe, onClose }) {
  const { updateRecipe, deleteRecipe, showToast } = useApp();
  const [title, setTitle] = useState(recipe.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await updateRecipe(recipe.id, { title: title.trim() });
      showToast('Rezept umbenannt');
      onClose();
    } catch (err) {
      showToast('Fehler beim Umbenennen', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteRecipe(recipe.id);
      showToast('Rezept gelöscht');
      onClose();
    } catch (err) {
      showToast('Fehler beim Löschen', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md p-4 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center pb-2 border-b border-stone-150">
          <span className="font-mono font-semibold uppercase tracking-wide text-sm">Rezept verwalten</span>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700"><X size={20} /></button>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className={labelCls}>Name des Rezepts</label>
            <input 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              className={inputCls + " mt-1"} 
              required 
            />
          </div>
          <button type="submit" className={primaryBtnCls}>Speichern</button>
        </form>
        <div className="pt-2 border-t border-stone-100">
          {confirmDelete ? (
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={handleDelete} 
                className="flex-1 py-2.5 rounded-lg bg-rose-600 text-white font-mono uppercase tracking-wide text-xs font-semibold hover:bg-rose-700 transition-colors"
              >
                Ja, endgültig löschen
              </button>
              <button 
                type="button"
                onClick={() => setConfirmDelete(false)} 
                className="flex-1 py-2.5 rounded-lg border border-stone-300 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors"
              >
                Nein, Abbrechen
              </button>
            </div>
          ) : (
            <button 
              type="button"
              onClick={() => setConfirmDelete(true)} 
              className="w-full py-2.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-mono uppercase tracking-wide font-semibold hover:bg-rose-50 transition-colors"
            >
              Rezept löschen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RecipesTab() {
  const { recipes, openAddRecipe } = useApp();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [manageRecipe, setManageRecipe] = useState(null);
  const filtered = recipes.filter(r => !r.doNotSaveInBook).filter(r => r.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rezepte durchsuchen" className={inputCls + " pl-9"} />
        </div>
        <button onClick={() => openAddRecipe({})} className="px-4 rounded-lg bg-stone-900 text-white flex-shrink-0"><Plus size={18} /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {filtered.map(r => (
          <RecipeGridItem
            key={r.id}
            recipe={r}
            onClick={(recipe) => setSelected(recipe)}
            onLongPress={(recipe) => setManageRecipe(recipe)}
          />
        ))}
      </div>
      {filtered.length === 0 && <div className="text-center text-sm text-stone-400 py-10">Noch keine Rezepte – tippe auf + um eines hinzuzufügen.</div>}
      {selected && <RecipeDetailModal recipe={selected} onClose={() => setSelected(null)} />}
      {manageRecipe && <ManageRecipeModal recipe={manageRecipe} onClose={() => setManageRecipe(null)} />}
    </div>
  );
}

/* ---------------------------------- Shopping tab ---------------------------------- */
function ShoppingTab() {
  const { recipes } = useApp();
  const [start, setStart] = useState(todayKey());
  const [days, setDays] = useState(7);
  const [items, setItems] = useState(null);
  const [checked, setChecked] = useState({});
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    const startDate = new Date(start + 'T00:00:00');
    const usage = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate); d.setDate(d.getDate() + i);
      const plan = await storageGet(`mealplan:${dateKey(d)}`, true, null);
      if (!plan) continue;
      for (const mt of MEAL_KEYS) for (const co of COURSE_KEYS) {
        const slot = plan[mt] && plan[mt][co];
        if (slot) {
          const recipe = recipes.find(r => r.id === slot.recipeId);
          if (recipe) usage.push({ recipe, multiplier: slot.multiplier });
        }
      }
    }
    setItems(aggregateIngredients(usage));
    setChecked({});
    setLoading(false);
  };

  const listText = items ? items.map(i => `${i.amount ? Math.round(i.amount * 10) / 10 + ' ' + (i.unit || '') : ''} ${i.name}`.trim()).join('\n') : '';
  const copyList = async () => { try { await navigator.clipboard.writeText(listText); } catch (e) { } };

  return (
    <div className="space-y-4">
      <div className={cardCls + " space-y-3"}>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCls}>Von</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inputCls + " mt-1"} />
          </div>
          <div className="w-20">
            <label className={labelCls}>Tage</label>
            <input type="number" min="1" max="14" value={days} onChange={e => setDays(parseInt(e.target.value) || 1)} className={inputCls + " mt-1"} />
          </div>
        </div>
        <button onClick={generate} disabled={loading} className={primaryBtnCls}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />} Liste erstellen
        </button>
      </div>

      {items && (
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono font-semibold uppercase tracking-wide text-sm">Zutaten ({items.length})</span>
            <button onClick={copyList} className="text-xs text-stone-500 hover:text-stone-900 flex items-center gap-1 font-mono uppercase tracking-wide"><Copy size={12} /> Kopieren</button>
          </div>
          <div className="space-y-1 mb-3">
            {items.map((it, i) => (
              <label key={i} className="flex items-center gap-2 py-1.5 border-b border-stone-100 last:border-0">
                <input type="checkbox" checked={!!checked[i]} onChange={() => setChecked({ ...checked, [i]: !checked[i] })} />
                <span className={`text-sm flex-1 ${checked[i] ? 'line-through text-stone-300' : ''}`}>
                  {it.amount ? `${Math.round(it.amount * 10) / 10} ${it.unit || ''} ` : ''}{it.name}
                </span>
              </label>
            ))}
            {items.length === 0 && <div className="text-sm text-stone-400 text-center py-4">Keine Zutaten im Zeitraum geplant.</div>}
          </div>
          {items.length > 0 && (
            <div>
              <label className={labelCls}>Zum Kopieren markieren</label>
              <textarea readOnly value={listText} onClick={e => e.target.select()} rows={Math.min(10, items.length + 1)} className={inputCls + " mt-1 font-mono"} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Cookbook tab ---------------------------------- */
function CookbookTab() {
  const { recipes, settings, updateSettings, updateRecipe, deleteRecipe, closeVolume, showToast } = useApp();
  const volumes = settings.cookbookVolumes || [];
  const openVol = volumes.find(v => !v.closedAt);
  const [selectedVolId, setSelectedVolId] = useState((openVol && openVol.id) || (volumes[0] && volumes[0].id));
  const [editTitle, setEditTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [closing, setClosing] = useState(false);
  const [newVolTitle, setNewVolTitle] = useState('');

  useEffect(() => { if (!selectedVolId && volumes[0]) setSelectedVolId(volumes[0].id); }, [volumes.length]);

  const selectedVol = volumes.find(v => v.id === selectedVolId) || volumes[0];
  const volRecipes = selectedVol ? recipes.filter(r => r.bookVolume === selectedVol.id && !r.doNotSaveInBook) : [];

  const saveTitle = () => {
    const nextVols = volumes.map(v => v.id === selectedVol.id ? { ...v, title: titleDraft.trim() || v.title } : v);
    updateSettings({ cookbookVolumes: nextVols });
    setEditTitle(false);
  };
  const dateRangeLabel = (v) => {
    const s = new Date(v.startedAt);
    const startTxt = `${s.getDate()}.${s.getMonth() + 1}.${s.getFullYear()}`;
    if (!v.closedAt) return `seit ${startTxt}`;
    const e = new Date(v.closedAt);
    return `${startTxt} – ${e.getDate()}.${e.getMonth() + 1}.${e.getFullYear()}`;
  };

  if (!selectedVol) return <div className="text-center text-sm text-stone-400 py-10">Lädt...</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {volumes.slice().reverse().map(v => (
          <button key={v.id} onClick={() => setSelectedVolId(v.id)} className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap ${v.id === selectedVolId ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>
            {v.title}{!v.closedAt && ' ●'}
          </button>
        ))}
      </div>

      <div className="bg-stone-900 rounded-xl p-8 text-center">
        <div className="inline-block border-2 border-stone-700 px-6 py-4 rounded">
          <div className="font-mono text-xs tracking-widest text-stone-500 mb-1">REZEPTSAMMLUNG</div>
          {editTitle ? (
            <div className="flex gap-2 justify-center items-center">
              <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} className="px-2 py-1 rounded text-stone-900 text-sm" />
              <button onClick={saveTitle} className="text-white"><Check size={16} /></button>
            </div>
          ) : (
            <button onClick={() => { setTitleDraft(selectedVol.title); setEditTitle(true); }} className="flex items-center gap-2 mx-auto">
              <span className="font-mono text-2xl font-bold text-white tracking-tight">{selectedVol.title}</span>
              <Edit2 size={13} className="text-stone-500" />
            </button>
          )}
        </div>
        <p className="text-xs text-stone-500 mt-3 font-mono">{volRecipes.length} REZEPTE · {dateRangeLabel(selectedVol).toUpperCase()}</p>
      </div>

      {!selectedVol.closedAt && (
        closing ? (
          <div className={cardCls + " space-y-2"}>
            <label className={labelCls}>Titel für neues Kochbuch</label>
            <input value={newVolTitle} onChange={e => setNewVolTitle(e.target.value)} placeholder={`Band ${volumes.length + 1}`} className={inputCls} />
            <div className="flex gap-2">
              <button onClick={() => setClosing(false)} className={secondaryBtnCls}>Abbrechen</button>
              <button onClick={async () => { await closeVolume(newVolTitle); setClosing(false); setNewVolTitle(''); showToast('Neues Kochbuch gestartet'); }} className={primaryBtnCls}>Bestätigen</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setClosing(true)} className={secondaryBtnCls}><BookOpen size={16} /> Kochbuch beenden &amp; neues starten</button>
        )
      )}

      <button onClick={() => window.print()} className={secondaryBtnCls}>
        <Printer size={16} /> Drucken / Als PDF speichern
      </button>

      <div id="cookbook-print" className="space-y-4">
        {volRecipes.map(r => (
          <div key={r.id} className="bg-white rounded-xl border border-stone-200 p-4 break-inside-avoid">
            <div className="flex gap-3">
              {getRecipePreview(r) && <img src={getRecipePreview(r)} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-mono font-semibold truncate flex items-center gap-1.5">
                  {r.title}
                  {r.placeholder && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-sans normal-case flex-shrink-0">Ausfüllen</span>}
                </div>
                <div className="text-xs text-stone-400 font-mono">{r.servings} Portionen{r.nutrition ? ` · ${r.nutrition.kcal} kcal/Portion` : ''}</div>
                <StarRating value={r.rating} onChange={(v) => updateRecipe(r.id, { rating: v })} size={14} />
              </div>
              <div className="no-print"><RemoveButton onConfirm={() => deleteRecipe(r.id)} /></div>
            </div>
            {!r.placeholder && (
              <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                <ul className="text-stone-600 space-y-0.5">{r.ingredients.map((ing, i) => <li key={i}>• {ing.raw}</li>)}</ul>
                <ol className="text-stone-600 space-y-0.5 list-decimal list-inside">{r.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              </div>
            )}
          </div>
        ))}
        {volRecipes.length === 0 && <div className="text-center text-sm text-stone-400 py-10">Noch keine Rezepte in diesem Band.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------- Settings tab ---------------------------------- */
function SettingsTab() {
  const {
    settings, updateSettings, profile,
    bookmarksRecipes, bookmarksPages,
    saveBookmarksRecipes, saveBookmarksPages,
    clearBookmarksRecipes, clearBookmarksPages,
    showToast
  } = useApp();
  const [people, setPeople] = useState(settings.people);
  const [cookbookInput, setCookbookInput] = useState('');
  const [bmBusy, setBmBusy] = useState(null);
  const cookbookSort = settings.cookbookSort || 'date-desc';
  const setCookbookSort = async (val) => { await updateSettings({ cookbookSort: val }); };
  useEffect(() => { setPeople(settings.people); }, [settings.people]);

  const savePeople = async () => { await updateSettings({ people }); showToast('Gespeichert'); };
  const handleNotificationToggle = async (enabled) => {
    if (enabled) {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'denied') {
          showToast('Mitteilungsberechtigung wurde blockiert. Bitte in den Browsereinstellungen freigeben.', 'error');
        } else if (permission === 'default') {
          showToast('Mitteilungsberechtigung ist erforderlich für System-Mitteilungen.', 'warning');
        }
      } else {
        showToast('Dieser Browser unterstützt keine System-Mitteilungen.', 'warning');
      }
    }
    await updateSettings({ notificationEnabled: enabled });
  };
  const addCookbook = async () => {
    const titleToAdd = cookbookInput.trim();
    if (!titleToAdd) return;
    const exists = settings.cookbooks.some(c => (typeof c === 'string' ? c : c.title) === titleToAdd);
    if (exists) {
      showToast('Dieses Kochbuch existiert bereits!', 'error');
      return;
    }
    await updateSettings({ cookbooks: [...settings.cookbooks, { title: titleToAdd, addedAt: Date.now() }] });
    setCookbookInput('');
  };
  const removeCookbook = async (c) => {
    const cTitle = typeof c === 'string' ? c : c.title;
    await updateSettings({ cookbooks: settings.cookbooks.filter(x => (typeof x === 'string' ? x : x.title) !== cTitle) });
  };
  const switchProfile = async (idx) => {
    await storageSet('profile', { personIndex: idx }, false);
    window.location.reload();
  };
  const handleBookmarkUpload = async (file, type) => {
    setBmBusy(type);
    try {
      const parsed = await parseBookmarksFile(file);
      if (type === 'recipes') {
        await saveBookmarksRecipes(parsed);
      } else {
        await saveBookmarksPages(parsed);
      }
      showToast('Favoriten aktualisiert');
    }
    catch (e) { showToast('Datei konnte nicht gelesen werden', 'error'); }
    finally { setBmBusy(null); }
  };

  const sortedCookbooks = [...settings.cookbooks].sort((a, b) => {
    const titleA = (typeof a === 'string' ? a : a.title).toLowerCase();
    const titleB = (typeof b === 'string' ? b : b.title).toLowerCase();
    const dateA = typeof a === 'string' ? 0 : a.addedAt || 0;
    const dateB = typeof b === 'string' ? 0 : b.addedAt || 0;

    if (cookbookSort === 'alpha-asc') {
      return titleA.localeCompare(titleB);
    } else if (cookbookSort === 'alpha-desc') {
      return titleB.localeCompare(titleA);
    } else if (cookbookSort === 'date-asc') {
      return dateA - dateB || titleA.localeCompare(titleB);
    } else { // 'date-desc'
      return dateB - dateA || titleA.localeCompare(titleB);
    }
  });

  return (
    <div className="space-y-4">
      <div className={cardCls}>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2 font-mono uppercase tracking-wide"><Users size={15} /> Personen &amp; Tagesziele</div>
        {people.map((p, i) => (
          <div key={i} className="mb-3 last:mb-0 p-3 bg-stone-50 rounded-lg">
            <input value={p.name} onChange={e => { const next = [...people]; next[i] = { ...next[i], name: e.target.value }; setPeople(next); }} className={inputCls + " text-sm font-medium mb-2"} />
            <div className="grid grid-cols-4 gap-2">
              {NUTRIENT_KEYS.map(k => (
                <div key={k}>
                  <input type="number" value={p.targets[k]} onChange={e => { const next = [...people]; next[i] = { ...next[i], targets: { ...next[i].targets, [k]: parseInt(e.target.value) || 0 } }; setPeople(next); }} className="w-full px-2 py-1 rounded-lg border border-stone-300 text-sm text-center focus:outline-none focus:ring-1 focus:ring-stone-900" />
                  <div className="text-xs text-stone-400 text-center mt-0.5 font-mono">{NUTRIENT_LABELS[k]}</div>
                </div>
              ))}
            </div>
            {profile.personIndex === i && <div className="text-xs text-stone-400 mt-1.5 font-mono">DIESES GERÄT</div>}
          </div>
        ))}
        <button onClick={savePeople} className={primaryBtnCls + " mt-1"}>Speichern</button>
      </div>

      <div className={cardCls}>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2 font-mono uppercase tracking-wide"><Calendar size={15} /> Kalender-Einstellungen</div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Standardansicht</label>
            <div className="flex gap-2 mt-1">
              <button onClick={() => updateSettings({ defaultCalendarView: 'week' })} className={`flex-1 py-2 rounded-lg text-sm font-mono ${settings.defaultCalendarView !== 'day' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Woche</button>
              <button onClick={() => updateSettings({ defaultCalendarView: 'day' })} className={`flex-1 py-2 rounded-lg text-sm font-mono ${settings.defaultCalendarView === 'day' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>Tag</button>
            </div>
          </div>
          <label className="flex items-center gap-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={!!settings.showNextMonday} onChange={e => updateSettings({ showNextMonday: e.target.checked })} className="rounded border-stone-300 text-stone-900 focus:ring-stone-900" />
            <span className="text-sm text-stone-700">Nächsten Montag in Wochenansicht anzeigen (8 Tage)</span>
          </label>
        </div>
      </div>

      <div className={cardCls}>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2 font-mono uppercase tracking-wide">
          <Bell size={15} /> Erinnerungen
        </div>
        <div className="space-y-3">
          <label className="flex items-center gap-2 py-1.5 cursor-pointer">
            <input 
              type="checkbox" 
              checked={!!settings.notificationEnabled} 
              onChange={e => handleNotificationToggle(e.target.checked)} 
              className="rounded border-stone-300 text-stone-900 focus:ring-stone-900" 
            />
            <span className="text-sm text-stone-700">Erinnerungen aktivieren</span>
          </label>
          
          {settings.notificationEnabled && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className={labelCls}>Wochentag</label>
                <select 
                  value={settings.notificationDay ?? 1} 
                  onChange={e => updateSettings({ notificationDay: parseInt(e.target.value) })}
                  className={inputCls + " text-sm font-mono mt-1"}
                >
                  <option value={1}>Montag</option>
                  <option value={2}>Dienstag</option>
                  <option value={3}>Mittwoch</option>
                  <option value={4}>Donnerstag</option>
                  <option value={5}>Freitag</option>
                  <option value={6}>Samstag</option>
                  <option value={0}>Sonntag</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Uhrzeit</label>
                <input 
                  type="time" 
                  value={settings.notificationTime || '18:00'} 
                  onChange={e => updateSettings({ notificationTime: e.target.value })}
                  className={inputCls + " text-sm font-mono mt-1"}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={cardCls}>
        <div className="text-sm font-semibold mb-2 flex items-center gap-2 font-mono uppercase tracking-wide">
          <Sparkles size={15} className="text-amber-500" /> KI-Einstellungen
        </div>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>KI-Anbieter</label>
            <div className="flex gap-2 mt-1">
              <button 
                onClick={() => updateSettings({ aiProvider: 'gemini' })} 
                className={`flex-1 py-2 rounded-lg text-sm font-mono ${settings.aiProvider !== 'claude' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}
              >
                Gemini (Standard)
              </button>
              <button 
                onClick={() => updateSettings({ aiProvider: 'claude' })} 
                className={`flex-1 py-2 rounded-lg text-sm font-mono ${settings.aiProvider === 'claude' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}
              >
                Claude (Fallback)
              </button>
            </div>
          </div>
          <p className="text-xs text-stone-500 leading-normal">
            API-Keys werden ausschließlich im Cloudflare Worker hinterlegt – niemals im Browser sichtbar.
          </p>
        </div>
      </div>

      <div className={cardCls}>
        <div className="text-sm font-semibold mb-2 font-mono uppercase tracking-wide">Gerät zuordnen</div>
        <div className="flex gap-2">
          {settings.people.map((p, i) => (
            <button key={i} onClick={() => switchProfile(i)} className={`flex-1 py-2 rounded-lg text-sm font-mono ${profile.personIndex === i ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{p.name}</button>
          ))}
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex justify-between items-center mb-2">
          <div className="text-sm font-semibold font-mono uppercase tracking-wide">Kochbücher (physisch)</div>
          {settings.cookbooks.length > 1 && (
            <select 
              value={cookbookSort} 
              onChange={e => setCookbookSort(e.target.value)} 
              className="text-xs border-0 bg-transparent text-stone-500 font-mono focus:ring-0 focus:outline-none cursor-pointer hover:text-stone-900 pr-6 py-0.5"
            >
              <option value="date-desc">Neueste zuerst</option>
              <option value="date-asc">Älteste zuerst</option>
              <option value="alpha-asc">A-Z (aufsteigend)</option>
              <option value="alpha-desc">Z-A (absteigend)</option>
            </select>
          )}
        </div>
        <div className="flex gap-2 mb-2">
          <input value={cookbookInput} onChange={e => setCookbookInput(e.target.value)} placeholder="Titel hinzufügen" className={inputCls} onKeyDown={e => e.key === 'Enter' && addCookbook()} />
          <button onClick={addCookbook} className="px-3 rounded-lg bg-stone-900 text-white flex-shrink-0"><Plus size={16} /></button>
        </div>
        <div className="space-y-1">
          {sortedCookbooks.map(c => {
            const val = typeof c === 'string' ? c : c.title;
            return (
              <div key={val} className="flex items-center justify-between px-3 py-2 bg-stone-50 rounded-lg text-sm">
                <span>{val}</span>
                <button onClick={() => removeCookbook(c)} title="Entfernen"><X size={14} className="text-stone-400 hover:text-rose-500" /></button>
              </div>
            );
          })}
          {settings.cookbooks.length === 0 && <div className="text-xs text-stone-400">Noch keine hinterlegt.</div>}
        </div>
      </div>

      <div className={cardCls}>
        <div className="text-sm font-semibold mb-2 font-mono uppercase tracking-wide">Firefox-Favoriten: Rezepte</div>
        <p className="text-xs text-stone-500 mb-2">{bookmarksRecipes.length} Rezepte gespeichert – Grundlage für Direkt-Import.</p>
        <div className="flex gap-2 mb-4">
          <label className={secondaryBtnCls + " cursor-pointer"}>
            {bmBusy === 'recipes' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Aktualisieren
            <input type="file" accept=".html,.htm" className="hidden" onChange={e => e.target.files[0] && handleBookmarkUpload(e.target.files[0], 'recipes')} />
          </label>
          {bookmarksRecipes.length > 0 && <button onClick={clearBookmarksRecipes} className="px-3 rounded-lg border border-stone-300 text-stone-500 text-sm flex-shrink-0">Leeren</button>}
        </div>

        <div className="text-sm font-semibold mb-2 font-mono uppercase tracking-wide border-t border-stone-100 pt-3">Firefox-Favoriten: Seiten</div>
        <p className="text-xs text-stone-500 mb-2">{bookmarksPages.length} Koch-Webseiten gespeichert – Grundlage für Domänen-Suche im Wochenplaner.</p>
        <div className="flex gap-2">
          <label className={secondaryBtnCls + " cursor-pointer"}>
            {bmBusy === 'pages' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Aktualisieren
            <input type="file" accept=".html,.htm" className="hidden" onChange={e => e.target.files[0] && handleBookmarkUpload(e.target.files[0], 'pages')} />
          </label>
          {bookmarksPages.length > 0 && <button onClick={clearBookmarksPages} className="px-3 rounded-lg border border-stone-300 text-stone-500 text-sm flex-shrink-0">Leeren</button>}
        </div>
      </div>




      <div className={cardCls + " bg-stone-50 border-dashed border-stone-300 text-center flex flex-col items-center justify-center p-4"}>
        <div className="text-xs text-stone-400 font-mono uppercase tracking-widest">Programmversion</div>
        <div className="text-lg font-bold text-stone-800 mt-1">v1.6.0</div>
        <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full mt-1.5 border border-emerald-100 uppercase tracking-wider font-mono">
          Codename: Gyros 🥙
        </div>
        <div className="text-[10px] text-stone-450 mt-2 font-mono uppercase leading-normal">
          Verlauf: v1.0.0 (Apfelkuchen) · v1.1.0 (Brokkoliauflauf) · v1.2.0 (Cacio e Pepe) · v1.3.6 (Dampfnudel) · v1.4.1 (Erbsensuppe) · v1.5.7 (Flammkuchen) · v1.6.0 (Gyros)
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Reminder Modal ---------------------------------- */
function ReminderModal({ onClose, onAction }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl space-y-4 border border-stone-200 animate-scale-up">
        <div className="flex items-center gap-3">
          <div className="bg-stone-100 p-2.5 rounded-full text-stone-700">
            <Bell size={24} className="animate-bounce" />
          </div>
          <div>
            <h3 className="font-semibold text-stone-800 font-mono uppercase tracking-wide text-xs">Erinnerung</h3>
            <p className="text-[10px] text-stone-400 font-mono">Tischplan Speiseplaner</p>
          </div>
        </div>
        <div className="text-stone-700 font-semibold text-base py-1">
          Rezepte in Tischplan eintragen
        </div>
        <div className="space-y-2 pt-2">
          <button 
            onClick={() => onAction('generate')} 
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-stone-900 text-white font-mono uppercase tracking-wide text-xs font-semibold hover:bg-stone-850 active:scale-[0.99]"
          >
            Plan automatisch generieren
          </button>
          <button 
            onClick={() => onAction('ok')} 
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-stone-300 text-stone-700 text-sm font-medium hover:bg-stone-50 active:scale-[0.99]"
          >
            OK
          </button>
          <button 
            onClick={() => onAction('snooze')} 
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs text-stone-450 hover:text-stone-900 hover:underline font-mono uppercase tracking-wider text-center"
          >
            Verschieben (1 Stunde)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Move Meal Modal ---------------------------------- */
function MoveMealModal({ data, onClose }) {
  const { getDayPlan, saveDayPlan, recipes, showToast, triggerRefresh } = useApp();
  const [targetDate, setTargetDate] = useState(data.sourceDate);
  const [targetMeal, setTargetMeal] = useState(data.mealKey);
  const [targetCourse, setTargetCourse] = useState(data.courseKey);
  const [multiplier, setMultiplier] = useState(String(data.multiplier || 1));
  const [busy, setBusy] = useState(false);

  const recipe = recipes.find(r => r.id === data.recipeId);
  const isSameSlot = targetDate === data.sourceDate && targetMeal === data.mealKey && targetCourse === data.courseKey;

  const handleMove = async () => {
    if (!targetDate) return;
    setBusy(true);
    try {
      const parsedMultiplier = parseFloat(multiplier) || 1;

      if (isSameSlot) {
        const plan = await getDayPlan(data.sourceDate);
        if (!plan[targetMeal]) {
          plan[targetMeal] = { snack: null, main: null, dessert: null };
        }
        plan[targetMeal][targetCourse] = { recipeId: data.recipeId, multiplier: parsedMultiplier };
        await saveDayPlan(data.sourceDate, plan);
        showToast("Menge aktualisiert");
      } else {
        // 1. Remove from source
        const sourcePlan = await getDayPlan(data.sourceDate);
        if (sourcePlan[data.mealKey]) {
          sourcePlan[data.mealKey][data.courseKey] = null;
        }
        await saveDayPlan(data.sourceDate, sourcePlan);

        // 2. Add to target
        const targetPlan = await getDayPlan(targetDate);
        if (!targetPlan[targetMeal]) {
          targetPlan[targetMeal] = { snack: null, main: null, dessert: null };
        }
        targetPlan[targetMeal][targetCourse] = { recipeId: data.recipeId, multiplier: parsedMultiplier };
        await saveDayPlan(targetDate, targetPlan);
        showToast("Essen verschoben");
      }

      triggerRefresh();
      onClose();
    } catch (e) {
      console.error(e);
      showToast(isSameSlot ? "Speichern fehlgeschlagen" : "Verschieben fehlgeschlagen", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const sourcePlan = await getDayPlan(data.sourceDate);
      if (sourcePlan[data.mealKey]) {
        sourcePlan[data.mealKey][data.courseKey] = null;
      }
      await saveDayPlan(data.sourceDate, sourcePlan);

      showToast("Essen gelöscht");
      triggerRefresh();
      onClose();
    } catch (e) {
      console.error(e);
      showToast("Löschen fehlgeschlagen", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-full flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-stone-200 flex items-center justify-end flex-shrink-0">
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs text-stone-400 font-mono uppercase">Gericht</div>
            <div className="text-sm font-semibold text-stone-850 mt-0.5">{recipe?.title || "Unbekannt"}</div>
          </div>
          <div>
            <label className={labelCls}>Menge (x-fach)</label>
            <input 
              type="number" 
              step="0.5" 
              min="0.1" 
              value={multiplier} 
              onChange={e => setMultiplier(e.target.value)} 
              className={inputCls + " mt-1 font-mono"} 
            />
          </div>
          <div>
            <label className={labelCls}>Ziel-Datum</label>
            <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className={inputCls + " mt-1"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Mahlzeit</label>
              <select value={targetMeal} onChange={e => setTargetMeal(e.target.value)} className={inputCls + " mt-1 bg-white"}>
                {MEAL_TIMES.map(mt => <option key={mt.key} value={mt.key}>{mt.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Gang</label>
              <select value={targetCourse} onChange={e => setTargetCourse(e.target.value)} className={inputCls + " mt-1 bg-white"}>
                {COURSES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className={secondaryBtnCls} disabled={busy}>Abbrechen</button>
            <button onClick={handleDelete} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-rose-200 text-rose-600 text-sm font-medium active:scale-[0.99] disabled:opacity-40 hover:bg-rose-50/50" disabled={busy}>
              <Trash2 size={14} /> Löschen
            </button>
            <button onClick={handleMove} className={primaryBtnCls} disabled={busy || !targetDate}>
              {busy ? (isSameSlot ? "Speichere..." : "Verschiebe...") : (isSameSlot ? "Speichern" : "Verschieben")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- App ---------------------------------- */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [profile, setProfile] = useState(null);
  const [mealplanIndex, setMealplanIndex] = useState({});
  const [bookmarksRecipes, setBookmarksRecipes] = useState([]);
  const [bookmarksPages, setBookmarksPages] = useState([]);
  const [tab, setTab] = useState('calendar');
  const [toast, setToast] = useState(null);
  const [addModal, setAddModal] = useState(null);
  const [recipeDetailModal, setRecipeDetailModal] = useState(null);
  const [moveMealModal, setMoveMealModal] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [plannerOpen, setPlannerOpen] = useState(false);

  const recipesRef = useRef([]);
  const mealplanIndexRef = useRef({});

  useEffect(() => {
    recipesRef.current = recipes;
  }, [recipes]);

  useEffect(() => {
    mealplanIndexRef.current = mealplanIndex;
  }, [mealplanIndex]);

  useEffect(() => {
    (async () => {
      const [r, s, p, idx, bmRecipes, bmPages] = await Promise.all([
        storageGet('recipes', true, []),
        storageGet('settings', true, DEFAULT_SETTINGS),
        storageGet('profile', false, null),
        storageGet('mealplan_index', true, {}),
        storageGet('firefox_bookmarks_recipes', true, []),
        storageGet('firefox_bookmarks_pages', true, []),
      ]);

      let settingsNext = s, recipesNext = r, persistSettings = false, persistRecipes = false;
      if (!settingsNext.cookbooks) {
        settingsNext = { ...settingsNext, cookbooks: [] };
        persistSettings = true;
      } else if (settingsNext.cookbooks.length > 0) {
        let migrated = false;
        const migratedCookbooks = settingsNext.cookbooks.map(c => {
          if (typeof c === 'string') {
            migrated = true;
            return { title: c, addedAt: Date.now() };
          }
          return c;
        });
        if (migrated) {
          settingsNext = { ...settingsNext, cookbooks: migratedCookbooks };
          persistSettings = true;
        }
      }
      if (!settingsNext.cookbookVolumes || settingsNext.cookbookVolumes.length === 0) {
        const vol = { id: uid(), title: settingsNext.coverTitle || 'Unser Kochbuch', startedAt: new Date().toISOString(), closedAt: null };
        settingsNext = { ...settingsNext, cookbookVolumes: [vol] };
        recipesNext = recipesNext.map(rec => rec.bookVolume ? rec : { ...rec, bookVolume: vol.id });
        persistSettings = true; persistRecipes = true;
      }
      const fixedRecipes = recipesNext.map(rec => ('rating' in rec ? rec : { ...rec, rating: null, placeholder: !!rec.placeholder }));
      if (fixedRecipes.some((rec, i) => rec !== recipesNext[i])) { recipesNext = fixedRecipes; persistRecipes = true; }

      setRecipes(recipesNext); setSettings(settingsNext); setProfile(p); setMealplanIndex(idx);
      recipesRef.current = recipesNext;
      mealplanIndexRef.current = idx;
      setBookmarksRecipes(bmRecipes); setBookmarksPages(bmPages);
      setLoading(false);
      if (persistSettings) await storageSet('settings', settingsNext, true);
      if (persistRecipes) await storageSet('recipes', recipesNext, true);
    })();
  }, []);

  const showToast = (msg, type) => { setToast({ msg, type: type || 'info' }); setTimeout(() => setToast(null), 3000); };

  const addRecipe = async (recipe) => {
    const currentRecipes = recipesRef.current;
    const trimmedTitle = (recipe.title || '').trim().toLowerCase();
    const existing = currentRecipes.find(r => (r.title || '').trim().toLowerCase() === trimmedTitle);
    if (existing) {
      return existing;
    }
    const vol = currentOpenVolume(settings);
    const full = {
      rating: null, placeholder: false, photo: null,
      ...recipe,
      id: recipe.id || uid(),
      createdAt: recipe.createdAt || new Date().toISOString(),
      bookVolume: recipe.bookVolume || (vol && vol.id) || null,
    };
    const next = [...currentRecipes, full];
    setRecipes(next);
    recipesRef.current = next;
    await storageSet('recipes', next, true);
    return full;
  };
  const updateRecipe = async (id, patch) => {
    const next = recipesRef.current.map(r => r.id === id ? { ...r, ...patch } : r);
    setRecipes(next);
    recipesRef.current = next;
    await storageSet('recipes', next, true);
  };
  const deleteRecipe = async (id) => {
    const next = recipesRef.current.filter(r => r.id !== id);
    setRecipes(next);
    recipesRef.current = next;
    await storageSet('recipes', next, true);
  };
  const updateSettings = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await storageSet('settings', next, true);
  };
  const closeVolume = async (newTitle) => {
    const vols = settings.cookbookVolumes || [];
    const now = new Date().toISOString();
    const updatedVols = vols.map(v => v.closedAt ? v : { ...v, closedAt: now });
    const newVol = { id: uid(), title: (newTitle && newTitle.trim()) || `Band ${vols.length + 1}`, startedAt: now, closedAt: null };
    await updateSettings({ cookbookVolumes: [...updatedVols, newVol] });
  };
  const chooseProfile = async (idx) => {
    const next = { personIndex: idx };
    setProfile(next);
    await storageSet('profile', next, false);
  };
  const getDayPlan = useCallback((dk) => storageGet(`mealplan:${dk}`, true, emptyDayPlan()), []);
  const saveDayPlan = useCallback(async (dk, plan) => {
    await storageSet(`mealplan:${dk}`, plan, true);
    const counts = mealTimeCounts(plan);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const nextIndex = { ...mealplanIndexRef.current };
    if (total > 0) nextIndex[dk] = counts; else delete nextIndex[dk];
    setMealplanIndex(nextIndex);
    mealplanIndexRef.current = nextIndex;
    await storageSet('mealplan_index', nextIndex, true);
  }, []);
  const triggerRefresh = useCallback(() => setRefreshKey(prev => prev + 1), []);
  const saveBookmarksRecipes = async (newLinks) => {
    const map = new Map(bookmarksRecipes.map(b => [b.url, b]));
    for (const l of newLinks) map.set(l.url, l);
    const merged = Array.from(map.values());
    setBookmarksRecipes(merged);
    await storageSet('firefox_bookmarks_recipes', merged, true);
  };
  const clearBookmarksRecipes = async () => {
    setBookmarksRecipes([]);
    await storageSet('firefox_bookmarks_recipes', [], true);
  };
  const saveBookmarksPages = async (newLinks) => {
    const map = new Map(bookmarksPages.map(b => [b.url, b]));
    for (const l of newLinks) map.set(l.url, l);
    const merged = Array.from(map.values());
    setBookmarksPages(merged);
    await storageSet('firefox_bookmarks_pages', merged, true);
  };
  const clearBookmarksPages = async () => {
    setBookmarksPages([]);
    await storageSet('firefox_bookmarks_pages', [], true);
  };

  const [showReminder, setShowReminder] = useState(false);

  // Handle actions from notifications (native or in-app)
  const handleNotificationAction = async (action) => {
    setShowReminder(false);
    if (action === 'generate') {
      setTab('calendar');
      setPlannerOpen(true);
    } else if (action === 'snooze') {
      const snoozeTime = Date.now() + 60 * 60 * 1000; // 1 hour
      await updateSettings({ snoozedUntil: snoozeTime });
      showToast('Erinnerung um 1 Stunde verschoben');
    } else if (action === 'ok') {
      setTab('calendar');
    }
  };

  // 1. Listen for URL search parameters (e.g. from opened notification link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action) {
      handleNotificationAction(action);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [settings]);

  // 2. Listen for messages from Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handler = (event) => {
        if (event.data && event.data.action) {
          handleNotificationAction(event.data.action);
        }
      };
      navigator.serviceWorker.addEventListener('message', handler);
      return () => navigator.serviceWorker.removeEventListener('message', handler);
    }
  }, [settings]);

  // 3. Background schedule check loop (checks every 15s)
  useEffect(() => {
    if (!settings.notificationEnabled) return;

    const interval = setInterval(async () => {
      const now = new Date();
      const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentHourMin = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

      let shouldNotify = false;

      // Regular check
      if (currentDay === parseInt(settings.notificationDay) && currentHourMin === settings.notificationTime) {
        const lastNotifiedDate = settings.lastNotifiedAt ? new Date(settings.lastNotifiedAt) : null;
        const alreadyNotified = lastNotifiedDate &&
          lastNotifiedDate.getDate() === now.getDate() &&
          lastNotifiedDate.getHours() === now.getHours() &&
          lastNotifiedDate.getMinutes() === now.getMinutes();

        if (!alreadyNotified) {
          shouldNotify = true;
        }
      }

      // Snooze check
      if (settings.snoozedUntil && Date.now() >= settings.snoozedUntil) {
        shouldNotify = true;
      }

      if (shouldNotify) {
        // Update notification state to prevent multiple fires
        await updateSettings({
          lastNotifiedAt: Date.now(),
          snoozedUntil: null
        });

        // Trigger native notification
        if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
          const reg = await navigator.serviceWorker.ready;
          reg.showNotification('Rezepte in Tischplan eintragen', {
            body: 'Wochenplan verwalten oder automatisch generieren.',
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: 'tischplan-reminder',
            actions: [
              { action: 'generate', title: 'Plan automatisch generieren' },
              { action: 'ok', title: 'OK' },
              { action: 'snooze', title: 'Verschieben' }
            ],
            requireInteraction: true
          });
        }

        // Show in-app modal if active
        if (document.visibilityState === 'visible') {
          setShowReminder(true);
        }
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [settings]);

  if (loading) return <LoadingScreen />;
  if (!profile) return <ProfilePicker settings={settings} onChoose={chooseProfile} onUpdateSettings={updateSettings} />;

  return (
    <AppCtx.Provider value={{
      recipes, settings, profile, setProfile, mealplanIndex,
      bookmarksRecipes, bookmarksPages,
      addRecipe, updateRecipe, deleteRecipe, updateSettings, closeVolume, showToast,
      openAddRecipe: setAddModal, getDayPlan, saveDayPlan,
      saveBookmarksRecipes, saveBookmarksPages,
      clearBookmarksRecipes, clearBookmarksPages,
      openRecipeDetail: setRecipeDetailModal,
      openMoveMeal: setMoveMealModal,
      refreshKey,
      triggerRefresh,
      plannerOpen, setPlannerOpen,
    }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #cookbook-print, #cookbook-print * { visibility: visible; }
          #cookbook-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <div className="min-h-screen bg-stone-100 text-stone-800 font-sans pb-20">
        <TopBar />
        <main className="max-w-2xl mx-auto px-4 py-4">
          {tab === 'calendar' && <CalendarTab />}
          {tab === 'recipes' && <RecipesTab />}
          {tab === 'shopping' && <ShoppingTab />}
          {tab === 'cookbook' && <CookbookTab />}
          {tab === 'settings' && <SettingsTab />}
        </main>
        <BottomNav tab={tab} setTab={setTab} />
        {addModal && <AddRecipeModal onClose={() => setAddModal(null)} onSaved={addModal.onSaved} />}
        {recipeDetailModal && (
          <RecipeDetailModal
            recipe={recipeDetailModal.recipe}
            multiplier={recipeDetailModal.multiplier || 1}
            onClose={() => setRecipeDetailModal(null)}
          />
        )}
        {moveMealModal && (
          <MoveMealModal
            data={moveMealModal}
            onClose={() => setMoveMealModal(null)}
          />
        )}
        {showReminder && (
          <ReminderModal
            onClose={() => setShowReminder(false)}
            onAction={handleNotificationAction}
          />
        )}
        {toast && <Toast toast={toast} />}
      </div>
    </AppCtx.Provider>
  );
}
