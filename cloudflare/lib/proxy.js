const MAX_REQUEST_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const RESERVED_PREFIX = '_proxy_';

export class ProxyError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ProxyError';
    this.status = status;
  }
}

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const value of new Uint8Array(bytes)) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function canonicalQuery(parameters) {
  return [...parameters.entries()]
    .filter(([key]) => key !== '_proxy_sig')
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const left = `${leftKey}=${leftValue}`;
      const right = `${rightKey}=${rightValue}`;
      return left < right ? -1 : left > right ? 1 : 0;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function validateUpstream(rawValue) {
  const url = new URL(String(rawValue || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !url.pathname.startsWith('/macros/s/') || !url.pathname.endsWith('/exec')) {
    throw new ProxyError('Upstream is not configured', 503);
  }
  url.search = '';
  url.hash = '';
  return url;
}

async function hmacBase64Url(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return bytesToBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export async function createSignedUpstreamRequest(request, upstreamValue, signingSecret, identity) {
  if (!['GET', 'POST'].includes(request.method)) throw new ProxyError('Method not allowed', 405);
  if (String(signingSecret || '').length < 32) throw new ProxyError('Upstream signing is not configured', 503);

  const incomingUrl = new URL(request.url);
  for (const key of incomingUrl.searchParams.keys()) {
    if (key.startsWith(RESERVED_PREFIX)) throw new ProxyError('Reserved query parameter', 400);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_REQUEST_BYTES) throw new ProxyError('Request too large', 413);
  const body = request.method === 'POST' ? await request.arrayBuffer() : new ArrayBuffer(0);
  if (body.byteLength > MAX_REQUEST_BYTES) throw new ProxyError('Request too large', 413);

  const upstream = validateUpstream(upstreamValue);
  for (const [key, value] of incomingUrl.searchParams) upstream.searchParams.append(key, value);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceBytes = new Uint8Array(18);
  crypto.getRandomValues(nonceBytes);
  const nonce = bytesToBase64Url(nonceBytes);
  const bodyHash = bytesToHex(await crypto.subtle.digest('SHA-256', body));
  upstream.searchParams.set('_proxy_ts', timestamp);
  upstream.searchParams.set('_proxy_nonce', nonce);
  upstream.searchParams.set('_proxy_method', request.method);
  upstream.searchParams.set('_proxy_email', String(identity?.email || ''));
  upstream.searchParams.set('_proxy_body_sha256', bodyHash);

  const canonical = [request.method, timestamp, nonce, canonicalQuery(upstream.searchParams), bodyHash].join('\n');
  upstream.searchParams.set('_proxy_sig', await hmacBase64Url(signingSecret, canonical));

  const headers = new Headers({ Accept: 'application/json' });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  return new Request(upstream, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? body : undefined,
    redirect: 'follow'
  });
}

export async function proxyAppsScript(context, upstreamEnvironmentKey) {
  const upstreamRequest = await createSignedUpstreamRequest(
    context.request,
    context.env[upstreamEnvironmentKey],
    context.env.APPS_SCRIPT_HMAC_SECRET,
    context.data.accessIdentity
  );
  const upstreamResponse = await fetch(upstreamRequest);
  const text = await upstreamResponse.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new ProxyError('Upstream response too large');

  try {
    JSON.parse(text);
  } catch {
    throw new ProxyError('Upstream returned an invalid response');
  }

  return new Response(text, {
    status: upstreamResponse.ok ? 200 : 502,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

export function proxyErrorResponse(error) {
  const status = error instanceof ProxyError ? error.status : 502;
  const message = error instanceof ProxyError ? error.message : 'Private API unavailable';
  return new Response(JSON.stringify({ status: 'error', ok: false, message }), {
    status,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export const testing = { canonicalQuery, validateUpstream };
