// Cloudflare Pages Function – Abgesicherter Storage
// Speichert und liest gemeinsam genutzte Daten aus Cloudflare KV (TISCHPLAN_STORAGE).
// Prüft Schlüsselformate, Payloads-Größen und blockiert unberechtigte Cross-Origin-Zugriffe.

import { gameDay } from '../../src/modules/gamification.js';
import { isDayActive } from '../../src/modules/streak.js';

const ALLOWED_KEY_PREFIXES = [
  'recipes',
  'settings',
  'profile',
  'mealplan:',
  'mealplan_index',
  'shopping_items_v2',
  'shopping_custom_db',
  'shopping_imported_weeks',
  'firefox_bookmarks_recipes',
  'firefox_bookmarks_pages',
  'calorie_logs_',
  'calorie_streak_',
  'app_stats_v1',
];

const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MB

function isValidKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 128) return false;
  return ALLOWED_KEY_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix));
}

function verifyOrigin(context) {
  const requestUrl = new URL(context.request.url);
  const origin = context.request.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== requestUrl.host && !originHost.endsWith('.pages.dev')) {
        return false;
      }
    } catch (_) {
      return false;
    }
  }
  return true;
}

export async function onRequestGet(context) {
  if (!verifyOrigin(context)) {
    return new Response(JSON.stringify({ error: 'Cross-origin access denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const { searchParams } = new URL(context.request.url);
  const key = searchParams.get('key');
  if (!key || !isValidKey(key)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const kv = context.env.TISCHPLAN_STORAGE;
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV Namespace TISCHPLAN_STORAGE not bound' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const valWithMeta = await kv.getWithMetadata(key);
    const val = valWithMeta ? valWithMeta.value : null;
    const metadata = (valWithMeta && valWithMeta.metadata) || {};

    return new Response(JSON.stringify({
      value: val ? JSON.parse(val) : null,
      updatedAt: metadata.updatedAt || null,
      version: metadata.version || 1
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  if (!verifyOrigin(context)) {
    return new Response(JSON.stringify({ error: 'Cross-origin access denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const kv = context.env.TISCHPLAN_STORAGE;
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV Namespace TISCHPLAN_STORAGE not bound' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const rawBody = await context.request.text();
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return new Response(JSON.stringify({ error: 'Payload exceeds 1MB limit' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { key, value, expectedVersion } = JSON.parse(rawBody);
    if (!key || !isValidKey(key)) {
      return new Response(JSON.stringify({ error: 'Invalid or missing key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const now = Date.now();
    const metadata = {
      updatedAt: now,
      version: (typeof expectedVersion === 'number' ? expectedVersion + 1 : 1)
    };

    // Stamp the first food entry on the server. A client-provided timestamp must
    // not turn a retroactive entry into a five-point same-day award.
    if (/^calorie_logs_[01]$/.test(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      const previousRaw = await kv.get(key);
      const previous = previousRaw ? JSON.parse(previousRaw) : {};
      for (const [day, log] of Object.entries(value)) {
        if (!log || typeof log !== 'object') continue;
        const old = previous[day];
        if (old?.firstTrackedOn) log.firstTrackedOn = old.firstTrackedOn;
        else if (isDayActive(old)) log.firstTrackedOn = 'legacy';
        else if (isDayActive(log)) log.firstTrackedOn = gameDay(new Date(now));
        else delete log.firstTrackedOn;
      }
    }

    await kv.put(key, JSON.stringify(value), { metadata });
    return new Response(JSON.stringify({ success: true, updatedAt: now, version: metadata.version }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
