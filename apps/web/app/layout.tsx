import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://gettrail.vercel.app"),
  title: "Trail — Semantic search for your AI coding sessions",
  description: "Find any Claude Code, Codex, Cursor, or Copilot session by memory. Cross-vendor timeline + real semantic search in your own Postgres.",
  openGraph: {
    title: "Trail — Semantic search for your AI coding sessions",
    description: "Find any Claude Code, Codex, Cursor, or Copilot session by memory. Cross-vendor timeline + real semantic search in your own Postgres.",
    siteName: "Trail",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trail — Semantic search for your AI coding sessions",
    description: "Find any Claude Code, Codex, Cursor, or Copilot session by memory. Cross-vendor timeline + real semantic search in your own Postgres.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
