import { expect, type Page } from '@playwright/test';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../playwright.config.js';

/**
 * Logs in via the real admin UI flow (same steps as auth.setup.ts), for tests
 * that need a session dedicated to themselves rather than the suite-wide
 * storageState — notably any test that calls logoutViaUI, since that
 * invalidates the session server-side.
 */
export async function loginViaUI(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email or Username').fill(ADMIN_USERNAME);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.waitForURL('**/admin/pages', { timeout: 15_000 });
}

/**
 * Logs out via the real admin UI flow (profile dropdown -> Logout menu item).
 */
export async function logoutViaUI(page: Page): Promise<void> {
  await page.goto('/admin');
  // "Admin" is the seeded admin user's display name (deepsel/apps/core/data/user.csv).
  await page.getByRole('banner').getByText('Admin', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/admin\/login/);
}
