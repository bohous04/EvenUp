import localFont from 'next/font/local';

/**
 * The marketing pages' one typeface: Geist Sans (SIL OFL 1.1), variable,
 * subset to what the marketing pages set: Basic Latin, Latin-1, Latin
 * Extended-A (every Czech diacritic), general punctuation, €, arrows and the
 * minus sign; weight axis limited to 400–700, the range the pages use.
 * 23 kB instead of 58 kB, which matters because it is preloaded ahead of the
 * headline. Re-subset from upstream Geist (pyftsubset + varLib.instancer) if
 * copy ever needs a character outside those ranges.
 *
 * Self-hosted through `next/font/local`, which preloads the file and generates
 * a metric-adjusted Arial fallback. `display: 'optional'` is the zero-layout-
 * shift choice: if the file is not there within the block period the page
 * keeps the (size-matched) fallback for that visit instead of swapping
 * mid-read.
 */
export const landingFont = localFont({
  src: '../../app/fonts/geist-sans.woff2',
  weight: '400 700',
  style: 'normal',
  display: 'optional',
  variable: '--font-landing',
  adjustFontFallback: 'Arial',
  fallback: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});
