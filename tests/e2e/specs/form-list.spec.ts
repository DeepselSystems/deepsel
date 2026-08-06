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

  // Longer timeout than the global default: the search re-fetch + re-render
  // round trip can take longer than 10s under CI load, and this assertion
  // was seen timing out at 10s while the row was already present moments
  // later (confirmed via trace snapshot) — not a functional failure.
  await expect(page.getByRole('cell', { name: title, exact: true })).toBeVisible({
    timeout: 20_000,
  });
});
