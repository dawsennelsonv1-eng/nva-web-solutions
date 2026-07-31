import type { Config } from 'tailwindcss';

/**
 * TOKEN ENFORCEMENT (Phase 1 requirement: "impossible to write a hardcoded
 * colour elsewhere and have it look right"):
 *
 * 1. `theme.colors` is set at the TOP LEVEL, not `theme.extend.colors`, which
 *    DELETES Tailwind's entire default palette. `bg-blue-500`, `text-gray-900`,
 *    `bg-white` do not exist in this project — they fail to compile into CSS,
 *    so a hardcoded-palette class renders as unstyled and is caught on sight.
 * 2. Every remaining colour name maps to a CSS custom property, so the same
 *    utility class is correct in light, dark-industrial, AND under per-tenant
 *    brand overrides. There is no colour class that bypasses the theme engine.
 * 3. The residual escape hatch — arbitrary values like bg-[#fff] — cannot be
 *    disabled by Tailwind itself. It is declared a defect in CONVENTIONS.md 7,
 *    is trivially greppable ("[#"), and Phase 12A audits for it.
 */
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      concrete: token('--c-concrete'),
      sheet: token('--c-sheet'),
      ink: token('--c-ink'),
      rule: token('--c-rule'),
      hazard: token('--c-hazard'),
      cure: token('--c-cure'),
      warning: token('--c-warning'),
      danger: token('--c-danger'),
    },
    borderRadius: {
      none: '0',
      milled: 'var(--r-milled)', // the ONE radius in the system
      full: '9999px',
    },
    fontFamily: {
      // Archivo Variable serves BOTH display and body via its width axis
      // (DESIGN.md Pass 2.3). .font-condensed pulls the display voice.
      display: ['"Archivo Variable"', 'Archivo', 'Arial Narrow', 'sans-serif'],
      body: ['"Archivo Variable"', 'Archivo', 'system-ui', 'sans-serif'],
      data: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
    },
    fontSize: {
      xs: ['var(--fs-12)', { lineHeight: '1rem' }],
      sm: ['var(--fs-14)', { lineHeight: '1.25rem' }],
      base: ['var(--fs-16)', { lineHeight: '1.5rem' }],
      lg: ['var(--fs-20)', { lineHeight: '1.75rem' }],
      xl: ['var(--fs-25)', { lineHeight: '2rem' }],
      '2xl': ['var(--fs-31)', { lineHeight: '2.375rem' }],
      '3xl': ['var(--fs-39)', { lineHeight: '2.75rem' }],
      '4xl': ['var(--fs-49)', { lineHeight: '1.1' }],
    },
    extend: {
      transitionDuration: {
        step: 'var(--t-step)',
        span: 'var(--t-span)',
        scan: 'var(--t-scan)',
      },
      borderColor: {
        DEFAULT: 'rgb(var(--c-rule) / 1)',
      },
    },
  },
  plugins: [],
};

export default config;
