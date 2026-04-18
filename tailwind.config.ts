import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Aurora Dark – base surfaces
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        // Component tokens
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',

        // Aurora Dark brand palette (direct)
        aurora: {
          navy: '#0B0F1A',
          'navy-mid': '#0F1525',
          'navy-card': '#131929',
          'navy-hover': '#1a2235',
          border: '#1E2A45',
          indigo: '#5B8FFF',
          violet: '#8B5CF6',
          green: '#10B981',
          red: '#EF4444',
          amber: '#F59E0B',
          text: '#E8EEFF',
          'text-muted': '#7A8AAA',
          'text-dim': '#4A5570',
        },

        // Semantic shorthand
        income: '#10B981',
        expense: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', ...fontFamily.sans],
        mono: ['JetBrains Mono', ...fontFamily.mono],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        'aurora-glow': '0 0 20px rgba(91, 143, 255, 0.12)',
        'aurora-card': '0 4px 24px rgba(0, 0, 0, 0.4)',
        'aurora-input': '0 0 0 2px rgba(91, 143, 255, 0.3)',
      },
      backdropBlur: {
        xs: '4px',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
