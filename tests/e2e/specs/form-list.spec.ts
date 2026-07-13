import { test, expect, type Page } from '@playwright/test';
import {
  createForm,
  createFormWithSubmission,
  DEFAULT_FORM_CONTENT_SETTINGS,
  getAllLocales,
  getLocaleIdByIsoCode,
} from '../helpers/forms.js';

// Domain: admin Form List screen (/admin/forms) — search, sort, row actions, and
// multi-row delete. Matches the source excel's own "Form list" Section/Page
// grouping (TC_014-017). No prior domain file existed for this group — see
// harden-forms-module memory's "Full source excel now available" section.

/**
 * Creates a form via API with a distinctive title and slug (both timestamped so
 * a search for either substring can't accidentally match some other form left
 * over from a previous run or a different test file in the same shared DB).
 * Mirrors form-statistics.spec.ts's createFormWithStatisticsEnabled — built via
 * the CRUD API rather than the admin builder UI, since the field/language
 * builder itself isn't what TC_014 is testing.
 */
async function createSearchableForm(
  page: Page,
  label: string,
): Promise<{ title: string; slug: string }> {
  const localeId = await getLocaleIdByIsoCode(page.request, 'en');

  const suffix = `${Date.now()}-${label}`;
  const title = `TC_014 searchable form ${suffix}`;
  const slug = `e2e-tc014-${suffix}`;

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

  return { title, slug };
}

/**
 * Creates a form via API with an explicit title and slug (unlike
 * createSearchableForm, which derives both from a label). Used by TC_015 to
 * build a small set of forms whose title order and slug order are
 * deliberately uncorrelated, so an assertion that accidentally checks the
 * wrong column's order would still fail.
 */
async function createFormWithTitleAndSlug(
  page: Page,
  title: string,
  slug: string,
  published = true,
): Promise<void> {
  const localeId = await getLocaleIdByIsoCode(page.request, 'en');

  await createForm(page.request, {
    published,
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
}

/**
 * Creates a form via API with two language versions (en + a second seeded
 * locale), each with its own title/slug, so TC_016's "multiple languages"
 * row-action dropdowns can be exercised against two genuinely different
 * per-locale URLs.
 */
async function createMultiLanguageForm(
  page: Page,
  baseTitle: string,
  baseSlug: string,
): Promise<{
  en: { name: string; isoCode: string; title: string; slug: string };
  other: { name: string; isoCode: string; title: string; slug: string };
}> {
  const allLocales = await getAllLocales(page.request);
  const enLocale = allLocales.find((l) => l.iso_code === 'en');
  const otherLocale = allLocales.find((l) => l.iso_code !== 'en');
  if (!enLocale || !otherLocale) {
    throw new Error('TC_016 multi-language case needs at least 2 seeded locales');
  }

  const en = {
    name: enLocale.name,
    isoCode: enLocale.iso_code,
    title: `${baseTitle} EN`,
    slug: `${baseSlug}-en`,
  };
  const other = {
    name: otherLocale.name,
    isoCode: otherLocale.iso_code,
    title: `${baseTitle} ${otherLocale.iso_code.toUpperCase()}`,
    slug: `${baseSlug}-${otherLocale.iso_code}`,
  };

  const contentFor = (localeId: number, def: { title: string; slug: string }) => ({
    title: def.title,
    slug: def.slug,
    locale_id: localeId,
    success_message: 'Submitted.',
    ...DEFAULT_FORM_CONTENT_SETTINGS,
    fields: [{ field_type: 'short_answer', label: 'Name', required: false }],
  });

  await createForm(page.request, {
    published: true,
    contents: [contentFor(enLocale.id, en), contentFor(otherLocale.id, other)],
  });

  return { en, other };
}

test.describe('search', () => {
  test('TC_014 - search filters the list by Title and by Slug, restores full list when cleared', async ({
    page,
  }) => {
    const formA = await createSearchableForm(page, 'a');
    const formB = await createSearchableForm(page, 'b');

    // Warm-up visit: first hit of the admin Form List route in this dev-server
    // session — same Vite first-hit-optimize-and-reload flake as auth.setup.ts /
    // TC_002 / TC_004.
    await page.goto('/admin/forms');
    await page
      .getByRole('heading', { level: 1, name: 'Forms' })
      .waitFor({ state: 'visible', timeout: 30_000 });

    // ListViewSearchBar.jsx's TextInput has no accessible name (icon-only
    // decoration, no aria-label) — targeted by its placeholder instead.
    const searchInput = page.getByPlaceholder('Search...');

    // --- Search by a Title-only substring: only form A matches ---
    await searchInput.fill(formA.title);
    await expect(page.getByRole('cell', { name: formA.title, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: formB.title, exact: true })).toHaveCount(0);

    // --- Search by a Slug-only substring (form B's slug is not a substring of
    // its own title, so this proves the Slug field is actually being matched,
    // not just Title again): only form B matches ---
    await searchInput.fill('');
    await searchInput.fill(formB.slug);
    // FormModel._normalize_slug prefixes the stored slug with "/" server-side
    // (confirmed while investigating TC_012) — the Slug column renders that
    // normalized value, not the bare slug this test sent on create.
    await expect(page.getByRole('cell', { name: `/${formB.slug}`, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: formA.title, exact: true })).toHaveCount(0);

    // --- A keyword matching neither form's Title nor Slug: list shows neither ---
    await searchInput.fill('');
    await searchInput.fill(`nonexistent-tc014-${Date.now()}`);
    await expect(page.getByRole('cell', { name: formA.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole('cell', { name: formB.title, exact: true })).toHaveCount(0);

    // --- Clearing the search restores the full list (both forms visible again) ---
    await searchInput.fill('');
    await expect(page.getByRole('cell', { name: formA.title, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: formB.title, exact: true })).toBeVisible();
  });
});

test.describe('sort', () => {
  test('TC_015 - clicking a column header toggles ascending/descending order, switching columns resets the previous sort', async ({
    page,
  }) => {
    // The fix (renaming FormList.jsx's Title/Slug column `field` from the bare
    // `'contents'`/`'slug'` to the dotted `'contents.title'`/`'contents.slug'`,
    // commit 2e04666) lives on this repo's own source. Without it, clicking
    // Title sends order_by.field='contents' (no dot) — the backend resolves
    // that straight to FormModel.contents, the one2many relationship itself
    // rather than a column, and crashes with `AttributeError: ... has no
    // attribute 'type'` when checking whether to wrap it in func.trim() — a
    // 500 the frontend swallows silently, so the list just doesn't reorder.
    // Slug's bare field ('slug') happens to resolve directly against
    // FormModel's own slug column (a real String column), so it sorts fine —
    // this asymmetry is exactly what the source excel's bug report describes.
    // Exercised unconditionally here since packages/admin builds from this
    // repo's own source (unlike alcoris-site, a consumer pinned to a
    // published @deepsel/admin release).

    const suffix = Date.now();
    // The common prefix "TC_015 sort {suffix}" comes before the varying
    // Alpha/Bravo/Charlie suffix so a substring search on that prefix matches
    // all 3 regardless of which one comes last. Title order and slug order
    // are deliberately uncorrelated — an assertion checking the wrong
    // column's cells would still fail this way.
    const forms = [
      { title: `TC_015 sort ${suffix} Charlie`, slug: `e2e-tc015-alpha-${suffix}` },
      { title: `TC_015 sort ${suffix} Alpha`, slug: `e2e-tc015-charlie-${suffix}` },
      { title: `TC_015 sort ${suffix} Bravo`, slug: `e2e-tc015-bravo-${suffix}` },
    ];
    for (const form of forms) {
      await createFormWithTitleAndSlug(page, form.title, form.slug);
    }

    // Warm-up visit: same first-hit Vite flake as TC_014.
    await page.goto('/admin/forms');
    await page
      .getByRole('heading', { level: 1, name: 'Forms' })
      .waitFor({ state: 'visible', timeout: 30_000 });

    // Deliberately does NOT use the search bar to isolate these 3 rows —
    // combining an active search (ilike on contents.title/contents.slug)
    // with a sort on that same nested relation makes the backend LEFT OUTER
    // JOIN form_content a second time with no alias, crashing Postgres with
    // "table name form_content specified more than once". That's a real bug,
    // but a different one than TC_015 (search-plus-sort together, not sort
    // alone) — flagged in harden-forms-module memory, not fixed here. Instead
    // raise the page size so every row created by this run is on one page,
    // then locate each of our 3 forms by its unique title (stable regardless
    // of which column is currently sorted) and compare their Y positions.
    await page.getByRole('textbox', { name: 'Show max' }).click();
    await page.getByRole('option', { name: '100' }).click();

    const titleHeader = page.getByRole('columnheader', { name: 'Title' });
    const slugHeader = page.getByRole('columnheader', { name: 'Slug' });

    /** Y position of each form's row, located by its (always-visible) title. */
    const getRowYPositions = async (): Promise<number[]> => {
      const positions: number[] = [];
      for (const form of forms) {
        const box = await page.getByRole('cell', { name: form.title, exact: true }).boundingBox();
        if (!box) throw new Error(`Row for "${form.title}" is not visible`);
        positions.push(box.y);
      }
      return positions;
    };
    /** Asserts forms[order[0]] is above forms[order[1]] is above forms[order[2]], top to bottom. */
    const expectVisualOrder = async (order: [number, number, number]) => {
      await expect(async () => {
        const y = await getRowYPositions();
        expect(y[order[0]]).toBeLessThan(y[order[1]]);
        expect(y[order[1]]).toBeLessThan(y[order[2]]);
      }).toPass({ timeout: 10_000 });
    };

    // forms = [Charlie, Alpha, Bravo] (title) / [alpha, charlie, bravo] (slug)
    const TITLE_ASC: [number, number, number] = [1, 2, 0]; // Alpha, Bravo, Charlie
    const TITLE_DESC: [number, number, number] = [0, 2, 1]; // Charlie, Bravo, Alpha
    const SLUG_ASC: [number, number, number] = [0, 2, 1]; // alpha, bravo, charlie
    const SLUG_DESC: [number, number, number] = [1, 2, 0]; // charlie, bravo, alpha

    // --- Click Title header: ascending, then descending ---
    await titleHeader.click();
    await expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');
    await expectVisualOrder(TITLE_ASC);

    await titleHeader.click();
    await expect(titleHeader).toHaveAttribute('aria-sort', 'descending');
    await expectVisualOrder(TITLE_DESC);

    // --- Click Slug header: sort applies to Slug, Title's sort is cleared ---
    await slugHeader.click();
    await expect(slugHeader).toHaveAttribute('aria-sort', 'ascending');
    await expectVisualOrder(SLUG_ASC);
    await expect(titleHeader).not.toHaveAttribute('aria-sort', 'ascending');
    await expect(titleHeader).not.toHaveAttribute('aria-sort', 'descending');

    await slugHeader.click();
    await expect(slugHeader).toHaveAttribute('aria-sort', 'descending');
    await expectVisualOrder(SLUG_DESC);
  });
});

test.describe('row actions', () => {
  // TC_016 covers 3 scenarios per the source excel's own Steps (Trường hợp
  // 1/2/3): a single-language published form (3 direct icon buttons), a
  // multi-language form (each button becomes a per-locale dropdown menu),
  // and an unpublished form ("Not published" text, no buttons at all).
  // "View statistics" only needs to navigate to the right URL here — whether
  // that page's content actually renders (vs. a themed 404) depends on the
  // admin-session cookie-forwarding fix tracked separately in task #11
  // (form-statistics.spec.ts), out of scope for this row-action test.

  test('TC_016 - single-language published form: Go to form, View statistics, and Copy share link all work', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const suffix = Date.now();
    const title = `TC_016 single ${suffix}`;
    const slug = `e2e-tc016-single-${suffix}`;
    await createFormWithTitleAndSlug(page, title, slug);

    // Warm-up visit: same first-hit Vite flake as TC_014/TC_015.
    await page.goto('/admin/forms');
    await page
      .getByRole('heading', { level: 1, name: 'Forms' })
      .waitFor({ state: 'visible', timeout: 30_000 });

    const row = page.getByRole('row').filter({ hasText: title });
    // Row actions live in the DataGrid's "actions" column (`field: "actions"`
    // in FormList.jsx) — scoping to its data-field avoids matching
    // interactive elements from any other column.
    const actionsCell = row.locator('[data-field="actions"]');

    // DOM order (FormList.jsx's single-locale branch): Go to form and View
    // statistics render as <a> (role="link"), Copy share link is the only
    // plain <button> (role="button") of the three — Mantine's Tooltip
    // doesn't set aria-label on any of them, so order/role is the reliable
    // signal, not accessible name.
    const goToFormLink = actionsCell.getByRole('link').nth(0);
    const viewStatisticsLink = actionsCell.getByRole('link').nth(1);
    const copyShareLinkButton = actionsCell.getByRole('button');

    // --- Go to form: opens the public form page in a new tab ---
    const formPopupPromise = context.waitForEvent('page');
    await goToFormLink.click();
    const formPopup = await formPopupPromise;
    await formPopup.waitForLoadState();
    await expect(formPopup).toHaveURL(new RegExp(`/en/forms/${slug}$`));
    await expect(formPopup.getByText('Name')).toBeVisible();
    await formPopup.close();

    // --- View statistics: opens the statistics page in a new tab ---
    const statsPopupPromise = context.waitForEvent('page');
    await viewStatisticsLink.click();
    const statsPopup = await statsPopupPromise;
    await statsPopup.waitForLoadState();
    await expect(statsPopup).toHaveURL(new RegExp(`/en/forms/${slug}/statistics$`));
    await statsPopup.close();

    // --- Copy share link: writes the form's public URL to the clipboard and
    // shows a confirmation notification ---
    await copyShareLinkButton.click();
    // Mantine's Notifications transition group can briefly render the same
    // notification twice (entering/settled) — .first() avoids a strict-mode
    // violation without weakening the assertion.
    await expect(page.getByText('Form link copied successfully').first()).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(new RegExp(`/en/forms/${slug}$`));
  });

  test('TC_016 - multi-language form: each row action becomes a per-locale dropdown menu', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    const suffix = Date.now();
    const { en, other } = await createMultiLanguageForm(
      page,
      `TC_016 multi ${suffix}`,
      `e2e-tc016-multi-${suffix}`,
    );

    // Warm-up visit: same first-hit Vite flake as TC_014/TC_015.
    await page.goto('/admin/forms');
    await page
      .getByRole('heading', { level: 1, name: 'Forms' })
      .waitFor({ state: 'visible', timeout: 30_000 });

    // The Title column falls back to the 'en' content when no locale filter
    // is active (FormList.jsx's locale-resolution helper) — the row is
    // findable by the 'en' content's title regardless of which locale's
    // dropdown item is exercised below.
    const row = page.getByRole('row').filter({ hasText: en.title });
    const actionsCell = row.locator('[data-field="actions"]');

    // Multi-locale branch: all 3 actions become Menu targets (plain
    // <button>, no href — the per-locale hrefs live on the dropdown items
    // instead), in the same Go to form / View statistics / Copy share link
    // DOM order as the single-locale case.
    const menuTargets = actionsCell.getByRole('button');
    const goToFormTarget = menuTargets.nth(0);
    const viewStatisticsTarget = menuTargets.nth(1);
    const copyShareLinkTarget = menuTargets.nth(2);

    // --- Go to form dropdown: picking the non-English locale opens that
    // locale's public form page, proving the dropdown actually switches
    // locale rather than always linking the same page ---
    await goToFormTarget.click();
    const formPopupPromise = context.waitForEvent('page');
    await page.getByRole('menuitem', { name: other.name }).click();
    const formPopup = await formPopupPromise;
    await formPopup.waitForLoadState();
    await expect(formPopup).toHaveURL(new RegExp(`/${other.isoCode}/forms/${other.slug}$`));
    await formPopup.close();

    // --- View statistics dropdown: same per-locale check, URL only ---
    await viewStatisticsTarget.click();
    const statsPopupPromise = context.waitForEvent('page');
    await page.getByRole('menuitem', { name: other.name }).click();
    const statsPopup = await statsPopupPromise;
    await statsPopup.waitForLoadState();
    await expect(statsPopup).toHaveURL(
      new RegExp(`/${other.isoCode}/forms/${other.slug}/statistics$`),
    );
    await statsPopup.close();

    // --- Copy share link dropdown: notification interpolates the chosen
    // locale's name ---
    await copyShareLinkTarget.click();
    await page.getByRole('menuitem', { name: other.name }).click();
    // Same Mantine transition-group duplicate as the single-locale case.
    await expect(page.getByText(`Form link copied for ${other.name}`).first()).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(new RegExp(`/${other.isoCode}/forms/${other.slug}$`));
  });

  test('TC_016 - unpublished form shows "Not published" in the Actions column with no action buttons', async ({
    page,
  }) => {
    const suffix = Date.now();
    const title = `TC_016 draft ${suffix}`;
    const slug = `e2e-tc016-draft-${suffix}`;
    await createFormWithTitleAndSlug(page, title, slug, false);

    // Warm-up visit: same first-hit Vite flake as TC_014/TC_015.
    await page.goto('/admin/forms');
    await page
      .getByRole('heading', { level: 1, name: 'Forms' })
      .waitFor({ state: 'visible', timeout: 30_000 });

    const row = page.getByRole('row').filter({ hasText: title });
    const actionsCell = row.locator('[data-field="actions"]');

    await expect(actionsCell.getByText('Not published')).toBeVisible();
    await expect(actionsCell.getByRole('link')).toHaveCount(0);
    await expect(actionsCell.getByRole('button')).toHaveCount(0);
  });
});

test.describe('multi-select delete', () => {
  test('TC_017 - selecting multiple rows and confirming delete removes all of them, including their submissions (cascade)', async ({
    page,
  }) => {
    const suffix = Date.now();
    const forms: Array<{ formId: number; contentId: number; title: string; slug: string }> = [];
    for (const label of ['a', 'b', 'c']) {
      forms.push(
        await createFormWithSubmission(page, `TC_017 ${suffix} ${label}`, `e2e-tc017-${suffix}-${label}`),
      );
    }

    // Warm-up visit: same first-hit Vite flake as TC_014/TC_015/TC_016.
    await page.goto('/admin/forms');
    await page
      .getByRole('heading', { level: 1, name: 'Forms' })
      .waitFor({ state: 'visible', timeout: 30_000 });
    // Same reasoning as TC_015: raise the page size so all 3 of our rows are
    // guaranteed to be on one page regardless of how many other forms exist.
    await page.getByRole('textbox', { name: 'Show max' }).click();
    await page.getByRole('option', { name: '100' }).click();

    const rows = forms.map((f) => page.getByRole('row').filter({ hasText: f.title }));

    // --- Tick the first row: checkbox is checked and the row itself reports
    // aria-selected — MUI DataGrid's GridRow sets both the "Mui-selected" CSS
    // class and aria-selected from the same `selected` prop
    // (@mui/x-data-grid/.../GridRow.js), so aria-selected is a reliable,
    // non-visual signal for "row is highlighted". Scoped by name because each
    // row also renders a second, unrelated read-only Mantine checkbox (a
    // "Published" status indicator) — an unscoped role locator matches both.
    const rowCheckbox = (row: typeof rows[number]) => row.getByRole('checkbox', { name: 'Select row' });
    await rowCheckbox(rows[0]).check();
    await expect(rowCheckbox(rows[0])).toBeChecked();
    await expect(rows[0]).toHaveAttribute('aria-selected', 'true');

    // --- Tick the other two: all 3 checked, counter + red Delete button appear ---
    await rowCheckbox(rows[1]).check();
    await rowCheckbox(rows[2]).check();
    for (const row of rows) {
      await expect(rowCheckbox(row)).toBeChecked();
      await expect(row).toHaveAttribute('aria-selected', 'true');
    }
    await expect(page.getByText('3 selected')).toBeVisible();
    const deleteButton = page.getByRole('button', { name: 'Delete' });
    await expect(deleteButton).toBeVisible();

    // --- Click Delete: a confirm dialog appears. The toolbar's delete handler
    // calls GET /util/delete_check/form/{ids} first and renders a WARNING box
    // listing every table that will cascade — form_submission is one of them,
    // since form_submission.form_id is a NOT NULL FK straight to form.id
    // (deepsel/apps/cms/models/form_submission.py) ---
    await deleteButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Are you sure you want to delete these records?')).toBeVisible();
    await expect(dialog.getByText(/Deleting from form_submission/)).toBeVisible();

    // --- Click Cancel: dialog closes, nothing is deleted, selection survives ---
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible();
    for (const row of rows) {
      await expect(row).toBeVisible();
      await expect(rowCheckbox(row)).toBeChecked();
    }
    await expect(page.getByText('3 selected')).toBeVisible();
    await expect(deleteButton).toBeVisible();

    // --- Click Delete again, then actually confirm this time ---
    await deleteButton.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();

    // --- All 3 rows disappear with no page.reload() in this test — the app's
    // own confirm callback resets selection and calls get() to refetch the
    // list from the backend (FormList.jsx), not an optimistic local splice —
    // and the selection UI (counter + Delete button) resets along with it ---
    await expect(dialog).not.toBeVisible();
    for (const row of rows) {
      await expect(row).toHaveCount(0);
    }
    await expect(page.getByText('3 selected')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    // --- Backend verification: each form's submissions are actually gone,
    // not just hidden from the list ---
    for (const form of forms) {
      const submissionSearchResponse = await page.request.post('/api/v1/form_submission/search', {
        data: { search: { AND: [{ field: 'form_id', operator: '=', value: form.formId }], OR: [] } },
      });
      expect(submissionSearchResponse.ok()).toBe(true);
      const { data: remainingSubmissions } = await submissionSearchResponse.json();
      expect(remainingSubmissions).toHaveLength(0);
    }
  });
});
