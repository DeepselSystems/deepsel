import { test, expect, type Page } from '@playwright/test';
import {
  createForm,
  DEFAULT_FORM_CONTENT_SETTINGS,
  getAllLocales,
  getLocaleIdByIsoCode,
} from '../helpers/forms.js';

// Domain: admin "Form View" screen (read-only view/preview mode, separate from the
// Form Create/Update builder) — matches the source excel's own "Form view"
// Section/Page grouping (TC_018, TC_019).
//
// TC_001 was previously stubbed here by mistake; moved to form-builder.spec.ts on
// 2026-07-09 since its entire flow (create + add fields) runs on the Create/Update
// screen, not this one — see task #15.
//
// TC_019's source-excel Steps are a generic template shared across several TCs in
// the sheet (mentions Back/Cancel, Save, Publish/Unpublish, Duplicate/Delete,
// Preview/Open website as hypothetical buttons) — read directly against
// FormView.jsx (deepsel/packages/admin/src/components/admin/form/FormView.jsx):
// this screen has no Back/Cancel/Save/Duplicate/Delete button at all (those only
// exist on FormUpsert, the builder). Its real toolbar is 5 controls: Copy share
// link, Go to page, View statistics, View submissions, Edit — plus the Publish
// switch already covered by TC_013. Scope confirmed with the user: cover the 5
// real controls, don't duplicate the Publish switch here.

/**
 * Creates a form via API with 2 language versions, each with its own title,
 * description, and one short-answer field with a distinct label/description/
 * placeholder — enough to compare every piece of content TC_018's Steps call out
 * (Title, Description, Field labels, Placeholder/help text) between languages.
 * Mirrors form-list.spec.ts's createMultiLanguageForm — picks 'en' + the first
 * other seeded locale, since which locale that resolves to varies by DB.
 */
async function createFormWithTwoLanguages(page: Page): Promise<{
  en: { name: string; title: string; description: string; fieldLabel: string; fieldDescription: string; placeholder: string };
  other: { name: string; title: string; description: string; fieldLabel: string; fieldDescription: string; placeholder: string };
}> {
  const allLocales = await getAllLocales(page.request);
  const enLocale = allLocales.find((l) => l.iso_code === 'en');
  const otherLocale = allLocales.find((l) => l.iso_code !== 'en');
  if (!enLocale || !otherLocale) {
    throw new Error('TC_018 needs at least 2 seeded locales');
  }

  const suffix = Date.now();
  const en = {
    name: enLocale.name,
    title: `TC_018 preview form EN ${suffix}`,
    description: 'English form description',
    fieldLabel: 'Full Name',
    fieldDescription: 'Enter your legal name',
    placeholder: 'e.g. John Doe',
  };
  const other = {
    name: otherLocale.name,
    title: `TC_018 preview form ${otherLocale.iso_code.toUpperCase()} ${suffix}`,
    description: `${otherLocale.name} form description`,
    fieldLabel: `Full Name (${otherLocale.iso_code})`,
    fieldDescription: `Enter your legal name (${otherLocale.iso_code})`,
    placeholder: `e.g. John Doe (${otherLocale.iso_code})`,
  };

  const contentFor = (
    localeId: number,
    slug: string,
    def: { title: string; description: string; fieldLabel: string; fieldDescription: string; placeholder: string },
  ) => ({
    title: def.title,
    description: def.description,
    slug,
    locale_id: localeId,
    success_message: 'Submitted.',
    ...DEFAULT_FORM_CONTENT_SETTINGS,
    fields: [
      {
        field_type: 'short_answer',
        label: def.fieldLabel,
        description: def.fieldDescription,
        placeholder: def.placeholder,
        required: false,
      },
    ],
  });

  const createdForm = await createForm(page.request, {
    published: true,
    contents: [
      contentFor(enLocale.id, `e2e-tc018-en-${suffix}`, en),
      contentFor(otherLocale.id, `e2e-tc018-${otherLocale.iso_code}-${suffix}`, other),
    ],
  });

  await page.goto(`/admin/forms/${createdForm.id}`);

  return { en, other };
}

test.describe('preview by language', () => {
  test('TC_018 - preview panel on Form View switches content per selected language', async ({
    page,
  }) => {
    const { en, other } = await createFormWithTwoLanguages(page);

    // Tabs.Panel is keepMounted:true (Mantine default, not overridden here) — the
    // inactive language's panel stays in the DOM as display:none rather than
    // unmounting. getByRole('tabpanel') is accessibility-tree-based and Playwright
    // excludes display:none elements from it, so it resolves to exactly the one
    // currently-visible panel — FormView.jsx renders only one Tabs.Panel per
    // locale (just the preview), unlike the builder's two-panels-per-locale layout.
    const panel = page.getByRole('tabpanel');

    // Tab accessible name is "{name} {name}" (flag <img alt> + <span> both use
    // locale.name) — match by substring, not exact.
    await page.getByRole('tab', { name: en.name }).click();
    await expect(panel).toContainText(en.title);
    await expect(panel).toContainText(en.description);
    await expect(panel.locator('.form-field__label').filter({ hasText: en.fieldLabel })).toBeVisible();
    await expect(panel.locator('.form-field__description')).toHaveText(en.fieldDescription);
    await expect(panel.locator('.form-field__control')).toHaveAttribute('placeholder', en.placeholder);

    await page.getByRole('tab', { name: other.name }).click();
    await expect(panel).toContainText(other.title);
    await expect(panel).toContainText(other.description);
    await expect(panel.locator('.form-field__label').filter({ hasText: other.fieldLabel })).toBeVisible();
    await expect(panel.locator('.form-field__description')).toHaveText(other.fieldDescription);
    await expect(panel.locator('.form-field__control')).toHaveAttribute('placeholder', other.placeholder);

    // Scoped to the now-only-visible panel, so this proves the previous language's
    // content isn't shown anymore — not merely that it's absent from the whole page.
    await expect(panel).not.toContainText(en.title);
    await expect(panel).not.toContainText(en.description);
  });
});

/**
 * Creates a form via API, single language, published with a slug — the precondition
 * FormView.jsx's toolbar needs to render its 4 slug-gated controls (Copy share
 * link, Go to page, View statistics, View submissions) in addition to Edit.
 */
async function createPublishedFormWithSlug(
  page: Page,
): Promise<{ id: number; slug: string; localeIsoCode: string }> {
  const localeIsoCode = 'en';
  const localeId = await getLocaleIdByIsoCode(page.request, localeIsoCode);

  const slug = `e2e-tc019-formview-${Date.now()}`;

  const createdForm = await createForm(page.request, {
    published: true,
    contents: [
      {
        title: 'TC_019 Form View toolbar form',
        slug,
        locale_id: localeId,
        success_message: 'Submitted.',
        ...DEFAULT_FORM_CONTENT_SETTINGS,
        fields: [{ field_type: 'short_answer', label: 'Name', required: false }],
      },
    ],
  });

  return { id: createdForm.id, slug, localeIsoCode };
}

test.describe('form view toolbar', () => {
  test('TC_019 - Form View toolbar buttons perform their real actions', async ({
    page,
    context,
  }) => {
    const { id, slug, localeIsoCode } = await createPublishedFormWithSlug(page);
    await page.goto(`/admin/forms/${id}`);

    // Copy share link — writes the public form URL to the clipboard, no navigation.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain(slug);
    expect(clipboardText).toContain(`/${localeIsoCode}/forms`);

    // Go to page — real <a target="_blank">, not a <button>.
    const [goToPagePopup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: 'Go to page' }).click(),
    ]);
    await goToPagePopup.waitForLoadState();
    expect(goToPagePopup.url()).toContain(slug);
    await goToPagePopup.close();

    // View statistics — also an <a target="_blank">.
    const [statsPopup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: 'View statistics' }).click(),
    ]);
    await statsPopup.waitForLoadState();
    expect(statsPopup.url()).toContain(`${slug}/statistics`);
    await statsPopup.close();

    // View submissions — same-tab <a>, in-app navigation.
    await page.getByRole('link', { name: 'View submissions' }).click();
    await expect(page).toHaveURL(/\/admin\/form-submissions/);

    // Edit — re-open Form View first since the step above navigated away from it.
    await page.goto(`/admin/forms/${id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page).toHaveURL(`/admin/forms/${id}/edit`);
    // Confirms the builder actually rendered (not just that the URL changed) —
    // matches Expected Result's "không lỗi UI hoặc crash" requirement.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  });
});
