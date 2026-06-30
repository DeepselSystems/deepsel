import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Going up two levels from this file's directory reaches the package root,
// regardless of whether we are in src/flags/ (dev) or dist/flags/ (production).
// src/flags/ is always present in the published package (listed in "files").
const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Absolute filesystem path to the SVG flag directory inside @deepsel/cms-utils.
 * Server-side only — do not import this in browser contexts.
 */
export const flagsSvgDir: string = path.join(packageRoot, 'src', 'flags', 'svg');
