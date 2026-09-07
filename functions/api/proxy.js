// Cloudflare Pages Function – Abgesicherter Proxy
// Schützt vor SSRF, blockiert private/lokale Netzwerke, erzwingt HTTPS, limitiert Antwortgrößen und Ausführungszeit.

const PRIVATE_IP_RANGES = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^fc00:/i,
  /^fe80:/i,
  /^::1$/,
  /^0:0:0:0:0:0:0:1$/,
];

const DISALLOWED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'broadcasthost',
  'local',
  'internal',
  'lan',
]);

function isSafeUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') {
      return { safe: false, error: 'Ausschließlich HTTPS-Ziele sind zulässig' };
    }
    const hostname = parsed.hostname.toLowerCase().trim();
    if (!hostname || hostname.length > 253) {
      return { safe: false, error: 'Ungültiger Hostname' };
    }
    if (DISALLOWED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      return { safe: false, error: 'Zugriff auf lokale Ziele verboten' };
    }
    for (const range of PRIVATE_IP_RANGES) {
      if (range.test(hostname)) {
        return { safe: false, error: 'Zugriff auf private IP-Adressen verboten' };
      }
    }
    if (parsed.username || parsed.password) {
      return { safe: false, error: 'Zugangsdaten in URL nicht erlaubt' };
    }
    return { safe: true, url: parsed };
  } catch (e) {
    return { safe: false, error: 'Ungültiges URL-Format' };
  }
}

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const targetUrlStr = requestUrl.searchParams.get('url');

  if (!targetUrlStr) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Same-origin / App-origin verification
  const origin = context.request.headers.get('origin');
  const referer = context.request.headers.get('referer');
  const appHost = requestUrl.host;

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== appHost && !originUrl.host.endsWith('.pages.dev')) {
        return new Response(JSON.stringify({ error: 'Cross-origin proxy request rejected' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Invalid origin header' }), { status: 403 });
    }
  }

  // Validate initial URL
  const validation = isSafeUrl(targetUrlStr);
  if (!validation.safe) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let currentTarget = validation.url.toString();
  let redirectCount = 0;
  const MAX_REDIRECTS = 3;
  const MAX_BYTES = 2 * 1024 * 1024; // 2 MB limit

  try {
    let response = null;

    // Follow redirects manually to validate each target against SSRF
    while (redirectCount <= MAX_REDIRECTS) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

      try {
        response = await fetch(currentTarget, {
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Tischplan/1.10.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
          }
        });
      } finally {
        clearTimeout(timeout);
      }

      // Check if redirect
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) break;
        const nextUrl = new URL(location, currentTarget).toString();
        const nextVal = isSafeUrl(nextUrl);
        if (!nextVal.safe) {
          return new Response(JSON.stringify({ error: `Redirect to unsafe target rejected: ${nextVal.error}` }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        currentTarget = nextUrl;
        redirectCount++;
      } else {
        break;
      }
    }

    if (!response) {
      return new Response(JSON.stringify({ error: 'Failed to fetch target' }), { status: 502 });
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: 'Response exceeds 2MB size limit' }), { status: 413 });
    }

    // Non-HTML content (e.g. images): stream directly with strict headers
    if (!contentType.includes('text/html')) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'public, max-age=3600',
        }
      });
    }

    // Sanitize HTML: Disallow scripts from running inside app context
    // Strips all <script> elements and ensures relative URLs point back through proxy
    const finalTargetUrl = new URL(currentTarget);
    const rewriter = new HTMLRewriter()
      // Remove all scripts to avoid XSS in app context
      .on('script', {
        element(el) {
          el.remove();
        }
      })
      // Strip on* event attributes (onclick, onload, etc.)
      .on('*', {
        element(el) {
          const attributes = el.attributes;
          for (const attr of attributes) {
            if (attr.name.toLowerCase().startsWith('on')) {
              el.removeAttribute(attr.name);
            }
          }
        }
      })
      // Rewrite links so navigation stays within safe proxy
      .on('a', {
        element(el) {
          const href = el.getAttribute('href');
          if (href) {
            try {
              const absUrl = new URL(href, finalTargetUrl).toString();
              if (absUrl.startsWith('https://')) {
                const proxyUrl = new URL(context.request.url);
                proxyUrl.searchParams.set('url', absUrl);
                el.setAttribute('href', proxyUrl.toString());
              }
            } catch (_) {}
          }
        }
      })
      // Rewrite image sources to absolute URLs
      .on('img', {
        element(el) {
          const src = el.getAttribute('src');
          if (src) {
            try {
              const absUrl = new URL(src, finalTargetUrl).toString();
              el.setAttribute('src', absUrl);
            } catch (_) {}
          }
        }
      })
      // Rewrite CSS links
      .on('link[rel="stylesheet"]', {
        element(el) {
          const href = el.getAttribute('href');
          if (href) {
            try {
              const absUrl = new URL(href, finalTargetUrl).toString();
              el.setAttribute('href', absUrl);
            } catch (_) {}
          }
        }
      });

    const transformed = rewriter.transform(response);
    const headers = new Headers(transformed.headers);
    headers.set('Content-Security-Policy', "default-src 'self' https: data:; script-src 'none'; object-src 'none';");
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'SAMEORIGIN');

    return new Response(transformed.body, {
      status: transformed.status,
      headers
    });
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return new Response(JSON.stringify({ error: isTimeout ? 'Proxy request timed out (8s limit)' : `Proxy error: ${err.message}` }), {
      status: isTimeout ? 504 : 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
