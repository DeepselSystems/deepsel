import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, '**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'),
    `!${path.join(__dirname, 'node_modules/**')}`
  ],
  theme: {
    extend: {
      colors: {
        claw: {
          50:  '#fff8f2',
          100: '#ffeedd',
          200: '#ffd4b0',
          300: '#ffb37a',
          400: '#ff8c45',
          500: '#e8622a',
          600: '#c94d1c',
          700: '#a33a13',
          800: '#7d2a0e',
          900: '#5a1d08',
        },
        ink: {
          50:  '#f5f5f0',
          100: '#e8e8e0',
          200: '#c8c8bc',
          300: '#a8a898',
          400: '#7a7a6e',
          500: '#585850',
          600: '#3e3e38',
          700: '#2a2a26',
          800: '#1c1c18',
          900: '#111110',
          950: '#0a0a09',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
