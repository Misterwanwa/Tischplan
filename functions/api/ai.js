// Cloudflare Pages Function – KI-Proxy
// Liest API-Keys aus Cloudflare Environment Variables (NIEMALS im Frontend)
export async function onRequestPost(context) {
  // CORS-Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  try {
    const { provider, prompt, useSearch } = await context.request.json();
    
    let result;
    
    if (provider === 'gemini') {
      // Google Gemini API (günstiger, Free Tier vorhanden)
      const apiKey = context.env.GEMINI_API_KEY;
      if (!apiKey) return new Response('GEMINI_API_KEY not set', { status: 500, headers: corsHeaders });
      
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 }
      };
      
      // Gemini 2.0 Flash mit Google Search Grounding (falls useSearch)
      if (useSearch) {
        body.tools = [{ googleSearch: {} }];
      }
      
      const model = 'gemini-2.0-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      
      if (!res.ok) {
        const err = await res.text();
        return new Response(JSON.stringify({ error: `Gemini API error: ${err}` }), { status: res.status, headers: corsHeaders });
      }
      
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        ?.map(p => p.text)
        ?.join('\n') || '';
      result = { text };
      
    } else {
      // Claude Anthropic (Fallback / Alternative)
      const apiKey = context.env.ANTHROPIC_API_KEY;
      if (!apiKey) return new Response('ANTHROPIC_API_KEY not set', { status: 500, headers: corsHeaders });
      
      const body = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
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
        return new Response(JSON.stringify({ error: `Anthropic API error: ${err}` }), { status: res.status, headers: corsHeaders });
      }
      
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      result = { text };
    }
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
