import { test, expect, type Page } from '@playwright/test';
import {
  createForm,
  DEFAULT_FORM_CONTENT_SETTINGS,
  getLocaleIdByIsoCode,
} from '../helpers/forms.js';

// Domain: admin Form Create/Update screen (FormUpsert).

/** Adds one field via the "Add Field" menu, filling only its label. */
async function addField(page: Page, menuLabel: string, fieldLabel: string) {
  await page.getByRole('button', { name: 'Add Field' }).click();
  // Menu.Item's accessible name concatenates its label + description text, so
  // an exact-text filter on the bold label is needed to disambiguate e.g.
  // "Date" from "Date & Time".
  await page
    .getByRole('menuitem')
    .filter({ has: page.getByText(menuLabel, { exact: true }) })
    .click();
  await page.getByLabel('Field Label').last().fill(fieldLabel);
}

test('admin can create a form with a field through the builder UI', async ({ page }) => {
  const formTitle = `E2E create form ${Date.now()}`;

  // Arrive via the Form List's "Create Form" link (like a real user) rather
  // than navigating straight to /admin/forms/create — Save falls back to
  // navigate(-1) when there's no ?redirect= param, which needs a real prior
  // history entry to land on.
  await page.goto('/admin/forms');
  await page.getByRole('link', { name: 'Create Form' }).click();
  await page.waitForURL('**/admin/forms/create');

  // Slug auto-generates from the title via a debounced (1s) call to
  // form_content/generate-slug, and Save's own validation requires it to be
  // set — start listening before the title fill triggers it.
  const generateSlugResponsePromise = page.waitForResponse(
    (res) => new URL(res.url()).pathname === '/api/v1/form_content/generate-slug',
  );
  await page.getByLabel('Form title').fill(formTitle);
  await addField(page, 'Short Answer', 'Your name');

  await expect(page.locator('.form-renderer .form-field__label')).toHaveText('Your name');
  await generateSlugResponsePromise;

  const createFormResponsePromise = page.waitForResponse(
    (res) => new URL(res.url()).pathname === '/api/v1/form' && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const saveResponse = await createFormResponsePromise;
  expect(saveResponse.ok()).toBe(true);

  await expect(page).toHaveURL(/\/admin\/forms(\?.*)?$/);
  await expect(page.getByText(formTitle)).toBeVisible();
});

test('admin can update an existing form through the builder UI', async ({ page }) => {
  const localeId = await getLocaleIdByIsoCode(page.request, 'en');
  const originalTitle = `E2E update form ${Date.now()}`;
  const updatedTitle = `${originalTitle} (updated)`;

  const createdForm = await createForm(page.request, {
    published: true,
    contents: [
      {
        title: originalTitle,
        slug: `e2e-update-form-${Date.now()}`,
        locale_id: localeId,
        success_message: 'Submitted.',
        ...DEFAULT_FORM_CONTENT_SETTINGS,
        fields: [{ field_type: 'short_answer', label: 'Your name', required: false }],
      },
    ],
  });

  await page.goto(`/admin/forms/${createdForm.id}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.waitForURL('**/admin/forms/*/edit');

  await page.getByLabel('Form title').fill(updatedTitle);
  await addField(page, 'Short Answer', 'Company');

  const updateFormResponsePromise = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === `/api/v1/form/${createdForm.id}` &&
      res.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await updateFormResponsePromise).ok()).toBe(true);

  // Reopen the form to confirm the changes persisted, not just the in-memory
  // builder state.
  await page.goto(`/admin/forms/${createdForm.id}`);
  await expect(page.getByText(updatedTitle)).toBeVisible();
  await expect(page.locator('.form-renderer .form-field__label')).toHaveText([
    'Your name',
    'Company',
  ]);
});
