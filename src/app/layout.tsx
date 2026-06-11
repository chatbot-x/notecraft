import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { IframeErrorHandler } from "@/components/iframe-error-handler";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NoteCraft - Markdown Note Taking App",
  description: "A fast, client-side note taking app powered by CodeMirror 6. Write markdown notes with syntax highlighting, all saved locally in your browser.",
  keywords: ["notes", "markdown", "CodeMirror", "note-taking", "editor"],
  authors: [{ name: "NoteCraft" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <IframeErrorHandler />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
