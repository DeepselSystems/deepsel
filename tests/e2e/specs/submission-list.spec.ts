import { test, expect } from '@playwright/test';
import { createFormWithSubmission } from '../helpers/forms.js';

// Domain: admin Form submissions list (/admin/form-submissions).

test('a submitted form appears in the admin submissions list', async ({ page }) => {
  const suffix = Date.now();
  const { title } = await createFormWithSubmission(
    page,
    `E2E submission list form ${suffix}`,
    `e2e-submission-list-${suffix}`,
  );

  // Warm-up visit: first hit of this admin route in this dev-server session
  // — Vite discovers/optimizes new deps and reloads mid-navigation.
  await page.goto('/admin/form-submissions');
  await page
    .getByRole('heading', { level: 1, name: 'Form submissions' })
    .waitFor({ state: 'visible', timeout: 30_000 });

  await expect(page.getByRole('row').filter({ hasText: title })).toBeVisible();
});
