import type { Config } from 'tailwindcss';

// Content globs are kept narrow on purpose: scanning only src/ keeps Tailwind's
// JIT watcher from crawling node_modules or .next on every save.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#14213d', 600: '#1d2d50', 400: '#3a4d7a' },
        teal: { DEFAULT: '#0f9d9a', 600: '#0b7f7c', 100: '#d5f3f2' },
        measure: '#d62828',
        canvas: '#f4f5f7',
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
