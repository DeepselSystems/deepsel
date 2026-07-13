import { test, expect, type Page } from '@playwright/test';
import {
  createForm,
  DEFAULT_FORM_CONTENT_SETTINGS,
  getLocaleIdByIsoCode,
  submitAndWaitForResponse,
  warmUpVisit,
} from '../helpers/forms.js';

// Domain: public form submission flow. Skeleton only — see task #16 (harden-forms-module
// memory) for full description of each TC and the regression each fix locks down.
// TODO(#14): additional passing TCs for this domain not yet catalogued — re-read the
// source excel and add them here.

/**
 * Creates a form with one Number field configured with min/max advanced validation,
 * directly via the CRUD API (POST /api/v1/form, nested contents + fields) instead of
 * driving the admin form-builder UI. TC_002 only exercises the public submit flow, so
 * it doesn't need TC_001's full field-type coverage — a single field carrying the same
 * "advanced validation configured" precondition from the source excel is enough, and
 * building it via API keeps this test fast and independent of TC_001's own run (cross-file
 * test dependencies are unsafe under Playwright's parallel/unordered execution).
 *
 * `published` and `success_message` are passed explicitly — the generated Create route
 * has no `exclude_unset=True`, so an omitted `published` would be sent as `null` and the
 * public route 404s with "Form is not published" for any non-`true` value. See
 * helpers/forms.ts for the other Create-route gotchas (the 5 required booleans, the
 * X-Organization-Id header).
 */
async function createFormWithAdvancedValidationField(
  page: Page,
): Promise<{ slug: string; successMessage: string }> {
  const localeId = await getLocaleIdByIsoCode(page.request, 'en');

  const slug = `e2e-tc002-submit-${Date.now()}`;
  const successMessage = 'TC_002 submission received.';

  await createForm(page.request, {
    published: true,
    contents: [
      {
        title: 'TC_002 submission form',
        slug,
        locale_id: localeId,
        success_message: successMessage,
        ...DEFAULT_FORM_CONTENT_SETTINGS,
        fields: [
          {
            field_type: 'number',
            label: 'Age',
            required: true,
            field_config: {
              min_value: 18,
              max_value: 120,
              validation_message: 'Age must be between 18 and 120.',
            },
          },
        ],
      },
    ],
  });

  return { slug, successMessage };
}

test.describe('basic submission', () => {
  test('TC_002 - submit succeeds without a 307 redirect (advanced validation configured)', async ({
    page,
  }) => {
    // Fixed (2026-07-07): trailing slash on the submit fetch URL caused Starlette's
    // redirect_slashes middleware to 307 to the backend's own perceived host, bypassing
    // the proxy and losing the session cookie. See task #10.

    const { slug, successMessage } = await createFormWithAdvancedValidationField(page);

    // Warm-up visit: this is the first time this dev-server session serves the public
    // form route, so Vite discovers/optimizes new deps (@mantine/core etc.) and issues
    // a full-page HMR reload mid-navigation — observed wiping out an in-progress .fill()
    // on the real run below. Visiting once first (result discarded) lets that reload
    // happen before the real interaction.
    await warmUpVisit(page, `/en/forms/${slug}`);

    await page.goto(`/en/forms/${slug}`);

    const ageField = page.locator('.form-field').filter({ hasText: 'Age' });
    await ageField.locator('input[type="number"].form-field__control').fill('25');

    const submitResponse = await submitAndWaitForResponse(page);

    // The core regression check: the request that actually reaches the handler must be
    // a direct 2xx, never a 307 (no trailing-slash redirect through the backend's own
    // perceived host, which would bypass the proxy and drop the session cookie).
    expect(submitResponse.status()).not.toBe(307);
    expect(submitResponse.request().redirectedFrom()).toBeNull();
    expect(submitResponse.ok()).toBe(true);

    await expect(page.getByText(successMessage)).toBeVisible();
  });
});

const LIMIT_FIELD_LABEL = 'Answer';

/**
 * Creates a published, single-locale, single-field form via API with the
 * submission-limit settings TC_011 exercises (max_submissions,
 * enable_edit_submission, show_remaining_submissions). max_submissions is
 * always sent explicitly (null when unset) — the generated Create route has
 * no exclude_unset=True, so an omitted field would be sent as null anyway,
 * but being explicit here keeps the "unlimited" precondition self-documenting.
 */
async function createFormWithSubmissionSettings(
  page: Page,
  options: {
    maxSubmissions?: number;
    enableEditSubmission: boolean;
    showRemainingSubmissions?: boolean;
  },
): Promise<{ slug: string; contentId: number }> {
  const localeId = await getLocaleIdByIsoCode(page.request, 'en');

  const slug = `e2e-tc011-${Date.now()}`;

  const createdForm = await createForm(page.request, {
    published: true,
    contents: [
      {
        title: `TC_011 submission limits form ${Date.now()}`,
        slug,
        locale_id: localeId,
        success_message: 'Submitted.',
        max_submissions: options.maxSubmissions ?? null,
        ...DEFAULT_FORM_CONTENT_SETTINGS,
        show_remaining_submissions: options.showRemainingSubmissions ?? false,
        enable_edit_submission: options.enableEditSubmission,
        fields: [{ field_type: 'short_answer', label: LIMIT_FIELD_LABEL, required: false }],
      },
    ],
  });

  return { slug, contentId: createdForm.contents[0].id };
}

/** Fills and submits the single-field TC_011 form, returning the submit response. */
async function submitAnswer(page: Page, slug: string, value: string) {
  await page.goto(`/en/forms/${slug}`);
  await page
    .locator('.form-field')
    .filter({ hasText: LIMIT_FIELD_LABEL })
    .locator('input[type="text"].form-field__control')
    .fill(value);

  return submitAndWaitForResponse(page);
}

test.describe('submission limits', () => {
  test('TC_011 - submissions are unlimited when Max submissions is left empty', async ({ page }) => {
    const { slug, contentId } = await createFormWithSubmissionSettings(page, {
      enableEditSubmission: false,
    });

    // Warm-up visit: first-hit Vite dep-optimize on a route not yet touched this
    // dev-server session.
    await warmUpVisit(page, `/en/forms/${slug}`);

    const firstResponse = await submitAnswer(page, slug, 'First');
    expect(firstResponse.ok()).toBe(true);
    const secondResponse = await submitAnswer(page, slug, 'Second');
    expect(secondResponse.ok()).toBe(true);

    const searchResponse = await page.request.post('/api/v1/form_submission/search', {
      data: { search: { AND: [{ field: 'form_content_id', operator: '=', value: contentId }], OR: [] } },
    });
    expect(searchResponse.ok()).toBe(true);
    const { total } = await searchResponse.json();
    expect(total).toBe(2);
  });

  test('TC_011 - submission is blocked and the remaining-submissions banner shows once Max submissions is reached', async ({
    page,
  }) => {
    const { slug } = await createFormWithSubmissionSettings(page, {
      maxSubmissions: 1,
      enableEditSubmission: false,
      showRemainingSubmissions: true,
    });

    await warmUpVisit(page, `/en/forms/${slug}`);

    const firstResponse = await submitAnswer(page, slug, 'Only answer allowed');
    expect(firstResponse.ok()).toBe(true);
    await expect(page.getByText('Submitted.')).toBeVisible();

    // Fresh visit — the page's fetched formData now reflects
    // submissions_count(1) >= max_submissions(1), which the theme's Form.tsx
    // uses to preemptively disable Submit and show the limit-reached banner,
    // rather than waiting for a rejected POST.
    await page.goto(`/en/forms/${slug}`);

    await expect(
      page.getByText('This form has reached its submission limit and is no longer accepting responses.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });
});

test.describe('edit submission', () => {
  test('TC_011 - no duplicate submissions when the same user submits again with "Allow edit submission" enabled', async ({
    page,
  }) => {
    const { slug, contentId } = await createFormWithSubmissionSettings(page, {
      enableEditSubmission: true,
    });

    await warmUpVisit(page, `/en/forms/${slug}`);

    await submitAnswer(page, slug, 'First answer');
    // Same authenticated session (the suite's shared storageState admin user,
    // not public_user) resubmitting against the same form_content_id edits the
    // existing row in place instead of creating a second one — confirmed in
    // form_submission.py's create() during TC_024's investigation.
    await submitAnswer(page, slug, 'Second answer');

    const searchResponse = await page.request.post('/api/v1/form_submission/search', {
      data: { search: { AND: [{ field: 'form_content_id', operator: '=', value: contentId }], OR: [] } },
    });
    expect(searchResponse.ok()).toBe(true);
    const { total } = await searchResponse.json();
    expect(total).toBe(1);
  });

  test('TC_011 - submission history is not empty after a second submission with "Allow edit submission" enabled', async ({
    page,
  }) => {
    const { slug, contentId } = await createFormWithSubmissionSettings(page, {
      enableEditSubmission: true,
    });

    await warmUpVisit(page, `/en/forms/${slug}`);

    await submitAnswer(page, slug, 'First answer');
    await submitAnswer(page, slug, 'Second answer');

    const searchResponse = await page.request.post('/api/v1/form_submission/search', {
      data: { search: { AND: [{ field: 'form_content_id', operator: '=', value: contentId }], OR: [] } },
    });
    expect(searchResponse.ok()).toBe(true);
    const { data } = await searchResponse.json();
    const submissionId = data[0].id;

    const getResponse = await page.request.get(`/api/v1/form_submission/${submissionId}`);
    expect(getResponse.ok()).toBe(true);
    const submission = await getResponse.json();
    expect(submission.submission_versions?.length).toBeGreaterThanOrEqual(1);
  });
});
