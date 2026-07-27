import { AccessError, addSecurityHeaders, authenticateAccess } from '../cloudflare/lib/access.js';

const PRIVATE_API_ORIGIN = 'https://myserver-private.pages.dev';

export function createPrivateApiForwardRequest(request, configuredOrigin) {
  if (!configuredOrigin) return null;

  const source = new URL(request.url);
  if (!source.pathname.startsWith('/api/')) return null;
  if (source.pathname === '/api/isbn') return null;

  let origin;
  try {
    origin = new URL(String(configuredOrigin).trim());
  } catch {
    throw new AccessError('Private API forwarding is not configured', 503);
  }
  if (origin.origin !== PRIVATE_API_ORIGIN || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new AccessError('Private API forwarding is not configured', 503);
  }
  if (source.origin === origin.origin) throw new AccessError('Private API forwarding loop', 503);

  const target = new URL(`${source.pathname}${source.search}`, origin);
  return new Request(target, request);
}

function accessErrorResponse(error) {
  const status = error instanceof AccessError ? error.status : 403;
  const message = status === 503 ? 'Private site authentication is not configured' : 'Authentication required';
  return new Response(JSON.stringify({ status: 'error', ok: false, message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

export async function onRequest(context) {
  try {
    context.data.accessIdentity = await authenticateAccess(context.request, context.env);
    const forwardedRequest = createPrivateApiForwardRequest(context.request, context.env.PRIVATE_API_ORIGIN);
    if (forwardedRequest) return addSecurityHeaders(await fetch(forwardedRequest));
    return addSecurityHeaders(await context.next());
  } catch (error) {
    return addSecurityHeaders(accessErrorResponse(error));
  }
}
