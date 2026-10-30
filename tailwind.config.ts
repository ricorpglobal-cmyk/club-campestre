import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f3f6f4', 100: '#e1e9e4', 200: '#c3d3c9', 300: '#9db8a8', 400: '#6f927e', 500: '#3f6b55', 600: '#2f5543', 700: '#244335', 800: '#1b3328', 900: '#13251d' },
        sand: { 50: '#faf8f3', 100: '#f3eee2', 200: '#e6dcc4', 500: '#b0955a' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
