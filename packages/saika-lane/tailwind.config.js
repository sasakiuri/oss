/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vscode: {
          bg: '#1E1E1E',
          'bg-light': '#252526',
          'bg-lighter': '#2D2D30',
          'bg-hover': '#2A2D2E',
          border: '#3E3E42',
          text: '#CCCCCC',
          'text-muted': '#858585',
          primary: '#007ACC',
          success: '#4EC9B0',
          warning: '#DCDCAA',
          error: '#F48771',
        },
      },
    },
  },
  plugins: [],
};
