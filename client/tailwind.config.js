/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['EB Garamond', 'Georgia', 'serif'],
      },
      screens: {
        'xs': '375px',   // iPhone SE
        'sm': '640px',   // larger phones
        'md': '768px',   // iPad mini / portrait
        'lg': '1024px',  // iPad landscape
        'xl': '1280px',  // iPad Pro
      },
      colors: {
        ivory: '#F5F0E6',
        cream: '#FBF7EE',
        ink: '#1C1917',
        accent: '#8B3A2F',
        'accent-dark': '#72302A',
        'accent-light': '#A84E3A',
        muted: '#6B5E52',
        'muted-soft': '#A5967D',
        border: '#D9CDBA',
        'border-soft': '#E8DDC8',
        'dark-card': '#2B2623',
      },
    },
  },
  plugins: [],
};
