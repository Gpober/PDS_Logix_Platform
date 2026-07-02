import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // PDS Logix palette: cool steel + deep navy ink + amber "shop" accent.
        base: '#F4F6F9',
        ink: '#101A24',
        pds: '#E8A33D',
        'pds-dark': '#C9852A',
        steel: '#1E3A52',
        mist: '#E8EEF4',
        stone: '#5B6B78',
        line: '#DCE3EA',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
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
