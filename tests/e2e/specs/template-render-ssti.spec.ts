import { test, expect } from '@playwright/test';

// Domain: POST /api/v1/template_content/render — SSTI/RCE hardening.
//
// Classic Jinja2 SSTI technique: `self` always refers to the current
// TemplateReference, whose `__init__.__globals__` reaches the interpreter's
// builtins regardless of what context variables the caller passed in. Against
// the unpatched endpoint this executes `os.popen('id').read()` server-side and
// returns the shell output as `rendered_content` with a 200.
const SSTI_PAYLOAD =
  "{{ self.__init__.__globals__.__builtins__.__import__('os').popen('id').read() }}";

// Org id 1 is the single row deepsel's own organization.csv seeds on a fresh DB.
const ORGANIZATION_ID = 1;

test('blocks a server-side template injection payload instead of executing it', async ({
  page,
}) => {
  const response = await page.request.post('/api/v1/template_content/render', {
    data: {
      content: SSTI_PAYLOAD,
      name: 'e2e-ssti-probe',
      organization_id: ORGANIZATION_ID,
    },
  });

  // Unpatched: 200 with rendered_content containing the `id` command's output
  // (e.g. "uid=0(root) gid=0(root) ..."). Patched: the sandboxed Jinja2
  // environment raises SecurityError, which the route turns into a generic
  // 400 — no command output, no internal error details in the response.
  expect(response.status()).toBe(400);

  const body = await response.json();
  expect(body.detail).toBe('Template contains disallowed syntax');

  // Belt-and-suspenders: whatever the response shape, it must never contain
  // evidence of code execution (uid/gid output) or leak the sandbox's
  // internal error message (which would fingerprint the mitigation itself).
  const raw = JSON.stringify(body);
  expect(raw).not.toMatch(/uid=\d+/);
  expect(raw).not.toContain('TemplateReference');
  expect(raw).not.toContain('__init__');
});

test('still renders legitimate template syntax', async ({ page }) => {
  const response = await page.request.post('/api/v1/template_content/render', {
    data: {
      content: 'Hello {{ 1 + 1 }}!',
      name: 'e2e-legit-probe',
      organization_id: ORGANIZATION_ID,
    },
  });

  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.rendered_content).toBe('Hello 2!');
});
