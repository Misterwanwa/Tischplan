export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const key = searchParams.get('key');
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing key' }), {
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
    const val = await kv.get(key);
    return new Response(JSON.stringify({ value: val ? JSON.parse(val) : null }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestPost(context) {
  const kv = context.env.TISCHPLAN_STORAGE;
  if (!kv) {
    return new Response(JSON.stringify({ error: 'KV Namespace TISCHPLAN_STORAGE not bound' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { key, value } = await context.request.json();
    if (!key) {
      return new Response(JSON.stringify({ error: 'Missing key' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await kv.put(key, JSON.stringify(value));
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
