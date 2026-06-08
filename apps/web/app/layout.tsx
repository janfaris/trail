import { ThemeWatcher } from "@/components/theme-watcher";
import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT"],
  style: ["normal", "italic"],
});

const TITLE = "Trail — Share what you built with AI";
const DESCRIPTION =
  "Trail is a social build feed for AI builders: post what you built, import from GitHub or X, follow builders, and join communities starting in Puerto Rico.";

export const metadata: Metadata = {
  metadataBase: new URL("https://gettrail.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Trail",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Resolves the per-device theme before first paint so there is no flash.
// Default is dark; the cookie (set in Settings → Appearance) or, failing that,
// localStorage and finally the OS preference can switch to light.
const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)trail-theme=(light|dark|system)/);var p=m?m[1]:null;if(p!=='light'&&p!=='dark'&&p!=='system'){try{p=localStorage.getItem('trail-theme')}catch(e){p=null}}if(p!=='light'&&p!=='dark'&&p!=='system'){p='dark'}var r=p;if(p==='system'){r=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark'}var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(r);e.style.colorScheme=r}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased dark`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: inline anti-FOUC script must run before paint to resolve the per-device theme */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ThemeWatcher />
        {children}
      </body>
    </html>
  );
}
