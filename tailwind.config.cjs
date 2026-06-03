/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './{components,pages,services,contexts,hooks}/**/*.{js,ts,jsx,tsx}',
    './App.tsx',
    './index.tsx'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
