import { test, expect } from '@playwright/test';

// Public pages need no auth at all — this spec runs in the 'unauth' project.
// Content asserted below comes from deepsel/apps/cms/demo_data (seeded into
// every fresh e2e DB): page.csv/page_content.csv (HomePage, WelcomePage) and
// blog_post.csv/blog_post_content.csv (3 demo posts).

test('homepage renders seeded demo content', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Welcome to Your New Website' })).toBeVisible();
});

test('a published page loads by its slug', async ({ page }) => {
  const response = await page.goto('/welcome');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Welcome', exact: true })).toBeVisible();
});

test('blog list page renders seeded posts', async ({ page }) => {
  const response = await page.goto('/blog');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Blog', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Project Management Essentials' })).toBeVisible();
});

test('a single blog post loads by its slug', async ({ page }) => {
  const response = await page.goto('/blog/project-management-essentials');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { name: 'Project Management Essentials' }),
  ).toBeVisible();
});

test('an unknown path renders the theme 404 page with a 404 status', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist-xyz');
  // The theme's 404 component renders, and the response must carry status 404 —
  // a soft-404 (rendered 404 page served as 200) gets indexed as a real page.
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
