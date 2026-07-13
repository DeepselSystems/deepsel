import { test, expect, type Page } from '@playwright/test';
import { loginViaUI, logoutViaUI } from '../helpers/auth.js';
import {
  createForm,
  DEFAULT_FORM_CONTENT_SETTINGS,
  getLocaleIdByIsoCode,
  submitAndWaitForResponse,
  warmUpVisit,
} from '../helpers/forms.js';

// Domain: form prefill / viewer-scoped localStorage. Skeleton only — see task #17
// (harden-forms-module memory) for full description of each TC and the regression
// each fix locks down.
// TODO(#14): additional passing TCs for this domain not yet catalogued — re-read the
// source excel and add them here.

const FIELD_LABELS = {
  shortAnswer: 'Full Name',
  number: 'Age',
  dropdown: 'Country',
  checkboxes: 'Interests',
  multipleChoice: 'Gender',
  date: 'Birth Date',
};

const DROPDOWN_OPTION = { value: 'switzerland', label: 'Switzerland' };
const CHECKBOX_OPTION = { value: 'reading', label: 'Reading' };
const RADIO_OPTION = { value: 'female', label: 'Female' };

/**
 * Creates a form via API covering the mixed field-type precondition from TC_025's
 * source excel row (text, number, dropdown, checkbox, multiple choice, date) — the
 * exact field types the prefill hook's saveFormPrefillData/getFormPrefillData must
 * round-trip correctly. Mirrors form-statistics.spec.ts's createFormWithStatisticsEnabled
 * — built via the CRUD API rather than the admin builder UI.
 */
async function createFormWithMixedFields(page: Page): Promise<{ slug: string; successMessage: string }> {
  const localeId = await getLocaleIdByIsoCode(page.request, 'en');

  const slug = `e2e-tc025-prefill-${Date.now()}`;
  const successMessage = 'TC_025 submission received.';

  await createForm(page.request, {
    published: true,
    contents: [
      {
        title: 'TC_025 prefill form',
        slug,
        locale_id: localeId,
        success_message: successMessage,
        ...DEFAULT_FORM_CONTENT_SETTINGS,
        fields: [
          { field_type: 'short_answer', label: FIELD_LABELS.shortAnswer, required: false },
          { field_type: 'number', label: FIELD_LABELS.number, required: false },
          {
            field_type: 'dropdown',
            label: FIELD_LABELS.dropdown,
            required: false,
            field_config: {
              options: [{ value: 'vietnam', label: 'Vietnam' }, DROPDOWN_OPTION],
            },
          },
          {
            field_type: 'checkboxes',
            label: FIELD_LABELS.checkboxes,
            required: false,
            field_config: {
              options: [CHECKBOX_OPTION, { value: 'sports', label: 'Sports' }],
            },
          },
          {
            field_type: 'multiple_choice',
            label: FIELD_LABELS.multipleChoice,
            required: false,
            field_config: {
              options: [{ value: 'male', label: 'Male' }, RADIO_OPTION],
            },
          },
          { field_type: 'date', label: FIELD_LABELS.date, required: false },
        ],
      },
    ],
  });

  return { slug, successMessage };
}

/** Fills every field of the mixed-field TC_025 form with a fixed set of values. */
async function fillAllFields(page: Page): Promise<void> {
  await page
    .locator('.form-field')
    .filter({ hasText: FIELD_LABELS.shortAnswer })
    .locator('input[type="text"].form-field__control')
    .fill('Nguyen Van A');
  await page
    .locator('.form-field')
    .filter({ hasText: FIELD_LABELS.number })
    .locator('input[type="number"].form-field__control')
    .fill('30');
  await page
    .locator('.form-field')
    .filter({ hasText: FIELD_LABELS.dropdown })
    .locator('select.form-field__control')
    .selectOption({ label: DROPDOWN_OPTION.label });
  await page
    .locator('.form-field')
    .filter({ hasText: FIELD_LABELS.checkboxes })
    .locator('label.form-field__option')
    .filter({ hasText: CHECKBOX_OPTION.label })
    .locator('input[type="checkbox"]')
    .check();
  await page
    .locator('.form-field')
    .filter({ hasText: FIELD_LABELS.multipleChoice })
    .locator('label.form-field__option')
    .filter({ hasText: RADIO_OPTION.label })
    .locator('input[type="radio"]')
    .check();
  await page
    .locator('.form-field')
    .filter({ hasText: FIELD_LABELS.date })
    .locator('input[type="date"].form-field__control')
    .fill('1990-05-15');
}

/** Asserts every field of the mixed-field TC_025 form is empty/unchecked (no prefill applied). */
async function expectAllFieldsEmpty(page: Page): Promise<void> {
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.shortAnswer })
      .locator('input[type="text"].form-field__control'),
  ).toHaveValue('');
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.number })
      .locator('input[type="number"].form-field__control'),
  ).toHaveValue('');
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.dropdown })
      .locator('select.form-field__control'),
  ).toHaveValue('');
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.checkboxes })
      .locator('label.form-field__option')
      .filter({ hasText: CHECKBOX_OPTION.label })
      .locator('input[type="checkbox"]'),
  ).not.toBeChecked();
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.multipleChoice })
      .locator('label.form-field__option')
      .filter({ hasText: RADIO_OPTION.label })
      .locator('input[type="radio"]'),
  ).not.toBeChecked();
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.date })
      .locator('input[type="date"].form-field__control'),
  ).toHaveValue('');
}

/** Asserts every field of the mixed-field TC_025 form matches the values filled by fillAllFields. */
async function expectAllFieldsPrefilled(page: Page): Promise<void> {
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.shortAnswer })
      .locator('input[type="text"].form-field__control'),
  ).toHaveValue('Nguyen Van A');
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.number })
      .locator('input[type="number"].form-field__control'),
  ).toHaveValue('30');
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.dropdown })
      .locator('select.form-field__control'),
  ).toHaveValue(DROPDOWN_OPTION.value);
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.checkboxes })
      .locator('label.form-field__option')
      .filter({ hasText: CHECKBOX_OPTION.label })
      .locator('input[type="checkbox"]'),
  ).toBeChecked();
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.multipleChoice })
      .locator('label.form-field__option')
      .filter({ hasText: RADIO_OPTION.label })
      .locator('input[type="radio"]'),
  ).toBeChecked();
  await expect(
    page
      .locator('.form-field')
      .filter({ hasText: FIELD_LABELS.date })
      .locator('input[type="date"].form-field__control'),
  ).toHaveValue('1990-05-15');
}

/** Fills, submits, and confirms success for the mixed-field TC_025 form. */
async function submitForm(page: Page, slug: string, successMessage: string): Promise<void> {
  // Warm-up visit: the form page is a separately code-split bundle, so it gets its
  // own first-hit Vite optimize+reload in this dev-server session — same pattern as
  // form-submission.spec.ts / form-statistics.spec.ts.
  await warmUpVisit(page, `/en/forms/${slug}`);
  await page.goto(`/en/forms/${slug}`);

  await fillAllFields(page);

  await submitAndWaitForResponse(page);
  await expect(page.getByText(successMessage)).toBeVisible();
}

test.describe('viewer isolation', () => {
  test.describe('logout leak check', () => {
    // This test calls logoutViaUI, which invalidates the session server-side
    // (session_store.delete). The rest of the suite reuses one shared session
    // baked into storageState.json (from auth.setup.ts) — reusing that same
    // session here would permanently log out every test that runs after this
    // one. Starting anonymous and logging in fresh via the real UI gives this
    // test its own session, so its logout only affects itself.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('TC_025 - anonymous visitor does not see a previous logged-in user\'s prefilled answers after logout', async ({
      page,
    }) => {
      await loginViaUI(page);
      const { slug, successMessage } = await createFormWithMixedFields(page);

      await submitForm(page, slug, successMessage);

      // Sanity check: reloading as the same logged-in user must still show the
      // prefill — this is the companion TC_025 test's assertion, re-checked here so
      // this test alone proves data really was saved before logout, not merely that
      // it's absent afterward for an unrelated reason (e.g. it was never written).
      await page.goto(`/en/forms/${slug}`);
      await expectAllFieldsPrefilled(page);

      // Real logout: invalidates the session cookie + clears PREFERENCE_KEY_USER_DATA,
      // but — like production — never touches form_prefill_data in localStorage. See
      // helpers/auth.ts for why this matters: the test must not fake browser storage
      // cleanup that real logout doesn't do, or it would hide the exact bug TC_025 is
      // reproducing.
      await logoutViaUI(page);

      // Re-open the same form as an anonymous visitor, same browser/localStorage.
      await page.goto(`/en/forms/${slug}`);
      await expectAllFieldsEmpty(page);
    });
  });

  test('TC_025 - a logged-in user\'s own prefill is retained across sessions', async ({ page }) => {
    const { slug, successMessage } = await createFormWithMixedFields(page);

    await submitForm(page, slug, successMessage);

    // "Across sessions" = a fresh page load (full SSR navigation, viewer_id
    // re-resolved from the session cookie), not just leftover in-memory React
    // state — page.reload() forces exactly that.
    await page.reload();
    await expectAllFieldsPrefilled(page);
  });
});
