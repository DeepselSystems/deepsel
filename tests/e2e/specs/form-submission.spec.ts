import { test, expect } from '@playwright/test';
import {
  createForm,
  DEFAULT_FORM_CONTENT_SETTINGS,
  getLocaleIdByIsoCode,
  submitAndWaitForResponse,
  warmUpVisit,
} from '../helpers/forms.js';

// Domain: public form page and submission flow.

async function createSimpleForm(page: import('@playwright/test').Page) {
  const localeId = await getLocaleIdByIsoCode(page.request, 'en');
  const slug = `e2e-submit-form-${Date.now()}`;
  const successMessage = 'Thanks for submitting.';

  await createForm(page.request, {
    published: true,
    contents: [
      {
        title: 'E2E submission form',
        slug,
        locale_id: localeId,
        success_message: successMessage,
        ...DEFAULT_FORM_CONTENT_SETTINGS,
        fields: [{ field_type: 'short_answer', label: 'Name', required: false }],
      },
    ],
  });

  return { slug, successMessage };
}

test('the public form page renders its title and fields', async ({ page }) => {
  const { slug } = await createSimpleForm(page);

  // Warm-up visit: first hit of this public route in this dev-server session
  // — Vite discovers/optimizes new deps and reloads mid-navigation.
  await warmUpVisit(page, `/en/forms/${slug}`);

  await page.goto(`/en/forms/${slug}`);
  await expect(page.getByRole('heading', { name: 'E2E submission form' })).toBeVisible();
  await expect(page.locator('.form-field').filter({ hasText: 'Name' })).toBeVisible();
});

test('a visitor can fill and submit a form', async ({ page }) => {
  const { slug, successMessage } = await createSimpleForm(page);

  await warmUpVisit(page, `/en/forms/${slug}`);
  await page.goto(`/en/forms/${slug}`);

  await page
    .locator('.form-field')
    .filter({ hasText: 'Name' })
    .locator('input[type="text"].form-field__control')
    .fill('Jane Doe');

  const submitResponse = await submitAndWaitForResponse(page);
  expect(submitResponse.ok()).toBe(true);

  await expect(page.getByText(successMessage)).toBeVisible();
});
