import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ['Fredoka', 'sans-serif'],
        body: ['Nunito', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Farm-specific colors
        wheat: "hsl(var(--wheat))",
        barn: "hsl(var(--barn))",
        sage: "hsl(var(--sage))",
        sky: "hsl(var(--sky))",
        cream: "hsl(var(--cream))",
        earth: "hsl(var(--earth))",
        sunset: "hsl(var(--sunset))",
        pig: "hsl(var(--pig))",
        cow: "hsl(var(--cow))",
        bird: "hsl(var(--bird))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg)" },
          "50%": { transform: "rotate(3deg)" },
        },
        hop: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "confetti-fall": {
          "0%": { 
            transform: "translateY(0) rotate(0deg)",
            opacity: "1"
          },
          "100%": { 
            transform: "translateY(100vh) rotate(720deg)",
            opacity: "0"
          },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        wiggle: "wiggle 0.5s ease-in-out infinite",
        hop: "hop 0.6s ease-in-out infinite",
        "confetti-fall": "confetti-fall 3s ease-out forwards",
        "fade-in": "fade-in 0.3s ease-out",
        "fade-in-delay-1": "fade-in 0.3s ease-out 0.1s both",
        "fade-in-delay-2": "fade-in 0.3s ease-out 0.2s both",
        "fade-in-delay-3": "fade-in 0.3s ease-out 0.3s both",
      },
      boxShadow: {
        'warm': '0 4px 20px -2px hsl(var(--primary) / 0.2)',
        'warm-lg': '0 10px 40px -5px hsl(var(--primary) / 0.3)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
