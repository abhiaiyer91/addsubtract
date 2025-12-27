/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
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
        // Graphite-style semantic colors
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SF Mono", "Monaco", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
        "hero": ["3.5rem", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "hero-lg": ["4.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
      },
      boxShadow: {
        // Graphite-style teal glow shadows
        "glow": "0 0 30px rgba(16, 185, 129, 0.15)",
        "glow-sm": "0 0 15px rgba(16, 185, 129, 0.1)",
        "glow-lg": "0 0 60px rgba(16, 185, 129, 0.2)",
        "glow-xl": "0 0 80px rgba(16, 185, 129, 0.25), 0 0 120px rgba(16, 185, 129, 0.15)",
        // Standard shadows
        "soft": "0 2px 8px rgba(0, 0, 0, 0.08)",
        "soft-md": "0 4px 16px rgba(0, 0, 0, 0.12)",
        "soft-lg": "0 8px 32px rgba(0, 0, 0, 0.16)",
        "inner-glow": "inset 0 1px 0 0 rgba(255, 255, 255, 0.05)",
        // Graphite card shadows
        "card": "0 0 0 1px rgba(255, 255, 255, 0.05), 0 4px 24px rgba(0, 0, 0, 0.3)",
        "card-hover": "0 0 0 1px rgba(16, 185, 129, 0.2), 0 8px 40px rgba(0, 0, 0, 0.4)",
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
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-down": {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 30px rgba(16, 185, 129, 0.2)" },
          "50%": { boxShadow: "0 0 50px rgba(16, 185, 129, 0.35)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "fade-up": "fade-up 0.5s ease-out",
        "fade-down": "fade-down 0.5s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "float": "float 3s ease-in-out infinite",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-subtle": "linear-gradient(to bottom, rgba(255,255,255,0.02), transparent)",
        "shimmer": "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)",
        // Graphite-style gradients
        "gradient-dark": "linear-gradient(to bottom, hsl(240 10% 6%), hsl(240 10% 4%))",
        "gradient-card": "linear-gradient(to bottom right, rgba(255,255,255,0.03), transparent)",
        "gradient-glow": "radial-gradient(ellipse at center, rgba(16, 185, 129, 0.15) 0%, transparent 70%)",
        "gradient-hero": "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(16, 185, 129, 0.15) 0%, transparent 100%)",
      },
      transitionTimingFunction: {
        "bounce-in": "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
        "smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        "400": "400ms",
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
