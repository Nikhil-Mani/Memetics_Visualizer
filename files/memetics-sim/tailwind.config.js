/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#080808',
        panel: '#0c0c0c',
        hair: '#292929',
        slate: '#999999',
        mist: '#f3f3ef',
        cyan: '#f3f3ef',
        amber: '#bcbcbc',
        flare: '#999999',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
