import { test as setup, expect } from '@playwright/test';
import { ADMIN_USERNAME, ADMIN_PASSWORD, STORAGE_STATE } from '../playwright.config';

setup('authenticate', async ({ page }) => {
  // Warm-up visit: this is the first route any test hits, so on a cold Vite
  // dep cache (e.g. right after a `--local-packages` rebuild, which clears
  // it) the dev server discovers/optimizes deps and issues a full-page HMR
  // reload mid-navigation, wiping an in-progress .fill() below. Visiting once
  // first (result discarded) lets that reload happen before the real
  // interaction.
  //
  // Waiting on the actual login field rather than `waitForLoadState('networkidle')`
  // matters here: Vite's optimize-deps discovery can be triggered by a dynamic
  // import that only resolves *after* the network already looks idle, so the
  // reload can fire later than networkidle waits for. Waiting for the field
  // itself (with a generous timeout to absorb the optimize+reload cycle) is a
  // direct signal that any such reload has already happened, not just that
  // the network was briefly quiet.
  await page.goto('/admin/login');
  await page.getByLabel('Email or Username').waitFor({ state: 'visible', timeout: 30_000 });

  await page.goto('/admin/login');

  // Two-step form: username first, then a "Continue" click reveals the password field.
  await page.getByLabel('Email or Username').fill(ADMIN_USERNAME);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  await page.waitForURL('**/admin/pages', { timeout: 15_000 });
  await expect(page).toHaveURL(/\/admin\/pages/);

  // No explicit theme selection needed here (unlike alcoris-site): a fresh DB
  // is auto-seeded with selected_theme="paper" by deepsel's
  // set_default_theme_if_empty(), and "paper" ships in this repo's own themes/.

  await page.context().storageState({ path: STORAGE_STATE });
});
