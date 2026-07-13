import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  createForm,
  DEFAULT_FORM_CONTENT_SETTINGS,
  getLocaleByIsoCode,
  getLocaleIdByIsoCode,
  warmUpVisit,
} from '../helpers/forms.js';

// Domain: admin Form Create/Update screen (FormUpsert) — the field builder, its live
// preview panel, and its settings-sidebar tabs. Matches the source excel's own
// "Form Create/Update" Section/Page grouping (TC_001-006, TC_012, TC_013). See
// task #15 (harden-forms-module memory) for full description of each TC and the
// regression each fix locks down.
// TODO(#14): TC_013 (form only visible on website when Published, source excel:
// Passed) not yet stubbed here.

/** One Advanced Settings input to fill, in the order FieldEditor.jsx renders them */
type AdvancedInput =
  | { kind: 'number'; label: string; value: number }
  | { kind: 'text'; label: string; value: string }
  | { kind: 'select'; label: string; value: string };

/** Native control selectors for which FormFieldTypeRenderer.tsx actually forwards `placeholder` */
const PLACEHOLDER_RENDERING_CONTROLS = [
  'input[type="text"]',
  'textarea',
  'input[type="number"]',
];

/**
 * One entry per field type offered by the "Add Field" menu (AddFieldButton.jsx),
 * which mirrors FormFieldTypeEnum (backend/apps/cms/types/form.py — 10 types).
 * `controlSelector` targets the native control FormFieldTypeRenderer.tsx renders for
 * that type; `controlCount` is only set for multi-control types (radio/checkbox groups).
 *
 * Every other input FieldEditor.jsx exposes (description, placeholder, required,
 * options, Advanced Settings) is filled too — not just the label — both because a
 * real form builder would set these, and because a sparsely-configured field is a
 * weaker stress test of the preview layout than a fully-configured one (TC_001's
 * bug report is specifically about the preview/Form View layout breaking down).
 */
const FIELD_TYPES: Array<{
  menuLabel: string;
  fieldLabel: string;
  description: string;
  placeholder: string;
  required: boolean;
  options?: string[];
  advancedInputs?: AdvancedInput[];
  validationMessage: string;
  controlSelector: string;
  controlCount?: number;
}> = [
  {
    menuLabel: 'Short Answer',
    fieldLabel: 'Your name',
    description: 'Enter your full legal name as it appears on official documents.',
    placeholder: 'e.g. John Doe',
    required: true,
    advancedInputs: [
      { kind: 'number', label: 'Minimum Length', value: 2 },
      { kind: 'number', label: 'Maximum Length', value: 100 },
    ],
    validationMessage: 'Name must be between 2 and 100 characters.',
    controlSelector: 'input[type="text"].form-field__control',
  },
  {
    menuLabel: 'Paragraph',
    fieldLabel: 'Tell us more',
    description: 'Share any additional context we should know about.',
    placeholder: 'Type your message here',
    required: false,
    advancedInputs: [
      { kind: 'number', label: 'Minimum Length', value: 0 },
      { kind: 'number', label: 'Maximum Length', value: 500 },
    ],
    validationMessage: 'Message must be under 500 characters.',
    controlSelector: 'textarea.form-field__control',
  },
  {
    menuLabel: 'Number',
    fieldLabel: 'Your age',
    description: 'Applicants must be 18 or older.',
    placeholder: 'e.g. 25',
    required: true,
    advancedInputs: [
      { kind: 'number', label: 'Minimum Value', value: 18 },
      { kind: 'number', label: 'Maximum Value', value: 120 },
    ],
    validationMessage: 'Age must be between 18 and 120.',
    controlSelector: 'input[type="number"].form-field__control',
  },
  {
    menuLabel: 'Multiple Choice',
    fieldLabel: 'Preferred contact method',
    description: 'Choose the single best way to reach you.',
    placeholder: 'Select a contact method',
    required: true,
    options: ['Email', 'Phone'],
    validationMessage: 'Please choose a contact method.',
    controlSelector: 'input[type="radio"].form-field__option-control',
    controlCount: 2,
  },
  {
    menuLabel: 'Checkboxes',
    fieldLabel: 'Interests',
    description: 'Select all leisure activities that apply to you.',
    placeholder: 'Select one or more',
    required: true,
    options: ['Sports', 'Music'],
    advancedInputs: [
      { kind: 'number', label: 'Minimum Selections', value: 1 },
      { kind: 'number', label: 'Maximum Selections', value: 2 },
    ],
    validationMessage: 'Select between 1 and 2 interests.',
    controlSelector: 'input[type="checkbox"].form-field__option-control',
    controlCount: 2,
  },
  {
    menuLabel: 'Dropdown',
    fieldLabel: 'Country',
    description: 'Pick the country you currently reside in.',
    placeholder: 'Select a country',
    required: true,
    options: ['Vietnam', 'Switzerland'],
    validationMessage: 'Please select a country.',
    controlSelector: 'select.form-field__control',
  },
  {
    menuLabel: 'Date',
    fieldLabel: 'Birth date',
    description: 'Enter your date of birth.',
    placeholder: 'Pick a date',
    required: true,
    advancedInputs: [
      { kind: 'text', label: 'Minimum Date/Time', value: '1900-01-01' },
      { kind: 'text', label: 'Maximum Date/Time', value: '2026-12-31' },
    ],
    validationMessage: 'Please enter a valid birth date.',
    controlSelector: 'input[type="date"].form-field__control',
  },
  {
    menuLabel: 'Date & Time',
    fieldLabel: 'Appointment slot',
    description: 'Pick a slot for your appointment.',
    placeholder: 'Pick a date and time',
    required: true,
    advancedInputs: [
      { kind: 'text', label: 'Minimum Date/Time', value: '2026-01-01T09:00' },
      { kind: 'text', label: 'Maximum Date/Time', value: '2026-12-31T17:00' },
      { kind: 'number', label: 'Step (minutes)', value: 15 },
      { kind: 'select', label: 'Time Format', value: '24-hour' },
    ],
    validationMessage: 'Please choose an appointment slot.',
    controlSelector: 'input[type="datetime-local"].form-field__control',
  },
  {
    menuLabel: 'Time',
    fieldLabel: 'Preferred call time',
    description: 'When should we call you?',
    placeholder: 'Pick a time',
    required: false,
    advancedInputs: [
      { kind: 'number', label: 'Step (minutes)', value: 15 },
      { kind: 'select', label: 'Time Format', value: '12-hour (AM/PM)' },
    ],
    validationMessage: 'Please pick a preferred time.',
    controlSelector: 'input[type="time"].form-field__control',
  },
  {
    menuLabel: 'Files',
    fieldLabel: 'Attachments',
    description: 'Upload any supporting documents (optional).',
    placeholder: 'Attach files here',
    required: false,
    // Kept well under the E2E instance's configured upload_size_limit (default
    // DEFAULT_UPLOAD_SIZE_LIMIT_MB=5) — the Max File Size NumberInput clamps to it.
    advancedInputs: [
      { kind: 'number', label: 'Maximum Files', value: 2 },
      { kind: 'number', label: 'Max File Size (MB)', value: 1 },
      { kind: 'select', label: 'Allowed File Types', value: 'PDF Documents' },
    ],
    validationMessage: 'Only PDF files are accepted.',
    controlSelector: '.form-field__dropzone',
  },
];

/**
 * Opens a Mantine Select and picks the option by its visible label. Mantine's
 * Select renders its trigger as a readOnly native <input> (implicit role
 * "textbox") whose portaled dropdown <div role="listbox"> shares the same
 * aria-labelledby — so plain getByLabel(label) matches both and can resolve to
 * the (initially hidden) listbox instead of the clickable input. Filtering by
 * role='textbox' excludes the listbox.
 */
async function selectMantineOption(page: Page, label: string, optionLabel: string) {
  await page.getByRole('textbox', { name: label }).last().click();
  await page.getByRole('option', { name: optionLabel, exact: true }).click();
}

/**
 * Adds one field via the "Add Field" menu and fills in every input FieldEditor.jsx
 * exposes for it, in the order they appear on screen: label, description,
 * placeholder, required toggle, options (choice types only), then Advanced Settings
 * (type-specific min/max/step/format fields + the universal validation message). The
 * newly added FieldEditor is always the last one in the DOM, since FormFieldsBuilder
 * appends to the end of the fields array — every locator below is scoped with
 * `.last()` for that reason.
 */
async function addField(
  page: Page,
  {
    menuLabel,
    fieldLabel,
    description,
    placeholder,
    required,
    options,
    advancedInputs,
    validationMessage,
  }: {
    menuLabel: string;
    fieldLabel: string;
    description: string;
    placeholder: string;
    required: boolean;
    options?: string[];
    advancedInputs?: AdvancedInput[];
    validationMessage: string;
  },
) {
  await page.getByRole('button', { name: 'Add Field' }).click();
  // Menu.Item's accessible name concatenates its label + description Text children,
  // so an exact-text filter on the bold label is the only unambiguous way to
  // distinguish e.g. "Date" from "Date & Time".
  await page
    .getByRole('menuitem')
    .filter({ has: page.getByText(menuLabel, { exact: true }) })
    .click();

  await page.getByLabel('Field Label').last().fill(fieldLabel);
  await page.getByLabel('Field Description').last().fill(description);
  await page.getByLabel('Placeholder Text').last().fill(placeholder);

  if (required) {
    await page.getByLabel('Required Field').last().click();
  }

  for (const optionLabel of options ?? []) {
    await page.getByPlaceholder('Add new option').last().fill(optionLabel);
    await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  }

  await page.getByRole('button', { name: 'Advanced Settings' }).last().click();
  for (const input of advancedInputs ?? []) {
    if (input.kind === 'select') {
      await selectMantineOption(page, input.label, input.value);
    } else {
      await page.getByLabel(input.label).last().fill(String(input.value));
    }
  }
  await page.getByLabel('Validation Message').last().fill(validationMessage);
}

/**
 * Asserts a field renders inside the given preview scope with the right label,
 * description, required marker, and native control(s). Scoped by `.form-field` +
 * label text rather than getByRole(..., {name}) because FormFieldTypeRenderer.tsx's
 * <label> is a plain sibling of the control (no htmlFor/id), so the label isn't
 * programmatically associated with it — getByLabel/accessible-name lookups can't
 * find these controls.
 */
async function expectFieldRendersCorrectly(
  scope: Locator,
  {
    fieldLabel,
    description,
    placeholder,
    required,
    controlSelector,
    controlCount,
  }: {
    fieldLabel: string;
    description: string;
    placeholder: string;
    required: boolean;
    controlSelector: string;
    controlCount?: number;
  },
) {
  const fieldContainer = scope.locator('.form-field').filter({ hasText: fieldLabel });
  await expect(fieldContainer).toBeVisible();
  await expect(fieldContainer.locator('.form-field__description')).toHaveText(description);
  await expect(fieldContainer.locator('.form-field__required')).toHaveCount(required ? 1 : 0);

  const control = fieldContainer.locator(controlSelector);
  await expect(control).toHaveCount(controlCount ?? 1);
  if (PLACEHOLDER_RENDERING_CONTROLS.some((selector) => controlSelector.startsWith(selector))) {
    await expect(control).toHaveAttribute('placeholder', placeholder);
  }
}

/**
 * Asserts computed style (padding/margin/color/border/etc.) for a representative
 * handful of form-renderer elements against a hardcoded baseline captured from the
 * current live render (2026-07-09) of `packages/cms-react/src/styles/form.css`.
 * `expectFieldRendersCorrectly` above only checks *structure* (right control kind,
 * right text) — it would still pass even if spacing/colors were visually broken.
 * This is a deliberate style-drift lock, not a full pixel/screenshot diff: it
 * covers one instance of each element kind (label, description, required marker,
 * a text-like control, a choice control, the file dropzone, the submit button),
 * not every field. `.first()` is enough since the CSS rules are the same class
 * applied uniformly across all fields of that kind.
 *
 * Update these values deliberately whenever form.css changes on purpose — an
 * unexpected failure here means a real, unintended visual regression.
 */
async function expectFormRendererStyleBaseline(scope: Locator) {
  const label = scope.locator('.form-field__label').first();
  await expect(label).toHaveCSS('color', 'rgb(28, 20, 16)');
  await expect(label).toHaveCSS('font-weight', '500');

  const description = scope.locator('.form-field__description').first();
  await expect(description).toHaveCSS('color', 'rgb(107, 101, 96)');
  await expect(description).toHaveCSS('font-size', '12px');

  const required = scope.locator('.form-field__required').first();
  await expect(required).toHaveCSS('color', 'rgb(239, 68, 68)');
  await expect(required).toHaveCSS('margin-left', '2px');

  const textControl = scope.locator('.form-field__control').first();
  await expect(textControl).toHaveCSS('padding', '8px 12px');
  await expect(textControl).toHaveCSS('border', '1px solid rgb(200, 192, 184)');
  await expect(textControl).toHaveCSS('font-size', '14px');
  await expect(textControl).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  const choiceControl = scope.locator('.form-field__option-control').first();
  await expect(choiceControl).toHaveCSS('width', '16px');
  await expect(choiceControl).toHaveCSS('height', '16px');

  const dropzone = scope.locator('.form-field__dropzone').first();
  await expect(dropzone).toHaveCSS('padding', '16px');
  await expect(dropzone).toHaveCSS('border', '2px dashed rgb(200, 192, 184)');
  await expect(dropzone).toHaveCSS('border-radius', '8px');

  const submitButton = scope.locator('.form-renderer__submit-button').first();
  await expect(submitButton).toHaveCSS('padding', '8px 20px');
  await expect(submitButton).toHaveCSS('background-color', 'rgb(45, 32, 16)');
  await expect(submitButton).toHaveCSS('color', 'rgb(255, 255, 255)');
}

/**
 * Adds a field via the "Add Field" menu, filling only its label — skips
 * description/placeholder/required/Advanced Settings entirely (unlike `addField`
 * above). TC_003 tests field-block structure (reorder/duplicate/delete), not
 * field content, and a fully-configured block (Advanced Settings expanded) is
 * tall enough that 3 of them overflow the viewport, which breaks the raw
 * mouse-event drag sequence in `dragFieldToEnd` below (the source handle's
 * measured position can end up outside the visible viewport). Keeping blocks
 * collapsed keeps the whole list on-screen at once.
 */
async function addSimpleField(page: Page, menuLabel: string, fieldLabel: string) {
  await page.getByRole('button', { name: 'Add Field' }).click();
  await page
    .getByRole('menuitem')
    .filter({ has: page.getByText(menuLabel, { exact: true }) })
    .click();
  await page.getByLabel('Field Label').last().fill(fieldLabel);
}

/**
 * Drags the field block at `fromIndex` to the very end of the fields list.
 * FormFieldsBuilder/index.jsx uses `@hello-pangea/dnd` (a react-beautiful-dnd
 * fork) for reordering, not native HTML5 drag-and-drop or @dnd-kit — its mouse
 * sensor only starts treating pointer movement as a drag once it clears a 5px
 * "sloppy click" threshold, and only recalculates the drop-target index on
 * discrete `mousemove` events. A single instantaneous jump (what `locator.dragTo()`
 * does by default) can be missed entirely, so this issues the down/move/move/up
 * sequence manually with multiple steps per move instead.
 *
 * (The library's keyboard-driven alternative — focus the handle, Space to lift,
 * ArrowDown/Up to move, Space to drop — was tried first, since it would have
 * sidestepped all the viewport-fit concerns below. It didn't engage: real,
 * correctly-targeted Space keydown events on the focused handle reached the
 * page but never triggered the library's window-level capture listener
 * (`event.defaultPrevented` stayed `false`, confirmed by instrumenting a debug
 * listener), for reasons not tracked down. Not investigated further given the
 * mouse approach works once the viewport is tall enough — see the call site's
 * `page.setViewportSize()`.)
 *
 * Each field block is the `<div>` @hello-pangea/dnd's `Draggable` wraps, carrying
 * `data-rfd-draggable-id` (stable per field for its whole life in the builder,
 * set from the field's client-generated id). Its drag handle button (FieldEditor.jsx,
 * the grip icon) carries `data-rfd-drag-handle-draggable-id` — neither has an
 * aria-label, so attribute selectors are the only reliable way to target them.
 * Requires the whole fields list to already fit in one viewport (see
 * `addSimpleField` and the call site) — this reads/moves through fixed
 * coordinates once, with no mid-drag scrolling.
 */
async function dragFieldToEnd(page: Page, fromIndex: number) {
  const handles = page.locator('[data-rfd-drag-handle-draggable-id]');
  const blocks = page.locator('[data-rfd-draggable-id]');

  // The whole fields list must fit in a single viewport — see the call site's
  // page.setViewportSize() for why raw mouse coordinates otherwise break here.
  const sourceBox = await handles.nth(fromIndex).boundingBox();
  const lastBlockBox = await blocks.last().boundingBox();
  if (!sourceBox || !lastBlockBox) {
    throw new Error('Could not measure drag handle or field block position.');
  }

  const sourceX = sourceBox.x + sourceBox.width / 2;
  const sourceY = sourceBox.y + sourceBox.height / 2;

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  // Small pause before the first move: @hello-pangea/dnd's mouse sensor only
  // arms itself on the next event loop tick after mousedown — moving
  // immediately can race that and have the initial move ignored.
  await page.waitForTimeout(100);
  // Clear the sloppyClickThreshold so the library commits to a drag instead of a click.
  // More steps than the bare minimum needed to clear the threshold — gives the
  // library's discrete-mousemove collision detection more events to react to.
  await page.mouse.move(sourceX, sourceY + 10, { steps: 15 });
  await page.waitForTimeout(100);
  // Step down past every other field, landing in the last block's lower half so
  // the library's collision detection places the dragged field after it.
  await page.mouse.move(sourceX, lastBlockBox.y + lastBlockBox.height - 5, { steps: 20 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

/**
 * Hovers the given language tab to reveal its hover-triggered Menu (FormUpsert.jsx),
 * clicks "Remove", and returns the resulting confirm-delete dialog
 * (`modals.openConfirmModal`, title "Delete content") without acting on it — the
 * caller clicks its Cancel or Delete button. Every language deletion goes through
 * this same dialog, regardless of how many languages remain.
 */
async function openDeleteLanguageDialog(page: Page, localeName: string) {
  await page.getByRole('tab', { name: localeName }).hover();
  await page.getByRole('menuitem', { name: 'Remove' }).click();
  return page.getByRole('dialog', { name: 'Delete content' });
}

test.describe('field creation', () => {
  test(
    'TC_001 - form builder allows adding all field types with a working live preview',
    async ({ page }) => {
      // Adds + fully configures 10 field types (~15 interactions each). Under normal
      // headless runs this finishes in ~8s, well inside the default 60s test timeout —
      // but PWSLOWMO (test:headed) adds a fixed delay per action, which multiplied by
      // ~150 actions can exceed 60s and get the browser torn down mid-test. Triple the
      // timeout so headed/slowMo debugging runs don't fail on timing alone.
      test.slow();

      // Warm up /admin/forms/create once, discarding the result, before this file's
      // first real visit to it. Same rationale as warmUpVisit's own doc comment: a
      // route not yet touched this dev-server session can make Vite discover new
      // deps and issue a full-page reload mid-navigation. Vite's dependency cache is
      // shared server-side across all pages for the life of the dev server, so
      // paying this cost once here (instead of on whichever of TC_001/003/004/005/006
      // happens to hit the route first) keeps the real click-through navigations
      // below — and every other test in this file — from racing that reload.
      await warmUpVisit(page, '/admin/forms/create');

      // Bug tracker (Notion) lists this Low-severity bug as still open: "the live
      // Preview panel (and the separate Form View screen) render a broken layout
      // compared to the real website render". Moved here from form-preview.spec.ts
      // (2026-07-09) — this TC's whole flow (title, +Add Field x10, Save) runs on the
      // admin/forms/create screen, i.e. this domain, not a separate preview route.
      //
      // NOT reproduced (2026-07-09): run live against the real stack while writing
      // this test — all 10 field types render correctly (right label, right native
      // control) in both the preview panel and the Form View screen, and a full-page
      // screenshot of each showed no visible layout breakage, matching the public
      // website's render. Either the bug was fixed since being logged, or it needs a
      // narrower repro (different viewport/browser/field combination) this test
      // doesn't hit — flagged for the user to confirm before closing the tracker
      // entry. Kept as a real (non-fixme) test since it demonstrably passes; this
      // also means it now acts as a regression lock on the "renders correctly" case.
      //
      // Both the preview panel (FormFieldsPreview) and the Form View screen (FormView)
      // render fields via the exact same FormRenderer/FormFieldTypeRenderer the public
      // website theme uses (themes/*/components/Form.tsx) — so asserting each field's
      // label + native control is present in both places is an equivalent, DOM-level
      // check for "renders the same as the website" without needing a pixel diff.

      const formTitle = `E2E all-field-types form ${Date.now()}`;

      // Arrive via the Form List's "Create Form" link (like a real user) rather than
      // page.goto('/admin/forms/create') directly — this gives the browser a real
      // history entry to land on. Save's handleSubmit() falls back to navigate(-1)
      // when there's no ?redirect= param; without a real prior entry it goes to this
      // test's initial about:blank and races with our own post-save navigation.
      await page.goto('/admin/forms');
      await page.getByRole('link', { name: 'Create Form' }).click();
      await page.waitForURL('**/admin/forms/create');

      // Slug auto-generates from the title via a debounced (1s) call to
      // form_content/generate-slug — the SettingDrawer is `keepMounted`, so this
      // fires in the background without needing to open it, as soon as the title is
      // set. Required by validateFormContent() before Save will submit. Must start
      // listening before the title fill triggers it — adding 10 fields takes far
      // longer than the 1s debounce, so this resolves well before Save is clicked.
      const generateSlugResponsePromise = page.waitForResponse(
        (res) => new URL(res.url()).pathname === '/api/v1/form_content/generate-slug',
      );
      await page.getByLabel('Form title').fill(formTitle);

      for (const fieldType of FIELD_TYPES) {
        await addField(page, fieldType);
      }

      // --- Live preview panel (right-hand side of the create screen) ---
      const preview = page.locator('.form-renderer');
      for (const fieldType of FIELD_TYPES) {
        await expectFieldRendersCorrectly(preview, fieldType);
      }
      await expectFormRendererStyleBaseline(preview);

      await generateSlugResponsePromise;

      // Exact pathname match (not a substring check) so this doesn't also match the
      // /api/v1/form_content/generate-slug POST awaited above.
      const createFormResponsePromise = page.waitForResponse(
        (res) => new URL(res.url()).pathname === '/api/v1/form' && res.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const createdForm = await (await createFormResponsePromise).json();

      // Let the app's own post-save navigate(-1) land back on the Form List first, so
      // our own navigation below doesn't race with it (see comment above). This is a
      // client-side history change (no network "load" event), and by the time we get
      // here it has likely already happened — expect().toHaveURL() polls current
      // state instead of waiting for a future navigation event, so it passes either way.
      await expect(page).toHaveURL(/\/admin\/forms(\?.*)?$/);

      // --- Form View screen (admin/forms/:id) — the second broken-layout location ---
      await page.goto(`/admin/forms/${createdForm.id}`);
      const formViewPreview = page.locator('.form-renderer');
      for (const fieldType of FIELD_TYPES) {
        await expectFieldRendersCorrectly(formViewPreview, fieldType);
      }
      await expectFormRendererStyleBaseline(formViewPreview);
    },
  );
});

test.describe('field structure management', () => {
  test('TC_003 - drag-to-reorder, duplicate, and delete fields update the live preview and persist on save', async ({
    page,
  }) => {
    // Tall enough that all 3 collapsed field blocks (addSimpleField skips
    // Advanced Settings, but even collapsed each block is ~350-450px with the
    // header/title fields above it) fit in one viewport — dragFieldToEnd below
    // reads fixed mouse coordinates once and does not scroll mid-drag.
    await page.setViewportSize({ width: 1280, height: 2400 });

    // Arrive via Form List's "Create Form" link — same reasoning as TC_001: Save's
    // handleSubmit() falls back to navigate(-1), which needs a real prior history
    // entry to land on instead of racing this test's own post-save navigation.
    const formTitle = `E2E field structure form ${Date.now()}`;
    await page.goto('/admin/forms');
    await page.getByRole('link', { name: 'Create Form' }).click();
    await page.waitForURL('**/admin/forms/create');

    const generateSlugResponsePromise = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/v1/form_content/generate-slug',
    );
    await page.getByLabel('Form title').fill(formTitle);

    await addSimpleField(page, 'Short Answer', 'First field');
    await addSimpleField(page, 'Paragraph', 'Second field');
    await addSimpleField(page, 'Number', 'Third field');

    const fieldBlocks = page.locator('[data-rfd-draggable-id]');
    const previewLabels = page.locator('.form-renderer .form-field__label');
    await expect(fieldBlocks).toHaveCount(3);
    await expect(previewLabels).toHaveCount(3);

    // --- Drag & drop: move "First field" (index 0) past every other field,
    // landing last. Expected new order: Second, Third, First. ---
    // The raw mouse-event drag (dragFieldToEnd) can occasionally fail to engage
    // the library's drag sensor at all (see its own comment on the "missed
    // entirely" failure mode) — when that happens the list stays in its
    // original order, so retrying the whole drag from index 0 is safe and
    // converges instead of compounding a wrong reorder.
    await expect(async () => {
      await dragFieldToEnd(page, 0);
      await expect(fieldBlocks.nth(0).getByLabel('Field Label')).toHaveValue('Second field', {
        timeout: 1_000,
      });
      await expect(fieldBlocks.nth(1).getByLabel('Field Label')).toHaveValue('Third field', {
        timeout: 1_000,
      });
      await expect(fieldBlocks.nth(2).getByLabel('Field Label')).toHaveValue('First field', {
        timeout: 1_000,
      });
    }).toPass({ timeout: 20_000 });

    await expect(previewLabels.nth(0)).toHaveText('Second field');
    await expect(previewLabels.nth(1)).toHaveText('Third field');
    await expect(previewLabels.nth(2)).toHaveText('First field');

    // --- Duplicate: FormFieldsBuilder's duplicateField (index.jsx) always appends
    // the copy to the end of the array (sort_order: fields.length), never right
    // after the original, and names it "<label> (Copy)". Duplicating the field
    // currently at index 0 ("Second field").
    await fieldBlocks.first().getByRole('button', { name: 'Duplicate Field' }).click();

    await expect(fieldBlocks).toHaveCount(4);
    await expect(fieldBlocks.nth(3).getByLabel('Field Label')).toHaveValue('Second field (Copy)');
    await expect(previewLabels).toHaveCount(4);
    await expect(previewLabels.nth(3)).toHaveText('Second field (Copy)');

    // --- Delete: remove "Third field", now at index 1 (order is Second, Third,
    // First, Second (Copy)). ---
    await fieldBlocks.nth(1).getByRole('button', { name: 'Delete Field' }).click();

    await expect(fieldBlocks).toHaveCount(3);
    await expect(fieldBlocks.nth(0).getByLabel('Field Label')).toHaveValue('Second field');
    await expect(fieldBlocks.nth(1).getByLabel('Field Label')).toHaveValue('First field');
    await expect(fieldBlocks.nth(2).getByLabel('Field Label')).toHaveValue('Second field (Copy)');
    await expect(previewLabels).toHaveCount(3);
    await expect(previewLabels.nth(0)).toHaveText('Second field');
    await expect(previewLabels.nth(1)).toHaveText('First field');
    await expect(previewLabels.nth(2)).toHaveText('Second field (Copy)');

    // --- Save persists the new structure without error. ---
    await generateSlugResponsePromise;
    const createFormResponsePromise = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/v1/form' && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saveResponse = await createFormResponsePromise;
    expect(saveResponse.ok()).toBe(true);
    const createdForm = await saveResponse.json();

    await expect(page).toHaveURL(/\/admin\/forms(\?.*)?$/);

    // Re-open the saved form and confirm the reordered/duplicated/deleted structure
    // actually persisted, not just the in-memory builder state.
    await page.goto(`/admin/forms/${createdForm.id}`);
    const savedLabels = page.locator('.form-renderer .form-field__label');
    await expect(savedLabels).toHaveCount(3);
    await expect(savedLabels.nth(0)).toHaveText('Second field');
    await expect(savedLabels.nth(1)).toHaveText('First field');
    await expect(savedLabels.nth(2)).toHaveText('Second field (Copy)');
  });
});

test.describe('language management', () => {
  test('TC_004 - a newly added language version renders its own translated content, not the default language\'s', async ({
    page,
  }) => {
    const german = await getLocaleByIsoCode(page.request, 'de');

    // Fresh E2E DB has no organization-level default language configured, so
    // `set_default_locale_if_empty` (deepsel/apps/cms/__init__.py) falls back to
    // en_US — the tab FormUpsert auto-creates on mount is always this locale, so
    // German (not English) is the one being freshly added here.
    const englishTitle = `E2E language form EN ${Date.now()}`;
    const germanTitle = `E2E Sprachformular DE ${Date.now()}`;
    const englishFieldLabel = 'Your name';
    const germanFieldLabel = 'Ihr Name';

    // Arrive via Form List's "Create Form" link — same reasoning as TC_001/TC_003:
    // Save's handleSubmit() falls back to navigate(-1), which needs a real prior
    // history entry to land on instead of racing this test's own post-save navigation.
    await page.goto('/admin/forms');
    await page.getByRole('link', { name: 'Create Form' }).click();
    await page.waitForURL('**/admin/forms/create');

    // --- Default (English) language content ---
    let generateSlugResponsePromise = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/v1/form_content/generate-slug',
    );
    await page.getByLabel('Form title').fill(englishTitle);
    await addSimpleField(page, 'Short Answer', englishFieldLabel);
    const englishSlug = (await (await generateSlugResponsePromise).json()).slug;

    // --- Add the German language version ---
    // LanguageSelectorModal's "Add Language" button confirms the selection; picking
    // an option in the RecordSelect combobox above it only stages it in local state.
    // The tooltip-wrapped "+" tab-list button that opens this modal has no
    // accessible name of its own (Mantine's Tooltip doesn't clone aria-label onto
    // its child, and the FontAwesome icon is aria-hidden) — targeted structurally
    // instead, as the one plain <button> (no role="tab") inside the tablist.
    await expect(page.getByRole('tab', { name: german.name })).toHaveCount(0);
    await page.locator('[role="tablist"] button:not([role="tab"])').click();
    const languageModal = page.getByRole('dialog', { name: 'Add New Language' });
    await languageModal.getByLabel('Language').click();
    await page.getByRole('option', { name: german.name }).click();
    await languageModal.getByRole('button', { name: 'Add Language', exact: true }).click();

    // The new tab is auto-selected on add (FormUpsert's handleAddNewFormContent
    // calls setSelectedLocaledId), and — since Mantine Tabs defaults to
    // keepMounted — the English language's panels stay in the DOM too, just
    // display:none'd. getByRole is accessibility-tree-based and auto-excludes
    // display:none elements (confirmed via the tab assertions above/below working
    // unscoped), but getByLabel/CSS-class locators are not, so every such locator
    // from here on is scoped with .last() — the German panel is appended after
    // English in the same Object.keys(formContentsMap) iteration FormUpsert.jsx
    // renders both the builder and preview columns from, so it's always the last
    // DOM match, exactly like the existing addField/addSimpleField "newest field
    // is last" convention above.
    await expect(page.getByRole('tab', { name: german.name })).toBeVisible();

    // --- German language content ---
    generateSlugResponsePromise = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/v1/form_content/generate-slug',
    );
    await page.getByLabel('Form title').last().fill(germanTitle);
    await addSimpleField(page, 'Short Answer', germanFieldLabel);
    const germanSlug = (await (await generateSlugResponsePromise).json()).slug;

    // --- Preview panel reflects the German content in real time, without
    // clobbering the English content underneath it ---
    // FormUpsert.jsx renders the preview title as a plain sibling Box above
    // FormFieldsPreview inside their shared Tabs.Panel (line ~553-565) — it's not
    // inside .form-renderer itself, so this is scoped one level up via the active
    // tabpanel instead. There are 2 visible tabpanels once German is active
    // (the builder panel and this preview panel, in that DOM order, since each is
    // rendered by a separate Object.keys(formContentsMap) loop under the same
    // Tabs) — .last() picks the preview one, same "newest/current is last"
    // reasoning as the rest of this test.
    const germanPreview = page.getByRole('tabpanel').last();
    await expect(germanPreview).toContainText(germanTitle);
    await expect(
      germanPreview.locator('.form-field').filter({ hasText: germanFieldLabel }),
    ).toBeVisible();

    // --- Save persists both language versions ---
    const createFormResponsePromise = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/v1/form' && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saveResponse = await createFormResponsePromise;
    expect(saveResponse.ok()).toBe(true);

    await expect(page).toHaveURL(/\/admin\/forms(\?.*)?$/);

    // --- Public site: each language's public URL renders its own translated
    // content, not the other language's ---

    // Warm-up visit: same reasoning as TC_002 — this may be the first time this
    // dev-server session serves the public form route, and Vite's mid-navigation
    // HMR reload (triggered by first-hit dependency discovery) can wipe an
    // in-progress interaction on the real run below. Result discarded.
    await warmUpVisit(page, `/en/forms/${englishSlug}`);

    await page.goto(`/en/forms/${englishSlug}`);
    await expect(page.getByRole('heading', { level: 1, name: englishTitle })).toBeVisible();
    await expect(page.locator('.form-field').filter({ hasText: englishFieldLabel })).toBeVisible();
    await expect(page.locator('.form-field').filter({ hasText: germanFieldLabel })).toHaveCount(0);

    await page.goto(`/de/forms/${germanSlug}`);
    await expect(page.getByRole('heading', { level: 1, name: germanTitle })).toBeVisible();
    await expect(page.locator('.form-field').filter({ hasText: germanFieldLabel })).toBeVisible();
    await expect(page.locator('.form-field').filter({ hasText: englishFieldLabel })).toHaveCount(0);
  });

  test('TC_005 - confirm dialog appears before deleting a form-content language, and only Confirm removes it', async ({
    page,
  }) => {
    // The fix (modals.openConfirmModal in FormUpsert.jsx, task #8) lives on this
    // repo's own feature/harden-forms-module branch. Unlike alcoris-site (a
    // consumer pinned to a published @deepsel/admin release), deepsel's e2e
    // builds packages/admin straight from this checkout's source (see
    // build:admin in the root package.json), so the fix is exercised
    // unconditionally here — no local-packages-style linking flag needed.

    const german = await getLocaleByIsoCode(page.request, 'de');

    const englishTitle = `E2E delete-language form ${Date.now()}`;

    await page.goto('/admin/forms');
    await page.getByRole('link', { name: 'Create Form' }).click();
    await page.waitForURL('**/admin/forms/create');

    await page.getByLabel('Form title').fill(englishTitle);
    await addSimpleField(page, 'Short Answer', 'Your name');

    // Add a second language (German — same flow as TC_004) so there's a non-last
    // tab to delete here without also exercising the "deleted the very last
    // language" auto-recovery path, which the next test covers on its own.
    await page.locator('[role="tablist"] button:not([role="tab"])').click();
    const languageModal = page.getByRole('dialog', { name: 'Add New Language' });
    await languageModal.getByLabel('Language').click();
    await page.getByRole('option', { name: german.name }).click();
    await languageModal.getByRole('button', { name: 'Add Language', exact: true }).click();
    await expect(page.getByRole('tab', { name: german.name })).toBeVisible();

    // --- Cancel: dialog appears, but declining leaves the tab untouched ---
    let deleteDialog = await openDeleteLanguageDialog(page, german.name);
    await expect(deleteDialog).toContainText('Are you sure you want to delete this content?');
    await deleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(page.getByRole('tab', { name: german.name })).toBeVisible();

    // --- Confirm: same dialog, but confirming actually removes it ---
    deleteDialog = await openDeleteLanguageDialog(page, german.name);
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('tab', { name: german.name })).toHaveCount(0);

    // English's own content survives untouched — its panel no longer shares the
    // DOM with a second language's, so this resolves to a single match again
    // without needing .last().
    await expect(page.getByLabel('Form title')).toHaveValue(englishTitle);
  });

  test('TC_005 - deleting the very last language auto-restores a default-locale tab instead of leaving the form empty', async ({
    page,
  }) => {
    // Same fix as the test above (FormUpsert.jsx delete flow, task #8, reaching
    // a confirm dialog before the auto-recovery effect from task #9 gets a
    // chance to run) — exercised unconditionally here since packages/admin
    // builds from this repo's own source.

    const newTitle = `E2E last-language form ${Date.now()}`;

    await page.goto('/admin/forms');
    await page.getByRole('link', { name: 'Create Form' }).click();
    await page.waitForURL('**/admin/forms/create');

    // Capture the auto-created default tab's name before deleting it, rather than
    // hardcoding it — FormUpsert resolves it from the site's default_language
    // (en_US on a fresh E2E DB, per set_default_locale_if_empty), and this test
    // shouldn't assume that value.
    const defaultLocaleName = await page.getByRole('tab').textContent();

    const deleteDialog = await openDeleteLanguageDialog(page, defaultLocaleName!);
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();

    // The builder must never show its "Add at least one language" empty state —
    // it should land back on a single, empty tab of the same default locale,
    // immediately ready to be filled in again.
    await expect(page.getByText('Add at least one language to this form')).toHaveCount(0);
    await expect(page.getByRole('tab')).toHaveCount(1);
    await expect(page.getByRole('tab', { name: defaultLocaleName! })).toBeVisible();
    await expect(page.getByLabel('Form title')).toHaveValue('');

    // Confirm the form is fully usable again, not stuck: fill + save it, then
    // confirm Form List renders the freshly saved form without crashing — the
    // actual end-to-end symptom described in the original bug report.
    const generateSlugResponsePromise = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/v1/form_content/generate-slug',
    );
    await page.getByLabel('Form title').fill(newTitle);
    await addSimpleField(page, 'Short Answer', 'Your name');
    await generateSlugResponsePromise;

    const createFormResponsePromise = page.waitForResponse(
      (res) => new URL(res.url()).pathname === '/api/v1/form' && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saveResponse = await createFormResponsePromise;
    expect(saveResponse.ok()).toBe(true);

    await expect(page).toHaveURL(/\/admin\/forms(\?.*)?$/);
    await expect(page.getByText(newTitle)).toBeVisible();
  });
});

test.describe('site defaults', () => {
  test("TC_006 - a newly created form's auto-selected language always tracks the site's current default language", async ({
    page,
  }) => {
    // Site-level (organization) config, not scoped to any one form — mutating it
    // affects every admin screen for the whole test run, so this test restores the
    // original value at the end (see `originalDefaultLanguageId` below) instead of
    // leaving it changed for whatever runs after it.
    const ORGANIZATION_ID = 1; // same id auth.setup.ts's /theme/select call uses

    async function getDefaultLanguageId(): Promise<number> {
      const res = await page.request.get(`/api/v1/organization/${ORGANIZATION_ID}`);
      expect(res.ok()).toBe(true);
      return (await res.json()).default_language_id;
    }

    // organization.py's UpdateSchema is honored as a partial patch (unlike the
    // form Create route's gotcha hit in TC_002 — Create sends every omitted field
    // as an explicit null; Update does not) — safe to call with just the one
    // field being changed.
    async function setDefaultLanguage(localeId: number) {
      const res = await page.request.put(`/api/v1/organization/${ORGANIZATION_ID}`, {
        data: { default_language_id: localeId },
      });
      expect(res.ok()).toBe(true);
    }

    // Opens the Create Form screen fresh (full navigation, not an SPA push) and
    // asserts the single auto-created tab matches the given locale.
    // SitePublicSettingsState (App.jsx) is only populated on app mount, so a full
    // page.goto is required after each setDefaultLanguage call for FormUpsert.jsx
    // to observe the new value — an SPA-internal navigation would still be reading
    // whatever settings were fetched at the start of the test.
    async function expectCreateFormDefaultTab(localeName: string) {
      await page.goto('/admin/forms');
      await page.getByRole('link', { name: 'Create Form' }).click();
      await page.waitForURL('**/admin/forms/create');
      await expect(page.getByRole('tab')).toHaveCount(1);
      await expect(page.getByRole('tab', { name: localeName })).toBeVisible();
    }

    const english = await getLocaleByIsoCode(page.request, 'en');
    const german = await getLocaleByIsoCode(page.request, 'de');

    // Capture whatever the org's default already is (a fresh E2E DB starts at
    // en_US via set_default_locale_if_empty, deepsel/apps/cms/__init__.py) so the
    // restore step below leaves site config exactly as this test found it.
    const originalDefaultLanguageId = await getDefaultLanguageId();

    await setDefaultLanguage(english.id);
    await expectCreateFormDefaultTab(english.name);

    await setDefaultLanguage(german.id);
    await expectCreateFormDefaultTab(german.name);

    await setDefaultLanguage(originalDefaultLanguageId);
  });
});

test.describe('form metadata', () => {
  test('TC_012 - editing slug/description/closing remarks/success message persists and renders correctly on the public site', async ({
    page,
  }) => {
    const englishLocaleId = await getLocaleIdByIsoCode(page.request, 'en');

    const slugSuffix = Date.now();
    const formTitle = `E2E form metadata form ${slugSuffix}`;
    const fieldLabel = 'Your name';

    // Every one of these fields is required by the nested `contents` schema on
    // both the Create AND Update routes (confirmed by reading
    // generate_crud_schemas.py: Update's `contents` field reuses the exact same
    // generate_create_schema-built nested schema as Create, not a partial one) —
    // same gotcha as TC_002's create payload, just also true for the "edit" PUT
    // below.
    const originalContent = {
      title: formTitle,
      slug: `e2e-tc012-form-metadata-${slugSuffix}`,
      locale_id: englishLocaleId,
      description: 'Original description.',
      closing_remarks: 'Original closing remarks.',
      success_message: 'Original success message.',
      ...DEFAULT_FORM_CONTENT_SETTINGS,
      fields: [{ field_type: 'short_answer', label: fieldLabel, required: true }],
    };

    const createdForm = await createForm(page.request, {
      published: true,
      contents: [originalContent],
    });
    const originalContentId = createdForm.contents[0].id;

    // --- "Admin edits the settings and saves" (TC_012 steps 3-4) — done via the
    // same PUT /api/v1/form/{id} route FormUpsert.jsx's Save button calls, not
    // the Settings drawer UI itself, matching TC_002/006/009/010's convention of
    // using the API for admin-side state changes that aren't themselves the
    // thing under test (here, the public website's rendering is). Including the
    // existing content's `id` routes the ORM mixin to the "update existing
    // record" branch instead of creating a duplicate content row; every other
    // required field must still be resent per the schema note above.
    const newSlug = `e2e-tc012-form-metadata-updated-${slugSuffix}`;
    const newDescription = 'Updated description text.';
    const newClosingRemarks = 'Updated closing remarks text.';
    const newSuccessMessage = 'Updated success message text.';

    const updateFormResponse = await page.request.put(`/api/v1/form/${createdForm.id}`, {
      headers: { 'X-Organization-Id': '1' },
      data: {
        contents: [
          {
            ...originalContent,
            id: originalContentId,
            slug: newSlug,
            description: newDescription,
            closing_remarks: newClosingRemarks,
            success_message: newSuccessMessage,
          },
        ],
      },
    });
    expect(updateFormResponse.ok()).toBe(true);

    // Warm-up visit: same Vite first-hit-optimize-and-reload flake as
    // TC_002/TC_004/TC_010. Result discarded.
    await warmUpVisit(page, `/en/forms/${newSlug}`);

    // --- New slug resolves without a 404 (old slug is gone); updated description
    // and closing remarks render (form not yet submitted) ---
    await page.goto(`/en/forms/${newSlug}`);
    await expect(page.getByRole('heading', { level: 1, name: formTitle })).toBeVisible();
    await expect(page.getByText(newDescription)).toBeVisible();
    await expect(page.getByText(newClosingRemarks)).toBeVisible();

    // --- Submit: success message appears, closing remarks (only rendered
    // pre-submit, per Form.tsx's `!submitted && closing_remarks`) disappears ---
    const nameField = page.locator('.form-field').filter({ hasText: fieldLabel });
    await nameField.locator('input[type="text"].form-field__control').fill('Jane Doe');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText(newSuccessMessage)).toBeVisible();
    await expect(page.getByText(newClosingRemarks)).toHaveCount(0);
  });

  test('TC_013 - a form only renders on the website while Published, toggled from the admin Form View screen', async ({
    page,
  }) => {
    // Source excel row labels this "TC_013 TC ID / TC_012 Summary" (a copy-paste
    // artifact in the sheet itself) — its actual content is unambiguous: publish
    // gating for the public form page. Toggled via the real Admin UI per user
    // request (2026-07-10), not the API — unlike TC_012, the switch itself (Form
    // View screen, FormView.jsx's handlePublishToggle) is the thing under test.
    const englishLocaleId = await getLocaleIdByIsoCode(page.request, 'en');

    const slugSuffix = Date.now();
    const formTitle = `E2E publish-gating form ${slugSuffix}`;
    const slug = `e2e-tc013-publish-gating-${slugSuffix}`;

    const createdForm = await createForm(page.request, {
      published: true,
      contents: [
        {
          title: formTitle,
          slug,
          locale_id: englishLocaleId,
          success_message: 'Submitted.',
          ...DEFAULT_FORM_CONTENT_SETTINGS,
          fields: [{ field_type: 'short_answer', label: 'Your name', required: false }],
        },
      ],
    });

    // --- Warm-up visit: same Vite first-hit-optimize-and-reload flake as
    // TC_002/TC_004/TC_010/TC_012. Result discarded. ---
    await warmUpVisit(page, `/en/forms/${slug}`);

    // --- Published: the real form renders ---
    await page.goto(`/en/forms/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: formTitle })).toBeVisible();

    // --- Unpublish via the Form View screen's Published/Unpublished switch.
    // Mantine's Switch has no accessible name here (onLabel/offLabel render text
    // inside the track, not an aria-label) — getByRole('switch') is safe since
    // this is the only switch on the Form View screen.
    await page.goto(`/admin/forms/${createdForm.id}`);
    const publishSwitch = page.getByRole('switch');
    await expect(publishSwitch).toBeChecked();

    let updateFormResponsePromise = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === `/api/v1/form/${createdForm.id}` &&
        res.request().method() === 'PUT',
    );
    // Mantine's onLabel span ("Published") visually overlaps the input's own
    // bounding box, intercepting Playwright's default hit-test — force the
    // click since toBeChecked() below confirms the input's actual state.
    await publishSwitch.click({ force: true });
    expect((await updateFormResponsePromise).ok()).toBe(true);
    await expect(publishSwitch).not.toBeChecked();

    // --- Unpublished: the public page shows "Form Not Found", not the real form ---
    await page.goto(`/en/forms/${slug}`);
    await expect(page.getByRole('heading', { name: 'Form Not Found' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: formTitle })).toHaveCount(0);

    // --- Re-publish via the same switch ---
    await page.goto(`/admin/forms/${createdForm.id}`);
    updateFormResponsePromise = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === `/api/v1/form/${createdForm.id}` &&
        res.request().method() === 'PUT',
    );
    await page.getByRole('switch').click({ force: true });
    expect((await updateFormResponsePromise).ok()).toBe(true);
    await expect(page.getByRole('switch')).toBeChecked();

    // --- Published again: the real form renders once more ---
    await page.goto(`/en/forms/${slug}`);
    await expect(page.getByRole('heading', { level: 1, name: formTitle })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Form Not Found' })).toHaveCount(0);
  });
});
