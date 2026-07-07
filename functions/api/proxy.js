export async function onRequestGet(context) {
  const { searchParams } = new URL(context.request.url);
  const targetUrlStr = searchParams.get('url');
  if (!targetUrlStr) {
    return new Response('Missing url', { status: 400 });
  }

  try {
    const targetUrl = new URL(targetUrlStr);
    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      // Pipe the body and copy standard content type
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const rewriter = new HTMLRewriter()
      .on('a', {
        element(el) {
          const href = el.getAttribute('href');
          if (href) {
            try {
              const absUrl = new URL(href, targetUrl).toString();
              if (absUrl.startsWith('http')) {
                const proxyUrl = new URL(context.request.url);
                proxyUrl.searchParams.set('url', absUrl);
                el.setAttribute('href', proxyUrl.toString());
              }
            } catch (e) {}
          }
        }
      })
      .on('form', {
        element(el) {
          const action = el.getAttribute('action');
          if (action) {
            try {
              const absUrl = new URL(action, targetUrl).toString();
              const proxyUrl = new URL(context.request.url);
              proxyUrl.searchParams.set('url', absUrl);
              el.setAttribute('action', proxyUrl.toString());
            } catch (e) {}
          }
        }
      })
      .on('img', {
        element(el) {
          const src = el.getAttribute('src');
          if (src) {
            try {
              const absUrl = new URL(src, targetUrl).toString();
              el.setAttribute('src', absUrl);
            } catch (e) {}
          }
          const srcset = el.getAttribute('srcset');
          if (srcset) {
            const rewrittenSrcset = srcset.split(',').map(part => {
              const [urlPart, size] = part.trim().split(/\s+/);
              if (urlPart) {
                try {
                  const absUrl = new URL(urlPart, targetUrl).toString();
                  return size ? `${absUrl} ${size}` : absUrl;
                } catch(e) {}
              }
              return part;
            }).join(', ');
            el.setAttribute('srcset', rewrittenSrcset);
          }
        }
      })
      .on('link', {
        element(el) {
          const href = el.getAttribute('href');
          if (href) {
            try {
              const absUrl = new URL(href, targetUrl).toString();
              el.setAttribute('href', absUrl);
            } catch (e) {}
          }
        }
      })
      .on('script', {
        element(el) {
          const src = el.getAttribute('src');
          if (src) {
            const srcLower = src.toLowerCase();
            if (
              srcLower.includes('recaptcha') ||
              srcLower.includes('turnstile') ||
              srcLower.includes('hcaptcha') ||
              srcLower.includes('cookiebot') ||
              srcLower.includes('onetrust') ||
              srcLower.includes('consent') ||
              srcLower.includes('cookie-law') ||
              srcLower.includes('doubleclick') ||
              srcLower.includes('google-analytics') ||
              srcLower.includes('googletagmanager')
            ) {
              el.remove();
              return;
            }
            try {
              const absUrl = new URL(src, targetUrl).toString();
              el.setAttribute('src', absUrl);
            } catch (e) {}
          }
        }
      })
      .on('div, section, dialog', {
        element(el) {
          const id = el.getAttribute('id') || '';
          const cls = el.getAttribute('class') || '';
          const combined = (id + ' ' + cls).toLowerCase();
          if (
            combined.includes('cookie-consent') ||
            combined.includes('cookiebanner') ||
            combined.includes('cookie-accept') ||
            combined.includes('consent-modal') ||
            combined.includes('onetrust-consent-sdk') ||
            combined.includes('sp_message_container') ||
            combined.includes('cmp-container')
          ) {
            el.remove();
          }
        }
      });

    return rewriter.transform(response);
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 500 });
  }
}
