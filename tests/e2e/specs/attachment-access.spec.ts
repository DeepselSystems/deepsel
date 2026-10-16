import { test, expect, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { CLIENT_BASE_URL } from '../playwright.config';

// Domain: who may load /api/v1/attachment/serve* (deepsel/apps/core/utils/attachment_access.py).
// This repo's settings keep ATTACHMENT_DEFAULT_VISIBILITY=public (the cms serves a
// public website) and ATTACHMENT_RANDOM_NAMES off, so an upload without a flag is
// public as before; `public=false` makes one file private.

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);

type Uploaded = { id: number; name: string; file: string; public: boolean | null };

async function upload(request: APIRequestContext, name: string, isPublic?: boolean): Promise<Uploaded> {
  const flag = isPublic === undefined ? '' : `&public=${isPublic}`;
  const response = await request.post(`/api/v1/attachment?locale_id=1${flag}`, {
    headers: { 'X-Organization-Id': '1' },
    multipart: { files: { name, mimeType: 'image/png', buffer: PNG_1PX } },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const [attachment] = await response.json();
  return {
    id: attachment.id,
    name: attachment.name,
    file: attachment.locale_versions[0].name,
    public: attachment.public,
  };
}

async function anonymous(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: CLIENT_BASE_URL, storageState: { cookies: [], origins: [] } });
}

test('a file uploaded with no flag follows the site default (public here) and loads logged-out', async ({ page }) => {
  const file = await upload(page.request, `e2e-default-${Date.now()}.png`);
  expect(file.public).toBeNull();
  const anon = await anonymous();
  try {
    const served = await anon.get(`/api/v1/attachment/serve/${file.file}`);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toContain('image/png');
    expect((await anon.get(`/api/v1/attachment/serve-by-name/${file.name}`)).status()).toBe(200);
  } finally {
    await anon.dispose();
  }
});

test('a private file loads only for a signed-in reader or through a signed link', async ({ page }) => {
  const file = await upload(page.request, `e2e-private-${Date.now()}.png`, false);
  expect(file.public).toBe(false);
  const anon = await anonymous();
  try {
    // logged-out: refused on both routes
    expect((await anon.get(`/api/v1/attachment/serve/${file.file}`)).status()).toBe(401);
    expect((await anon.get(`/api/v1/attachment/serve-by-name/${file.name}`)).status()).toBe(401);

    // signed in (the session cookie, as an <img src> sends it): served, not shared-cacheable
    const mine = await page.request.get(`/api/v1/attachment/serve/${file.file}`);
    expect(mine.status()).toBe(200);
    expect(mine.headers()['cache-control']).toContain('private');

    // a signed link opens it logged-out; a tampered or reused-elsewhere one does not
    const signed = await page.request.get(`/api/v1/attachment/signed-url/${file.file}?expires_in=600`);
    expect(signed.status()).toBe(200);
    const { url, expires_in } = await signed.json();
    expect(expires_in).toBe(600);
    expect(url).toContain(`/attachment/serve/${file.file}?exp=`);
    const path = url.replace(/^.*?(\/api\/v1\/)/, '$1');
    expect((await anon.get(path)).status()).toBe(200);
    expect((await anon.get(path.replace(/sig=[^&]+/, 'sig=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))).status()).toBe(401);
    const other = await upload(page.request, `e2e-other-${Date.now()}.png`, false);
    const sigPart = path.slice(path.indexOf('?'));
    expect((await anon.get(`/api/v1/attachment/serve/${other.file}${sigPart}`)).status()).toBe(401);

    // flipping the flag: public now, then back to the site default (public), then private again
    expect((await page.request.put(`/api/v1/attachment/${file.id}`, { data: { public: true } })).ok()).toBe(true);
    expect((await anon.get(`/api/v1/attachment/serve/${file.file}`)).status()).toBe(200);
    expect((await page.request.put(`/api/v1/attachment/${file.id}`, { data: { public: null } })).ok()).toBe(true);
    expect((await anon.get(`/api/v1/attachment/serve/${file.file}`)).status()).toBe(200);
    expect((await page.request.put(`/api/v1/attachment/${file.id}`, { data: { public: false } })).ok()).toBe(true);
    expect((await anon.get(`/api/v1/attachment/serve/${file.file}`)).status()).toBe(401);
  } finally {
    await anon.dispose();
  }
});

test('a file that does not exist is 404 for everyone', async ({ page }) => {
  expect((await page.request.get('/api/v1/attachment/serve/e2e-no-such-file.png')).status()).toBe(404);
  expect((await page.request.get('/api/v1/attachment/signed-url/e2e-no-such-file.png')).status()).toBe(404);
});
