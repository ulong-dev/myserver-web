import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksByTeamDomain = new Map();

export class AccessError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = 'AccessError';
    this.status = status;
  }
}

function normalizeTeamDomain(value) {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) throw new AccessError('Access is not configured', 503);

  const url = new URL(raw);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.cloudflareaccess.com') || url.pathname !== '/') {
    throw new AccessError('Access is not configured', 503);
  }
  return url.origin;
}

function allowedEmails(value) {
  return new Set(String(value || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean));
}

export async function authenticateAccess(request, environment) {
  const teamDomain = normalizeTeamDomain(environment.TEAM_DOMAIN);
  const audience = String(environment.POLICY_AUD || '').trim();
  const allowlist = allowedEmails(environment.ALLOWED_EMAILS);
  if (!audience || allowlist.size === 0) throw new AccessError('Access is not configured', 503);

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new AccessError('Authentication required');

  let remoteKeys = jwksByTeamDomain.get(teamDomain);
  if (!remoteKeys) {
    remoteKeys = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeamDomain.set(teamDomain, remoteKeys);
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, remoteKeys, {
      algorithms: ['RS256'],
      audience,
      issuer: teamDomain
    }));
  } catch {
    throw new AccessError('Authentication required');
  }

  const email = String(payload.email || '').trim().toLowerCase();
  if (payload.type !== 'app' || !allowlist.has(email)) throw new AccessError('Access denied');
  return { ...payload, email };
}

export function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests");
  headers.set('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
