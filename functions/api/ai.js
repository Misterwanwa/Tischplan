// Cloudflare Pages Function – Abgesicherter KI-Proxy
// Liest API-Keys aus Cloudflare Environment Variables (NIEMALS im Frontend).
// Unterstützt strukturierte JSON-Schema-Ausgaben, serverseitige Tokenbudgets und echte Modell-Fallbacks.
// Anbieter: 'gemini' (Google AI), 'openrouter' (OpenRouter), 'anthropic' (Legacy-Fallback).

import { buildOpenRouterBody, isValidOpenRouterModel, DEFAULT_OPENROUTER_MODEL } from '../../src/modules/aiConfig.js';

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

export async function onRequestPost(context) {
  if (!verifyOrigin(context)) {
    return new Response(JSON.stringify({ error: 'Cross-origin access denied' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { provider, model, prompt, useSearch, image, maxTokens, schema } = await context.request.json();

    if (!prompt && (!image || !image.data)) {
      return new Response(JSON.stringify({ error: 'Prompt oder Bild ist erforderlich' }), { status: 400, headers: corsHeaders });
    }

    // Server-side budget limits
    const safeMaxTokens = Math.min(Math.max(parseInt(maxTokens || 1024, 10), 256), 4096);

    let result;

    if (provider === 'gemini' || !provider) {
      // Google Gemini API
      const apiKey = context.env.GEMINI_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY nicht in Umgebungsvariablen konfiguriert' }), { status: 500, headers: corsHeaders });
      }

      const parts = [];
      if (prompt) {
        parts.push({ text: prompt });
      }
      if (image && image.data) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType || 'image/jpeg',
            data: image.data
          }
        });
      }

      const generationConfig = {
        responseMimeType: 'application/json',
        maxOutputTokens: safeMaxTokens,
      };

      if (schema) {
        generationConfig.responseSchema = schema;
      }

      const body = {
        contents: [{ role: 'user', parts }],
        generationConfig
      };

      // Google Search Grounding (falls useSearch)
      if (useSearch) {
        delete body.generationConfig.responseMimeType;
        delete body.generationConfig.responseSchema;
        body.tools = [{ googleSearch: {} }];
      }

      // Valid Gemini models in Google AI v1beta
      const candidateModels = [
        context.env.GEMINI_MODEL,
        'gemini-2.5-flash',
        'gemini-3.8-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
      ].filter(Boolean);

      let res = null;
      let lastErrText = '';
      let lastStatus = 500;
      let triedModels = [];

      for (const model of candidateModels) {
        triedModels.push(model);
        try {
          res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            }
          );
          if (res.ok) break;
          lastStatus = res.status;
          lastErrText = await res.text();
          // If model is not found (404), continue trying next model
          if (res.status === 404) continue;
          // If not 404 (e.g. 400 Bad Request, 429 Rate Limit, 403 Forbidden), break
          break;
        } catch (fetchErr) {
          lastErrText = fetchErr.message;
        }
      }

      if (!res || !res.ok) {
        let parsedErrMsg = lastErrText;
        try {
          const errObj = JSON.parse(lastErrText);
          parsedErrMsg = errObj.error?.message || lastErrText;
        } catch (_) {}

        return new Response(JSON.stringify({
          error: `Gemini API Fehler (${lastStatus}) [Modelle: ${triedModels.join(', ')}]: ${parsedErrMsg}`,
          status: lastStatus
        }), {
          status: lastStatus === 429 ? 429 : (lastStatus >= 500 ? 502 : 400),
          headers: corsHeaders
        });
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];

      if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
        if (candidate.finishReason === 'SAFETY') {
          return new Response(JSON.stringify({ error: 'Die Anfrage wurde durch Inhaltsfilter blockiert.' }), { status: 422, headers: corsHeaders });
        }
        if (candidate.finishReason === 'MAX_TOKENS') {
          console.warn('Gemini hit max tokens limit');
        }
      }

      const text = candidate?.content?.parts
        ?.filter(p => p.text)
        ?.map(p => p.text)
        ?.join('\n') || '';

      result = { text, finishReason: candidate?.finishReason || 'STOP' };

    } else if (provider === 'openrouter') {
      // OpenRouter (OpenAI-kompatible Chat-Completions-API)
      const apiKey = context.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY nicht in Umgebungsvariablen konfiguriert' }), { status: 500, headers: corsHeaders });
      }

      const candidateModels = [...new Set([
        isValidOpenRouterModel(model) ? model.trim() : null,
        isValidOpenRouterModel(context.env.OPENROUTER_MODEL) ? context.env.OPENROUTER_MODEL.trim() : null,
        DEFAULT_OPENROUTER_MODEL,
      ].filter(Boolean))];

      const requestOrigin = new URL(context.request.url).origin;
      let res = null;
      let lastErrText = '';
      let lastStatus = 500;
      const triedModels = [];

      for (const candidateModel of candidateModels) {
        triedModels.push(candidateModel);
        try {
          res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': requestOrigin,
              'X-Title': 'Tischplan',
            },
            body: JSON.stringify(buildOpenRouterBody({
              model: candidateModel, prompt, image, maxTokens: safeMaxTokens, schema, useSearch,
            })),
          });
          if (res.ok) break;
          lastStatus = res.status;
          lastErrText = await res.text();
          // Unbekanntes/ungültiges Modell → nächstes probieren, sonst abbrechen
          if (res.status === 404 || (res.status === 400 && /model/i.test(lastErrText))) continue;
          break;
        } catch (fetchErr) {
          lastErrText = fetchErr.message;
        }
      }

      if (!res || !res.ok) {
        let parsedErrMsg = lastErrText;
        try {
          const errObj = JSON.parse(lastErrText);
          parsedErrMsg = errObj.error?.message || lastErrText;
        } catch (_) {}

        return new Response(JSON.stringify({
          error: `OpenRouter Fehler (${lastStatus}) [Modelle: ${triedModels.join(', ')}]: ${parsedErrMsg}`,
          status: lastStatus
        }), {
          status: lastStatus === 429 ? 429 : (lastStatus === 402 ? 402 : (lastStatus >= 500 ? 502 : 400)),
          headers: corsHeaders
        });
      }

      const data = await res.json();
      if (data.error) {
        return new Response(JSON.stringify({ error: `OpenRouter Fehler: ${data.error.message || 'Unbekannt'}` }), { status: 502, headers: corsHeaders });
      }
      const choice = data.choices?.[0];
      const msgContent = choice?.message?.content;
      const text = Array.isArray(msgContent)
        ? msgContent.filter(p => p.type === 'text').map(p => p.text).join('\n')
        : (msgContent || '');

      if (choice?.finish_reason === 'content_filter') {
        return new Response(JSON.stringify({ error: 'Die Anfrage wurde durch Inhaltsfilter blockiert.' }), { status: 422, headers: corsHeaders });
      }

      result = { text, finishReason: choice?.finish_reason || 'stop', model: data.model || triedModels[triedModels.length - 1] };

    } else {
      // Claude Anthropic (Fallback)
      const apiKey = context.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY nicht in Umgebungsvariablen konfiguriert' }), { status: 500, headers: corsHeaders });
      }

      const content = [];
      if (image && image.data) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mimeType || 'image/jpeg',
            data: image.data
          }
        });
      }
      if (prompt) content.push({ type: 'text', text: prompt });

      const body = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: safeMaxTokens,
        messages: [{ role: 'user', content }]
      };
      if (useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return new Response(JSON.stringify({ error: `Anthropic API Fehler: ${err}` }), { status: res.status, headers: corsHeaders });
      }

      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      result = { text, finishReason: data.stop_reason || 'end_turn' };
    }

    return new Response(JSON.stringify(result), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
