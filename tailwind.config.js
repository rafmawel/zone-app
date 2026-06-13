/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#0D0D0D',
        surface: '#1A1A1A',
        'surface-alt': '#242424',
        haltero: '#4F46E5',
        run: '#F97316',
        muscu: '#EF4444',
        hyrox: '#0EA5E9',
        'score-green': '#1BCA82',
        checkin: '#EC4899',
        warning: '#F59E0B',
        danger: '#EF4444',
        text: {
          primary: '#FFFFFF',
          secondary: '#9CA3AF',
          muted: '#4B5563',
        },
        border: '#2A2A2A',
      },
      fontFamily: {
        display: ['Inter_700Bold'],
        body: ['Inter_400Regular'],
        label: ['Inter_600SemiBold'],
      },
      borderRadius: {
        sm: '10px',
        md: '14px',
        lg: '18px',
        xl: '22px',
      },
    },
  },
  plugins: [],
};
