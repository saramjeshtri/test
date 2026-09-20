import type { Metadata } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Busulla · Elbasan City Intelligence",
  description: "Kërkesat, buxhetet dhe zonat e Elbasanit të bashkuara nga sistemet e bashkisë në një pamje të vetme.",
  // Tab icon follows the browser's light/dark setting (it can't see the in-app toggle).
  icons: {
    icon: [
      { url: "/brand/icon-light.png", type: "image/png", media: "(prefers-color-scheme: light)" },
      { url: "/brand/icon-dark.png", type: "image/png", media: "(prefers-color-scheme: dark)" },
    ],
  },
};

// Sets data-theme before paint so there's no flash of the wrong theme:
// saved choice wins, otherwise falls back to the OS preference.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem('busulla-theme');
    var theme = saved === 'light' || saved === 'dark'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${plexSans.variable} h-full antialiased`}
      // The inline script below sets data-theme on this element before React
      // hydrates (to avoid a flash of the wrong theme), which React's server
      // render has no way to know about -- this is the standard, narrowly-
      // scoped way to tell React that specific, expected mismatch is fine.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
