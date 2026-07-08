/**
 * Maps Mantine's derived CSS variables onto the `--dsl-*` design tokens so a
 * consumer redefining a token flows through to every Mantine component.
 *
 * Passed to <MantineProvider cssVariablesResolver={...}> in App.jsx. The design
 * system is light-only, so only the `light` scheme is populated.
 */
export default function cssVariablesResolver() {
  return {
    variables: {
      '--mantine-heading-font-weight': 'var(--dsl-fw-semi)',
    },
    light: {
      // surfaces + text
      '--mantine-color-body': 'var(--dsl-panel)',
      '--mantine-color-text': 'var(--dsl-txt)',
      '--mantine-color-dimmed': 'var(--dsl-muted)',
      '--mantine-color-placeholder': 'var(--dsl-muted-2)',
      '--mantine-color-default-border': 'var(--dsl-line)',
      '--mantine-color-anchor': 'var(--dsl-accent)',

      // primary (accent)
      '--mantine-primary-color-filled': 'var(--dsl-accent)',
      '--mantine-primary-color-filled-hover': 'var(--dsl-accent-dark)',
      '--mantine-primary-color-light': 'var(--dsl-info-soft)',
      '--mantine-primary-color-light-hover': 'var(--dsl-info-soft)',
      '--mantine-primary-color-light-color': 'var(--dsl-accent)',

      // status: filled (Switch/Checkbox/solid badges) — kept exact despite
      // the global primaryShade so these don't drift lighter.
      '--mantine-color-green-filled': 'var(--dsl-green)',
      '--mantine-color-green-filled-hover': 'var(--dsl-green-ink)',
      '--mantine-color-red-filled': 'var(--dsl-red)',
      '--mantine-color-red-filled-hover': 'var(--dsl-red-ink)',
      '--mantine-color-amber-filled': 'var(--dsl-amber)',
      '--mantine-color-amber-filled-hover': 'var(--dsl-amber-ink)',

      // status: light (soft badges / alerts)
      '--mantine-color-green-light': 'var(--dsl-green-soft)',
      '--mantine-color-green-light-color': 'var(--dsl-green-ink)',
      '--mantine-color-amber-light': 'var(--dsl-amber-soft)',
      '--mantine-color-amber-light-color': 'var(--dsl-amber-ink)',
      '--mantine-color-red-light': 'var(--dsl-red-soft)',
      '--mantine-color-red-light-color': 'var(--dsl-red-ink)',
    },
    dark: {},
  };
}
