import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tulips Talent brand palette: warm cream + dusty mauve-rose + warm black,
        // with a muted sage (the tulip stem) as the secondary accent.
        ivory: '#F7EFE3',
        ink: '#1A1816',
        tulip: '#BE9197',
        'tulip-dark': '#9E6F76',
        mauve: '#A6899A',
        blush: '#EFE0DB',
        sage: '#9CA891',
        'sage-soft': '#DCE3D6',
        stone: '#7C726C',
        line: '#E7DBCD',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
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
