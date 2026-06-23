import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, 'src');

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(srcDir, '**/*.{astro,html,js,jsx,ts,tsx}')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#262626',
          main: '#262626',
          contrastText: '#FFFFFF',
          text: '#111827', // gray-ebony
        },
        secondary: {
          text: '#4A5565', // gray-river-bed
        },
        heading: '#1F2937', // gray-ebony-clay
        yellow: {
          main: '#A87E2B',
        },
        danger: {
          main: '#ef4444',
          light: '#f87171',
          cinnabar: '#e53940',
          contrastText: '#FFFFFF',
        },
        gray: {
          DEFAULT: '#8E8E8E',
          main: '#8b8b8b',
          border: 'rgba(0, 0, 0, 0.12)',
          emperor: '#505050',
          'pale-sky': '#6F767E',
          chateau: '#9A9FA5',
          'chateau-2': '#9CA3AF',
          shark: '#272B30',
          'river-bed': '#4A5565',
          ebony: '#111827',
          'ebony-clay': '#1F2937',
          'athens-gray': '#E5E7EB',
          'aqua-haze': '#F0F4F7',
          zumthor: '#EFF6FF',
          'pickled-bluewood': '#263645',
          'black-squeeze': '#f7fafc',
          mirage: '#1c2834',
          geyser: '#DFE4E9',
          westar: '#E5E4E2',
        },
        blue: {
          'pickled-bluewood': '#2F4356',
          persian: '#1D4ED8',
        },
        green: {
          main: '#2bdd66',
          light: '#7aea9f',
          dark: '#00973c',
        },
      },
    },
  },
  plugins: [],
};
