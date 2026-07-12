import { test as setup, expect } from '@playwright/test';
import { ADMIN_USERNAME, ADMIN_PASSWORD, STORAGE_STATE } from '../playwright.config';

setup('authenticate', async ({ page }) => {
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
