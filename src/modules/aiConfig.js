// KI-Konfiguration: gemeinsam genutzt von Frontend (Einstellungen, callAI)
// und Cloudflare Function (functions/api/ai.js).

export const AI_PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', description: 'Direkt über die Google AI API' },
  { id: 'openrouter', label: 'OpenRouter', description: 'Hunderte Modelle über einen Schlüssel' },
];

export const DEFAULT_PROVIDER = 'gemini';
export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-3.5-flash-lite';

export const OPENROUTER_MODEL_PRESETS = [
  { id: 'google/gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
  { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
];

// OpenRouter-Modell-IDs haben die Form "anbieter/modell" (optional ":variante").
const OPENROUTER_MODEL_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(:[a-z0-9._-]+)?$/i;

export function isValidOpenRouterModel(id) {
  return typeof id === 'string' && id.length <= 120 && OPENROUTER_MODEL_RE.test(id.trim());
}

export function normalizeProvider(provider) {
  return AI_PROVIDERS.some(p => p.id === provider) ? provider : DEFAULT_PROVIDER;
}

/**
 * Liest Anbieter + Modell aus einem Settings-Objekt.
 * @returns {{ provider: 'gemini'|'openrouter', model: string|null }}
 */
export function resolveAiConfig(settings) {
  const provider = normalizeProvider(settings?.aiProvider);
  if (provider !== 'openrouter') return { provider, model: null };
  const model = isValidOpenRouterModel(settings?.openrouterModel)
    ? settings.openrouterModel.trim()
    : DEFAULT_OPENROUTER_MODEL;
  return { provider, model };
}

/** Liest die KI-Konfiguration aus den lokal gespiegelten Settings (shared_settings). */
export function readAiConfigFromStorage(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem('shared_settings') || storage?.getItem('settings');
    if (!raw) return resolveAiConfig(null);
    let parsed = JSON.parse(raw);
    if (parsed && parsed.value !== undefined) {
      parsed = typeof parsed.value === 'string' ? JSON.parse(parsed.value) : parsed.value;
    }
    return resolveAiConfig(parsed);
  } catch (_) {
    return resolveAiConfig(null);
  }
}

/**
 * Wandelt ein Gemini-Schema (type: "STRING", "OBJECT", …) in Standard-JSON-Schema
 * (type: "string", "object", …) um, wie es OpenAI-kompatible APIs erwarten.
 */
export function geminiSchemaToJsonSchema(schema) {
  if (Array.isArray(schema)) return schema.map(geminiSchemaToJsonSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') out.type = value.toLowerCase();
    else if (key === 'nullable') continue;
    else if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, geminiSchemaToJsonSchema(v)])
      );
    } else out[key] = geminiSchemaToJsonSchema(value);
  }
  if (schema.nullable && out.type) out.type = [out.type, 'null'];
  if (out.type === 'object' && out.properties && out.additionalProperties === undefined) {
    out.additionalProperties = false;
  }
  return out;
}

/** Strict Structured Outputs verlangen, dass jedes Objekt alle Properties als required führt. */
function isStrictCompatible(schema) {
  if (!schema || typeof schema !== 'object') return true;
  if (schema.properties) {
    const required = new Set(schema.required || []);
    if (!Object.keys(schema.properties).every(k => required.has(k))) return false;
    if (!Object.values(schema.properties).every(isStrictCompatible)) return false;
  }
  if (schema.items && !isStrictCompatible(schema.items)) return false;
  return true;
}

/** Baut den Request-Body für die OpenRouter Chat-Completions-API. */
export function buildOpenRouterBody({ model, prompt, image, maxTokens, schema, useSearch }) {
  const content = [];
  if (prompt) content.push({ type: 'text', text: prompt });
  if (image && image.data) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType || 'image/jpeg'};base64,${image.data}` },
    });
  }

  const body = {
    model,
    messages: [{ role: 'user', content }],
    max_tokens: maxTokens,
  };

  if (useSearch) {
    // OpenRouter Web-Search-Plugin (funktioniert modellübergreifend)
    body.plugins = [{ id: 'web' }];
  } else if (schema) {
    const jsonSchema = geminiSchemaToJsonSchema(schema);
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'result', strict: isStrictCompatible(jsonSchema), schema: jsonSchema },
    };
  }

  return body;
}
