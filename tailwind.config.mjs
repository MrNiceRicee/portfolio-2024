import defaultTheme from 'tailwindcss/defaultTheme'
import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
	theme: {
    screens: {
      // keep all breakpoints in pixels, including the existing custom screens.
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
      'xs': '475px',
      'phone': '320px',
    },
		extend: {
      // retain the existing paper and ink palette rather than the new defaults.
      colors: {
        stone: {
          50: '#fafaf9',
          800: '#292524',
          950: '#0c0a09',
        },
        zinc: {
          50: '#fafafa',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          900: '#18181b',
        },
      },

      fontFamily: {
        mono: ['JetBrains Mono Variable', ...defaultTheme.fontFamily.mono],
      },
    },
	},
	plugins: [plugin(function({addUtilities}) {
    addUtilities({
      '.grainy-dark': {
        position: 'fixed',
        inset: 0,
        content: '""',
        pointerEvents: 'none',
        backgroundImage: 'var(--noiseSvg)',
        backgroundSize: 'var(--grainy-size, 32rem)',
        backgroundBlendMode: 'screen',
        opacity: '0.175',
        animation: 'static 1s steps(30) infinite alternate-reverse',
        height: 'calc(100% + 2000px)',
        width: 'calc(100% + 2000px)',
        left: '-1000px',
        top: '-1000px',
      },
      '.grainy-light': {
        position: 'fixed',
        inset: 0,
        content: '""',
        pointerEvents: 'none',
        backgroundImage: 'var(--noiseSvg)',
        backgroundSize: 'var(--grainy-size,54rem)',
        backgroundBlendMode: 'screen',
        opacity: '.35',
        animation: 'static 1s linear infinite alternate-reverse',
        height: 'calc(100% + 2000px)',
        width: 'calc(100% + 2000px)',
        left: '-1000px',
        top: '-1000px',
      },
      '.slight-x-mask': {
        '-webkit-mask-image': 'linear-gradient(to right, transparent, black var(--mask-left-start, 2%), black var(--mask-left-end, 98%), transparent)',
      },
    })
  })],
}
