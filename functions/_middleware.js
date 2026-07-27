import { AccessError, addSecurityHeaders, authenticateAccess } from '../cloudflare/lib/access.js';

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
    return addSecurityHeaders(await context.next());
  } catch (error) {
    return addSecurityHeaders(accessErrorResponse(error));
  }
}
