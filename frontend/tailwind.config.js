/** @type {import('tailwindcss').Config} */
module.exports = {
    // `overline` is a Tailwind utility; without this an app's own eyebrow-label class draws a line above the text.
    blocklist: ["overline"],
    darkMode: ["class"],
    content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html"
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      colors: {
        // ── swats palette: black, grey and white, with a light pink accent ──────
        //
        // The page is black/grey/white end to end; pink is the ONLY colour in the
        // interface and it is deliberately light rather than neon, so it reads as
        // an accent against near-black instead of glowing at it.
        //
        // Two consequences worth knowing before changing this ramp:
        //   1. A light fill cannot carry white text. Solid pink surfaces (500/600)
        //      are given near-black ink by a rule in index.css that matches the
        //      fill class together with `text-white`, so the ~100 existing
        //      `bg-brand-500 text-white` buttons did not each need editing.
        //   2. Anything that means "pressed" or "gradient tail" uses 600–800, which
        //      darken within the same hue family instead of drifting to magenta.
        brand: {
          50: '#FFF6FB',
          100: '#FFE9F5',
          200: '#FFD3EA',
          300: '#FFB8DB', // light pink — accent text, icons, borders
          400: '#FF9DCC', // light pink — the usual accent tint
          500: '#FF7FBC', // light pink — primary fill (dark ink on top)
          600: '#F05CA5', // pressed / hover fill
          700: '#D63A8B',
          800: '#A52268',
          900: '#6E1544',
          950: '#3A0B24',
        },
        // Pure neutrals. The old ramp carried a slight violet cast (Gunmetal
        // #343238, Smoky Grey #55545B), which fought the pink accent and made
        // "grey" read as purple in large areas.
        ink: {
          50: '#FAFAFA',
          100: '#E5E5E8',
          200: '#B4B4BC',
          300: '#8C8C95',
          400: '#71717A',
          500: '#5A5A62',
          600: '#45454C',
          700: '#333338',
          800: '#212125',
          900: '#131316',
          950: '#08080A',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        }
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0'
          },
          to: {
            height: 'var(--radix-accordion-content-height)'
          }
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)'
          },
          to: {
            height: '0'
          }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
};