import { describe, it, expect } from 'vitest';
import {
  deepenRelativeImports,
  resolveRelativeSpecifier,
} from '../src/components/admin/theme/ThemeFileEdit.jsx';

describe('resolveRelativeSpecifier', () => {
  it('resolves a same-directory sibling against its directory', () => {
    expect(resolveRelativeSpecifier('components', './LangSwitcher')).toBe(
      'components/LangSwitcher',
    );
  });

  it('resolves a specifier that escapes its directory', () => {
    expect(resolveRelativeSpecifier('components', '../assets/images/hero.jpg')).toBe(
      'assets/images/hero.jpg',
    );
  });

  it('resolves against an empty (theme-root) directory', () => {
    expect(resolveRelativeSpecifier('', './components/Footer.astro')).toBe(
      'components/Footer.astro',
    );
  });
});

describe('deepenRelativeImports', () => {
  it('resolves a same-directory sibling with no language variant of its own to the real shared path, not one level up', () => {
    // Regression: Menu.tsx importing ./LangSwitcher (a component with no
    // language variant of its own) must resolve back through both the new
    // `de/` segment and `components/` itself, not just one level up.
    const code = "import LangSwitcher from './LangSwitcher';\n";
    const result = deepenRelativeImports(code, 'components/Menu.tsx', 'de/components/Menu.tsx');
    expect(result).toContain("from '../../components/LangSwitcher'");
  });

  it('adds one level for a specifier that already escapes components/', () => {
    const code = "import hero from '../assets/images/hero.jpg';\n";
    const result = deepenRelativeImports(code, 'components/Menu.tsx', 'de/components/Menu.tsx');
    expect(result).toContain("from '../../assets/images/hero.jpg'");
  });

  it('handles a page-level template moving from theme root into a lang folder', () => {
    const code = "import Footer from './components/Footer.astro';\n";
    const result = deepenRelativeImports(code, 'page.astro', 'de/page.astro');
    expect(result).toContain("from '../components/Footer.astro'");
  });

  it('leaves non-relative imports untouched', () => {
    const code = "import { useLanguage } from '@deepsel/cms-react';\n";
    const result = deepenRelativeImports(code, 'components/Menu.tsx', 'de/components/Menu.tsx');
    expect(result).toBe(code);
  });

  it('rewrites every relative specifier in a file with multiple imports', () => {
    const code = [
      "import LangSwitcher from './LangSwitcher';",
      "import hero from '../assets/images/hero.jpg';",
      "import { useLanguage } from '@deepsel/cms-react';",
    ].join('\n');
    const result = deepenRelativeImports(code, 'components/Menu.tsx', 'de/components/Menu.tsx');
    expect(result).toContain("from '../../components/LangSwitcher'");
    expect(result).toContain("from '../../assets/images/hero.jpg'");
    expect(result).toContain("from '@deepsel/cms-react'");
  });
});
