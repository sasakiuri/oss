/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './board.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vscode: {
          bg: '#14191D',
          'bg-light': '#191F24',
          'bg-lighter': '#222A30',
          'bg-hover': '#222A30',
          border: '#34404A',
          text: '#E3E7EA',
          'text-muted': '#AAB3BA',
          dimmed: '#818D95',
          primary: '#0D78B2',
          'primary-hover': '#168CC9',
          accent: '#7CC1E7',
          success: '#58C69A',
          warning: '#D8B66E',
          error: '#EE8585',
          sidebar: '#10161B',
          highlight: '#202A31',
          hover: '#20282E',
          input: '#252D33',
        },
      },
    },
  },
  plugins: [],
};
