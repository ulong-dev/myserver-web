import { proxyAppsScript, proxyErrorResponse } from '../../cloudflare/lib/proxy.js';

export async function onRequest(context) {
  try {
    return await proxyAppsScript(context, 'APPS_SCRIPT_LIBRARY_URL');
  } catch (error) {
    return proxyErrorResponse(error);
  }
}
