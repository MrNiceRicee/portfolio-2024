import defaultTheme from 'tailwindcss/defaultTheme'
import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	theme: {
		// container: {
    //   center: true,
    //   padding: "2rem",
    //   screens: {
    //     "2xl": "1400px",
    //   },
    // },
		extend: {
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
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
        backgroundImage: 'var(--noiseUrl)',
        backgroundSize: '200px',
        backgroundBlendMode: 'overlay',
        opacity: '0.15',
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
        backgroundSize: '200px',
        backgroundBlendMode: 'overlay',
        opacity: '0.15',
        animation: 'static 1s linear infinite alternate-reverse',
        height: 'calc(100% + 2000px)',
        width: 'calc(100% + 2000px)',
        left: '-1000px',
        top: '-1000px',
      },
    })
  })],
}
