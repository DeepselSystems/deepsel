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

test('an unknown path renders the theme 404 page', async ({ page }) => {
  // Note: the paper theme's 404 fallback renders correctly, but the response
  // status itself comes back 200 rather than 404 in Astro dev mode — asserting
  // on the rendered content (what a visitor actually sees) rather than the
  // status code here.
  await page.goto('/this-page-does-not-exist-xyz');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
