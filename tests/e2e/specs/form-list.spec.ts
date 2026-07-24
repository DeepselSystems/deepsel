import { test, expect } from '@playwright/test';
import { createForm, DEFAULT_FORM_CONTENT_SETTINGS, getLocaleIdByIsoCode } from '../helpers/forms.js';

// Domain: admin Form List screen (/admin/forms).

test('a created form shows up in the admin form list', async ({ page }) => {
  const localeId = await getLocaleIdByIsoCode(page.request, 'en');
  const suffix = Date.now();
  const title = `E2E list form ${suffix}`;
  const slug = `e2e-list-form-${suffix}`;

  await createForm(page.request, {
    published: true,
    contents: [
      {
        title,
        slug,
        locale_id: localeId,
        success_message: 'Submitted.',
        ...DEFAULT_FORM_CONTENT_SETTINGS,
        fields: [{ field_type: 'short_answer', label: 'Name', required: false }],
      },
    ],
  });

  // Warm-up visit: first hit of the admin Form List route in this dev-server
  // session — Vite discovers/optimizes new deps and reloads mid-navigation.
  await page.goto('/admin/forms');
  await page
    .getByRole('heading', { level: 1, name: 'Forms' })
    .waitFor({ state: 'visible', timeout: 30_000 });

  const searchInput = page.getByPlaceholder('Search...');
  await searchInput.fill(title);

  await expect(page.getByRole('cell', { name: title, exact: true })).toBeVisible();
});
