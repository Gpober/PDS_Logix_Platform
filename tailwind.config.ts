import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pride Dealer Services (pdslogix.net) brand: a dark, near-black
        // industrial UI with an electric-cyan accent, white headings, and
        // muted-gray body text. The token NAMES are kept (ink, ivory, tulip,
        // …) so the whole app re-skins from here; only the values changed from
        // the old light Tulips palette.
        ivory: '#12161D', // page background (dark, lifted a touch)
        ink: '#F2F5F8', // primary text + light borders (was the dark text)
        tulip: '#16B4E8', // electric-cyan accent — links, buttons, highlights
        'tulip-dark': '#0E97C4', // cyan hover/pressed
        mauve: '#16B4E8',
        blush: '#1E252F', // subtle raised surface / accent tint on dark
        sage: '#16B4E8',
        'sage-soft': '#1E252F',
        stone: '#9AA3AD', // muted body text
        line: '#28303A', // hairline borders on dark
        // Override the default `white` so the many `bg-white` card surfaces
        // become dark panels (there are no `text-white` usages, so this is
        // safe). True white, when needed, is available as `#fff`.
        white: '#1A1F28',
      },
      fontFamily: {
        // Bold geometric grotesque for headings (matches the PDS wordmark),
        // clean sans for body.
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        container: '1240px',
      },
    },
  },
  plugins: [],
};

export default config;
