import { createTheme } from '@mantine/core';

/**
 * Mantine theme for the Deepsel admin (CX1 design system).
 *
 * Visual values are sourced from the `--dsl-*` tokens in `tokens.css` so that a
 * consumer redefining those variables re-skins the whole UI. This file only
 * wires Mantine's scales/derived vars to the tokens and sets per-component
 * defaultProps + stable `dsl-*` classNames (visual rules live in
 * `components.css`). Pair it with `cssVariablesResolver.js`.
 */
export default createTheme({
  fontFamily: 'var(--dsl-font)',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSizes: {
    xs: 'var(--dsl-fs-xs)',
    sm: 'var(--dsl-fs-sm)',
    md: 'var(--dsl-fs-body)',
    lg: 'var(--dsl-fs-h)',
    xl: 'var(--dsl-fs-title)',
  },
  radius: {
    xs: 'var(--dsl-radius-xs)', // 7px  chips
    sm: 'var(--dsl-radius-btn)', // 8px  buttons
    md: 'var(--dsl-radius-sm)', // 9px  inputs (wrappers default to this)
    lg: 'var(--dsl-radius)', // 14px cards / tables
    xl: '16px', // modals
  },
  defaultRadius: 'md',
  headings: {
    fontFamily: 'var(--dsl-font)',
    fontWeight: 'var(--dsl-fw-semi)',
  },
  shadows: {
    xs: 'var(--dsl-shadow)',
    sm: 'var(--dsl-shadow)',
    md: 'var(--dsl-shadow)',
    lg: 'var(--dsl-shadow)',
    xl: 'var(--dsl-shadow-lg)',
  },
  primaryColor: 'primary',
  primaryShade: 4, // --color-primary-400 === --dsl-accent
  colors: {
    // Indigo brand scale — the anchor (index 4) is aliased to --dsl-accent in
    // global.css, so overriding --dsl-accent shifts the primary shade.
    primary: [
      'var(--color-primary-50)',
      'var(--color-primary-100)',
      'var(--color-primary-200)',
      'var(--color-primary-300)',
      'var(--color-primary-400)',
      'var(--color-primary-500)',
      'var(--color-primary-600)',
      'var(--color-primary-700)',
      'var(--color-primary-800)',
      'var(--color-primary-900)',
    ],
    green: [
      '#e1f5e8',
      '#c3e7d0',
      '#9bd9ae',
      '#6fca8b',
      '#4bbe6f',
      '#34b65e',
      '#22a657',
      '#1c8c4a',
      '#15733c',
      '#0b5f2f',
    ],
    amber: [
      '#fbf2dc',
      '#f6e6bd',
      '#efd48a',
      '#e9c257',
      '#e4b336',
      '#e0a020',
      '#c88c1a',
      '#a9791a',
      '#886115',
      '#6b4c10',
    ],
    red: [
      '#fde2e3',
      '#f9c5c7',
      '#f29a9e',
      '#ec7175',
      '#e74f54',
      '#e0353b',
      '#c22a30',
      '#a11f25',
      '#82171d',
      '#651014',
    ],
    blue: [
      '#e5f4ff',
      '#cde2ff',
      '#9bc2ff',
      '#64a0ff',
      '#3984fe',
      '#1d72fe',
      '#0969ff',
      '#0058e4',
      '#004ecc',
      '#0043b5',
    ],
    gray: [
      '#f3f3fe',
      '#e4e6ed',
      '#c8cad3',
      '#a9adb9',
      '#9093a4',
      '#808496',
      '#767c91',
      '#656a7e',
      '#585e72',
      '#4a5167',
    ],
    orange: [
      '#fff8e1',
      '#ffefcc',
      '#ffdd9b',
      '#ffca64',
      '#ffba38',
      '#ffb01b',
      '#ffab09',
      '#e39500',
      '#ca8500',
      '#af7100',
    ],
    lightBlue: [
      '#e0fbff',
      '#cbf2ff',
      '#9ae2ff',
      '#64d2ff',
      '#3cc5fe',
      '#23bcfe',
      '#09b8ff',
      '#00a1e4',
      '#0090cd',
      '#007cb5',
    ],
    dark: [
      '#f5f5f5',
      '#e7e7e7',
      '#cdcdcd',
      '#b2b2b2',
      '#9a9a9a',
      '#8b8b8b',
      '#848484',
      '#717171',
      '#656565',
      '#575757',
    ],
  },
  components: {
    Button: {
      defaultProps: { radius: 'sm' }, // 8px per design
      classNames: { root: 'dsl-Button' },
    },
    Input: {
      classNames: { input: 'dsl-Input-input' },
    },
    InputWrapper: {
      classNames: { label: 'dsl-Input-label' },
    },
    Modal: {
      defaultProps: {
        radius: 'xl',
        shadow: 'xl',
        centered: true,
        overlayProps: { color: 'rgb(20 28 48)', backgroundOpacity: 0.4, blur: 4 },
      },
      classNames: { content: 'dsl-Modal', header: 'dsl-Modal-header' },
    },
    Badge: {
      defaultProps: { radius: 'xl', variant: 'light' },
      classNames: { root: 'dsl-Badge' },
    },
    Table: {
      defaultProps: { highlightOnHover: true },
      classNames: { table: 'dsl-Table' },
    },
    Switch: {
      defaultProps: { color: 'green' },
    },
    Checkbox: {
      defaultProps: { color: 'primary', radius: 'xs' },
    },
    Radio: {
      defaultProps: { color: 'primary' },
    },
    Tabs: {
      classNames: { list: 'dsl-Tabs-list', tab: 'dsl-Tab' },
    },
    NavLink: {
      classNames: {
        root: 'dsl-NavLink-root',
        label: 'dsl-NavLink-label',
        section: 'dsl-NavLink-section',
      },
    },
    Popover: {
      defaultProps: { shadow: 'sm', radius: 'md' },
    },
    Menu: {
      defaultProps: { shadow: 'sm', radius: 'md' },
    },
  },
});
