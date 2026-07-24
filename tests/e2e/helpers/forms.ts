import { expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * A form_content's 5 notification/limit booleans are all `nullable=False` on
 * FormContentModel — the generated Create schema requires them explicitly
 * regardless of their column-level Python default (confirmed via a live 422
 * response). Spread this into a content object and override only the fields
 * a given test actually cares about.
 */
export const DEFAULT_FORM_CONTENT_SETTINGS = {
  show_remaining_submissions: true,
  enable_edit_submission: false,
  enable_submitter_email_notifications: false,
  enable_admin_email_notifications: false,
  enable_public_statistics: false,
};

export interface Locale {
  id: number;
  name: string;
  iso_code: string;
}

export interface CreatedForm {
  id: number;
  contents: Array<{ id: number }>;
}

/** Looks up a single seeded locale's full record (id + name + iso_code) via POST /api/v1/locale/search. */
export async function getLocaleByIsoCode(
  request: APIRequestContext,
  isoCode: string,
): Promise<Locale> {
  const response = await request.post('/api/v1/locale/search', {
    data: { search: { AND: [{ field: 'iso_code', operator: '=', value: isoCode }], OR: [] } },
  });
  expect(response.ok()).toBe(true);
  const { data } = await response.json();
  return data[0];
}

/** Looks up a single seeded locale's id by ISO code (e.g. 'en') — see getLocaleByIsoCode. */
export async function getLocaleIdByIsoCode(
  request: APIRequestContext,
  isoCode: string,
): Promise<number> {
  return (await getLocaleByIsoCode(request, isoCode)).id;
}

/**
 * Creates a form via POST /api/v1/form. `form` is a tenant-scoped table (has
 * organization_id) — the CRUD create route resolves it from the
 * X-Organization-Id header. Org id 1 is the single row deepsel's own
 * organization.csv seeds on a fresh DB.
 */
export async function createForm(
  request: APIRequestContext,
  payload: {
    published: boolean;
    form_custom_code?: string;
    contents: Array<Record<string, unknown>>;
  },
): Promise<CreatedForm> {
  const response = await request.post('/api/v1/form', {
    headers: { 'X-Organization-Id': '1' },
    data: payload,
  });
  expect(response.ok()).toBe(true);
  return response.json();
}

/**
 * Creates a real form_submission via POST /api/v1/form_submission.
 * form_submission's create route is a hand-written multipart/form-data handler
 * (not the generic CRUD JSON route) that reads request.form() directly,
 * matching what the public Form.tsx's real submit sends.
 */
export async function createFormSubmissionViaApi(
  request: APIRequestContext,
  params: { formId: number; contentId: number; submissionData?: Record<string, unknown> },
): Promise<void> {
  const response = await request.post('/api/v1/form_submission', {
    multipart: {
      form_id: String(params.formId),
      form_content_id: String(params.contentId),
      submission_data: JSON.stringify(params.submissionData ?? {}),
    },
  });
  expect(response.ok()).toBe(true);
}

/** Creates a published, single-locale form via the API with one real submission already attached. */
export async function createFormWithSubmission(
  page: Page,
  title: string,
  slug: string,
): Promise<{ formId: number; contentId: number; title: string; slug: string }> {
  const localeId = await getLocaleIdByIsoCode(page.request, 'en');
  const createdForm = await createForm(page.request, {
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
  const contentId = createdForm.contents[0].id;

  await createFormSubmissionViaApi(page.request, { formId: createdForm.id, contentId });

  return { formId: createdForm.id, contentId, title, slug };
}

/**
 * Warm-up visit for a route not yet touched this dev-server session: Vite
 * discovers/optimizes new deps and issues a full-page HMR reload mid-navigation,
 * which can wipe out an in-progress `.fill()` on the real visit that follows.
 * Visiting once first (result discarded) lets that reload happen early.
 */
export async function warmUpVisit(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

/**
 * Clicks the form's Submit button and waits for the resulting
 * POST /api/v1/form_submission response, returning it so callers can assert on
 * status/ok directly.
 */
export async function submitAndWaitForResponse(page: Page) {
  const responsePromise = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === '/api/v1/form_submission' && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Submit' }).click();
  return responsePromise;
}
