import type { MiddlewareHandler } from 'astro';

const BACKEND_ORIGIN = 'http://localhost:8000';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const url = new URL(context.request.url);

  if (url.pathname.startsWith('/api/v1')) {
    const backendUrl = `${BACKEND_ORIGIN}${url.pathname}${url.search}`;
    const headers = new Headers(context.request.headers);
    headers.set('X-Original-Host', url.host);

    const response = await fetch(backendUrl, {
      method: context.request.method,
      headers,
      body:
        context.request.method !== 'GET' && context.request.method !== 'HEAD'
          ? context.request.body
          : undefined,
      // @ts-ignore - duplex needed for streaming body
      duplex: 'half',
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  return next();
};
