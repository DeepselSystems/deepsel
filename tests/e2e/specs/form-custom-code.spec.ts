import { test, expect, type Page } from '@playwright/test';
import {
  createForm,
  DEFAULT_FORM_CONTENT_SETTINGS,
  getLocaleIdByIsoCode,
  warmUpVisit,
} from '../helpers/forms.js';

// Domain: form custom-code (HTML/JS) injection. Skeleton only — see task #20
// (harden-forms-module memory) for full description of the TC below.
// TODO(#14): additional passing TCs for this domain not yet catalogued — re-read the
// source excel and add them here.

/**
 * Creates a form via API with 2 distinct custom code sources — all-languages
 * (form_custom_code) and an English content block — each an inline <script>
 * that calls `alert()` with its own distinguishing text. Deliberately not a
 * DOM-mutating script (see the long comment on the test below for why) — a
 * German content block carries no custom code at all, to prove per-language
 * scoping. Mirrors form-submission.spec.ts's createFormWithAdvancedValidationField
 * (built via the CRUD API, independent of any other test's own form).
 */
async function createFormWithCustomCode(page: Page): Promise<{
  enSlug: string;
  deSlug: string;
  globalText: string;
  enText: string;
}> {
  const enLocaleId = await getLocaleIdByIsoCode(page.request, 'en');
  const deLocaleId = await getLocaleIdByIsoCode(page.request, 'de');

  const slugSuffix = Date.now();
  const enSlug = `e2e-tc010-custom-code-en-${slugSuffix}`;
  const deSlug = `e2e-tc010-custom-code-de-${slugSuffix}`;
  const globalText = `GLOBAL_JS_PRINTED_${slugSuffix}`;
  const enText = `EN_JS_PRINTED_${slugSuffix}`;

  const customCode = (text: string) => `<script>alert('${text}');</script>`;

  await createForm(page.request, {
    published: true,
    form_custom_code: customCode(globalText),
    contents: [
      {
        title: 'TC_010 custom code form (EN)',
        slug: enSlug,
        locale_id: enLocaleId,
        success_message: 'Submitted.',
        custom_code: customCode(enText),
        ...DEFAULT_FORM_CONTENT_SETTINGS,
        fields: [{ field_type: 'short_answer', label: 'Name', required: false }],
      },
      {
        // No custom_code here at all — only the global block should reach
        // this language's page, proving per-language scoping the other way.
        title: 'TC_010 custom code form (DE)',
        slug: deSlug,
        locale_id: deLocaleId,
        success_message: 'Gesendet.',
        ...DEFAULT_FORM_CONTENT_SETTINGS,
        fields: [{ field_type: 'short_answer', label: 'Name', required: false }],
      },
    ],
  });

  return { enSlug, deSlug, globalText, enText };
}

test.describe('custom code execution', () => {
  test('TC_010 - custom code script executes (alert), scoped per language', async ({ page }) => {
    // Deliberately uses alert(), not a DOM-mutating script (e.g. setting an
    // attribute or inserting an element) — earlier attempts at this test used
    // exactly that and hit a real but narrower bug: mutating the
    // dangerouslySetInnerHTML container during the initial SSR-HTML-parse
    // (before/during React hydration) makes React's client-side re-computation
    // of that same container mismatch the actual (script-mutated) DOM, so React
    // discards and replaces the whole subtree with its own unmutated client
    // render — and since CustomCodeRenderer's clone-and-replace `useEffect` (the
    // documented fix for dangerouslySetInnerHTML leaving <script> tags inert)
    // only runs once on mount, it never gets a second chance to run against the
    // replacement DOM, so the mutation is silently lost. `alert()` never touches
    // the DOM at all, so there's nothing for React to diff against and no
    // mismatch — this is also exactly how the source excel's own step 14
    // ("Click vào tôi!" → alert) and this test's own manual verification both
    // exercise it, so this is the representative case for TC_010, not the
    // DOM-mutation one.
    const alerts: string[] = [];
    page.on('dialog', async (dialog) => {
      alerts.push(dialog.message());
      await dialog.accept();
    });

    const { enSlug, deSlug, globalText, enText } = await createFormWithCustomCode(page);

    // Warm-up visit: first hit of this public form route in this dev-server
    // session — same Vite first-hit-optimize-and-reload flake as TC_002/TC_004.
    await warmUpVisit(page, `/en/forms/${enSlug}`);
    alerts.length = 0; // discard anything the warm-up visit triggered

    // --- English page: both the global and the English-specific script ran ---
    await page.goto(`/en/forms/${enSlug}`);
    await expect.poll(() => alerts).toContain(globalText);
    await expect.poll(() => alerts).toContain(enText);

    // --- German page: only the global script ran (this content has no custom
    // code of its own) — the English-specific alert must not fire here ---
    alerts.length = 0;
    await page.goto(`/de/forms/${deSlug}`);
    await expect.poll(() => alerts).toContain(globalText);
    expect(alerts).not.toContain(enText);
  });
});
