/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        canvas:    '#FEFDFB',
        beige:     '#F4EBD0',
        'beige-dk':'#E8DCC8',
        forest:    '#122620',
        'forest-md':'#0E1B17',
        teal:      '#0C5752',
        'teal-lt': '#0E7A73',
        gold:      '#CFC292',
        'gold-dk': '#B8A876',
        mint:      '#34D399',
        cream:     '#F8F3E8',
        ink:       '#0A0F0C',
      },
      fontFamily: {
        head:  ['Outfit', 'sans-serif'],
        edit:  ['"DM Serif Display"', 'serif'],
        label: ['"Cormorant Garamond"', 'serif'],
        body:  ['Inter', 'sans-serif'],
      },
      borderRadius: {
        md: '14px',
        sm: '10px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.02)',
        'card-hover': '0 8px 20px -12px rgba(18,38,32,0.08)',
      },
    },
  },
  plugins: [],
}
