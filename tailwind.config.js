/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0A0A0A',
          card: '#141414',
          elevated: '#1C1C1C',
        },
        accent: {
          gold: '#C9A84C',
          'gold-light': '#F5D78E',
          'gold-dark': '#A8883C',
        },
        orbe: {
          red: '#E57373',
          amber: '#FFB74D',
          blue: '#64B5F6',
          green: '#4CAF50',
        },
        text: {
          primary: '#F5F5F5',
          secondary: '#888888',
          muted: '#555555',
        },
        border: '#2A2A2A',
        success: '#4CAF50',
        danger: '#E57373',
      },
      fontFamily: {
        heading: ['BebasNeue'],
        body: ['Inter-Regular'],
        'body-medium': ['Inter-Medium'],
        'body-bold': ['Inter-Bold'],
      },
    },
  },
  plugins: [],
};
