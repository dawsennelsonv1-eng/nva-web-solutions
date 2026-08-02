import type { Config } from 'tailwindcss';

/**
 * TOKEN ENFORCEMENT — how each 13A rule is made mechanical rather than
 * trusted to discipline. Every item below is enforced by the compiler or by
 * the absence of a class, not by a convention document.
 *
 * 1. SIX COLOURS, NO SEVENTH. `theme.colors` is set at the TOP LEVEL, not
 *    `theme.extend.colors`, which DELETES Tailwind's entire default palette.
 *    `bg-blue-500`, `text-gray-900`, `bg-white`, `bg-black` do not exist in
 *    this project — they emit no CSS at all, so a hardcoded-palette class
 *    renders unstyled and is caught on sight. Every remaining colour name maps
 *    to a CSS custom property, so the same utility is correct in light,
 *    dark-industrial, AND under per-tenant brand overrides. There is no colour
 *    class that bypasses the theme engine.
 *
 * 2. NO SHADOWS. `boxShadow`, `dropShadow`, `blur` and `backdropBlur` are set
 *    to empty objects at the TOP LEVEL. This deletes `shadow-*`, `shadow-md`,
 *    `drop-shadow-*`, `blur-*` and `backdrop-blur-*` from the framework. A
 *    developer writing `shadow-lg` gets no CSS. This is stronger than a lint
 *    rule because it needs no configuration file to stay switched on, and it
 *    kills glassmorphism in the same stroke — `backdrop-blur-md` is the class
 *    that makes a glass header, and it no longer compiles.
 *
 * 3. TWO RADII. `none` (0, factual) and `milled` (2px, pressable). `full` is
 *    retained for exactly one thing: the round status indicator on a Plate,
 *    which is an LED on a piece of equipment, not a surface. There is no
 *    third radius for any box.
 *
 * 4. THE RESIDUAL ESCAPE HATCH: arbitrary values (`bg-[#fff]`,
 *    `shadow-[0_2px_4px]`) cannot be disabled by Tailwind itself. It is
 *    declared a defect in CONVENTIONS.md 7, is trivially greppable ("-[" and
 *    "[#"), and is audited.
 *
 * 5. THE MONO RULE — mono only on measured values, plate text and the build
 *    log — is NOT yet mechanically enforced here. `font-data` remains a plain
 *    utility because pre-13B widget and admin files use it directly. The
 *    lint rule that restricts it on public surfaces needs .eslintrc.json,
 *    which has not been pasted. Flagged as an open item, not silently skipped.
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
      /* the six */
      concrete: token('--c-concrete'), // ground    — Cure Gray
      sheet: token('--c-sheet'), // document  — Ticket White
      ink: token('--c-ink'), // panel/text— Machine Black
      rule: token('--c-rule'), // hairlines — Rule Gray
      hazard: token('--c-hazard'), // action    — Signal Orange
      cure: token('--c-cure'), // measured  — Gauge Green
      /* not part of the six; banned on public surfaces. See globals.css. */
      warning: token('--c-warning'),
      danger: token('--c-danger'),
    },

    /* Deleting the shadow and blur scales outright. See note 2. */
    boxShadow: {},
    dropShadow: {},
    blur: {},
    backdropBlur: {},

    borderRadius: {
      none: '0', // factual: plates, tables, inputs, the quote document
      milled: 'var(--r-milled)', // pressable: buttons only
      full: '9999px', // the Plate status LED, and nothing else
    },

    fontFamily: {
      // 13A: three roles, three faces. Display is expanded Archivo, the
      // equipment-nameplate voice. Body is IBM Plex Sans — drawn for an
      // industrial equipment manufacturer, and pointedly not Inter.
      display: ['"Archivo Subset"', 'Archivo', 'Arial', 'sans-serif'],
      body: ['"Plex Sans Subset"', '"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      data: ['"Plex Mono Subset"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
    },

    fontSize: {
      '2xs': ['var(--fs-11)', { lineHeight: '0.875rem' }],
      xs: ['var(--fs-12)', { lineHeight: '1rem' }],
      sm: ['var(--fs-14)', { lineHeight: '1.25rem' }],
      base: ['var(--fs-16)', { lineHeight: '1.5rem' }],
      lg: ['var(--fs-20)', { lineHeight: '1.75rem' }],
      xl: ['var(--fs-25)', { lineHeight: '2rem' }],
      '2xl': ['var(--fs-31)', { lineHeight: '2.375rem' }],
      '3xl': ['var(--fs-39)', { lineHeight: '2.75rem' }],
      '4xl': ['var(--fs-49)', { lineHeight: '1.1' }],
      // The headline, and nothing else. Fluid so it never reflows on a phone.
      display: ['var(--fs-display)', { lineHeight: '0.98', letterSpacing: '-0.015em' }],
    },

    extend: {
      transitionDuration: {
        press: 'var(--t-press)',
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
