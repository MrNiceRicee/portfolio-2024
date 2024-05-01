import defaultTheme from 'tailwindcss/defaultTheme'
import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
	theme: {
    screens: {
      ...defaultTheme.screens,
      'xs': '475px',
      'phone': '320px',
    },
		extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['JetBrains Mono', ...defaultTheme.fontFamily.mono],
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
        // backgroundImage: 'var(--noiseUrl)',
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
        // backgroundImage: 'var(--noiseUrl)',
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
