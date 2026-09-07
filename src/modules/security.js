// Security utilities: SSRF protection, URL validation, and safe host checks

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

/**
 * Validates whether a target URL is safe to fetch via server proxy.
 * Checks protocol (must be https:), prevents SSRF to internal/private IPs and hostnames.
 */
export function validateSafeProxyUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return { safe: false, error: 'URL ist erforderlich' };
  }

  let parsed;
  try {
    parsed = new URL(urlStr.trim());
  } catch (err) {
    return { safe: false, error: 'Ungültiges URL-Format' };
  }

  // Must strictly be HTTPS
  if (parsed.protocol !== 'https:') {
    return { safe: false, error: 'Ausschließlich HTTPS-Verbindungen sind zulässig' };
  }

  const hostname = parsed.hostname.toLowerCase().trim();
  const cleanHost = hostname.replace(/^\[|\]$/g, '');

  if (!hostname || hostname.length > 253) {
    return { safe: false, error: 'Ungültiger Hostname' };
  }

  if (DISALLOWED_HOSTNAMES.has(cleanHost) || cleanHost.endsWith('.localhost') || cleanHost.endsWith('.local')) {
    return { safe: false, error: 'Zugriff auf lokale Ziele ist nicht erlaubt' };
  }

  // Check IPv4 / IPv6 addresses against private and link-local ranges
  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(cleanHost)) {
      return { safe: false, error: 'Zugriff auf private oder interne Netzwerke ist nicht erlaubt' };
    }
  }

  // Do not allow credentials in URL
  if (parsed.username || parsed.password) {
    return { safe: false, error: 'URLs mit Zugangsdaten sind nicht zulässig' };
  }

  return { safe: true, url: parsed.toString() };
}
