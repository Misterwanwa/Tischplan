import { test } from 'node:test';
import assert from 'node:assert';
import {
  resolveAiConfig,
  readAiConfigFromStorage,
  isValidOpenRouterModel,
  geminiSchemaToJsonSchema,
  buildOpenRouterBody,
  DEFAULT_OPENROUTER_MODEL,
} from '../src/modules/aiConfig.js';

const memoryStorage = (obj) => ({ getItem: (k) => (k in obj ? obj[k] : null) });

test('resolveAiConfig: Default ist Gemini ohne Modell', () => {
  assert.deepStrictEqual(resolveAiConfig(null), { provider: 'gemini', model: null });
  assert.deepStrictEqual(resolveAiConfig({ aiProvider: 'quatsch' }), { provider: 'gemini', model: null });
});

test('resolveAiConfig: OpenRouter nutzt gespeichertes oder Default-Modell', () => {
  assert.deepStrictEqual(
    resolveAiConfig({ aiProvider: 'openrouter', openrouterModel: 'openai/gpt-4o-mini' }),
    { provider: 'openrouter', model: 'openai/gpt-4o-mini' }
  );
  assert.deepStrictEqual(
    resolveAiConfig({ aiProvider: 'openrouter', openrouterModel: 'kaputt' }),
    { provider: 'openrouter', model: DEFAULT_OPENROUTER_MODEL }
  );
});

test('readAiConfigFromStorage liest shared_settings', () => {
  const storage = memoryStorage({
    shared_settings: JSON.stringify({ aiProvider: 'openrouter', openrouterModel: 'anthropic/claude-sonnet-4' }),
  });
  assert.deepStrictEqual(readAiConfigFromStorage(storage), { provider: 'openrouter', model: 'anthropic/claude-sonnet-4' });
  assert.deepStrictEqual(readAiConfigFromStorage(memoryStorage({ shared_settings: '{kaputt' })), { provider: 'gemini', model: null });
});

test('isValidOpenRouterModel', () => {
  assert.ok(isValidOpenRouterModel('google/gemini-3.5-flash-lite'));
  assert.ok(isValidOpenRouterModel('meta-llama/llama-3.3-70b-instruct:free'));
  assert.ok(!isValidOpenRouterModel('gpt-4o'));
  assert.ok(!isValidOpenRouterModel('a/b/c'));
  assert.ok(!isValidOpenRouterModel('../etc/passwd'));
  assert.ok(!isValidOpenRouterModel(null));
});

test('geminiSchemaToJsonSchema wandelt Typen um', () => {
  const out = geminiSchemaToJsonSchema({
    type: 'OBJECT',
    properties: { name: { type: 'STRING' }, kcal: { type: 'NUMBER' } },
    required: ['name', 'kcal'],
  });
  assert.deepStrictEqual(out, {
    type: 'object',
    properties: { name: { type: 'string' }, kcal: { type: 'number' } },
    required: ['name', 'kcal'],
    additionalProperties: false,
  });
});

test('buildOpenRouterBody: Bild, Schema und Websuche', () => {
  const schema = { type: 'OBJECT', properties: { a: { type: 'STRING' } }, required: ['a'] };
  const body = buildOpenRouterBody({
    model: 'x/y', prompt: 'Hallo', image: { data: 'QUJD', mimeType: 'image/png' }, maxTokens: 512, schema,
  });
  assert.strictEqual(body.model, 'x/y');
  assert.strictEqual(body.max_tokens, 512);
  assert.deepStrictEqual(body.messages[0].content[1], { type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } });
  assert.strictEqual(body.response_format.json_schema.strict, true);

  const loose = buildOpenRouterBody({ model: 'x/y', prompt: 'p', schema: { type: 'OBJECT', properties: { a: { type: 'STRING' } } } });
  assert.strictEqual(loose.response_format.json_schema.strict, false);

  const search = buildOpenRouterBody({ model: 'x/y', prompt: 'p', useSearch: true, schema });
  assert.deepStrictEqual(search.plugins, [{ id: 'web' }]);
  assert.strictEqual(search.response_format, undefined);
});
