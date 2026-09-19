/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#070A0F',
        panel: '#0C1118',
        hair: '#1B2530',
        slate: '#6F8494',
        mist: '#DCE5EC',
        cyan: '#3FE0D0',
        amber: '#F2A03D',
        flare: '#FF4A8A',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
