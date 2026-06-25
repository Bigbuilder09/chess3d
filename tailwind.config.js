/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian:   '#0D0D0F',
        'deep-slate': '#14141F',
        charcoal:   '#1E1E2E',
        gold:       '#C8A96E',
        indigo:     '#5C6BC0',
        crimson:    '#E84040',
        sage:       '#4CAF7D',
        ivory:      '#F0EAD6',
        ash:        '#7A7A8C',
        carbon:     '#2A2A3C',
      },
      fontFamily: {
        cinzel: ['Cinzel', 'serif'],
        inter:  ['Inter', 'sans-serif'],
        mono:   ['"JetBrains Mono"', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-down': 'slideDown 0.3s ease-out',
        'fade-in':    'fadeIn 0.5s ease-out',
        'float':      'float 3s ease-in-out infinite',
      },
      keyframes: {
        slideDown: {
          '0%':   { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)',      opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
}
