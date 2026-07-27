import { test, expect } from '@playwright/test';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../playwright.config';

test('user can log in with seeded admin credentials', async ({ page }) => {
  await page.goto('/admin/login');

  await page.getByLabel('Email or Username').fill(ADMIN_USERNAME);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  await expect(page).toHaveURL(/\/admin\/pages/);

  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === 'session_id')).toBe(true);
});

test('login form rejects bad credentials', async ({ page }) => {
  await page.goto('/admin/login');

  await page.getByLabel('Email or Username').fill(ADMIN_USERNAME);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('input[type="password"]').fill('not-the-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  await expect(page).toHaveURL(/\/admin\/login/);
});
