import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { DocumentChrome } from "@/components/DocumentChrome";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Ebraico della UI: lo stesso Rubik dei poster, dal bundle (niente rete).
// Limitato ai blocchi ebraici e senza fallback Arial, così sta primo nello
// stack solo per l'ebraico: il latino continua a cadere su Geist.
const rubik = localFont({
  variable: "--font-rubik",
  src: [
    { path: "../assets/fonts/Rubik-Regular.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts/Rubik-Bold.ttf", weight: "700", style: "normal" },
    { path: "../assets/fonts/Rubik-Black.ttf", weight: "900", style: "normal" },
  ],
  declarations: [{ prop: "unicode-range", value: "U+0590-05FF, U+200C-200F, U+20AA, U+FB1D-FB4F" }],
  adjustFontFallback: false,
  display: "swap",
  preload: false,
});


export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://pictorium.app"),
  title: "Pictorium — מחולל פוסטרים ל-Stremio",
  description: "מחולל פוסטרים דינמי ל-Stremio: פוסטרים נקיים, לוגואים וקטוריים, דירוגים ותגיות טרנד שמורכבים בזמן אמת.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/App.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/App.png", sizes: "512x512", type: "image/png" },
    ],
  },
  openGraph: {
    title: "Pictorium",
    description: "מחולל פוסטרים ל-Stremio",
    images: ["/pictorium.png"],
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#e85d2a",
};

import { ThemeProvider } from "@/lib/contexts/ThemeContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${rubik.variable} h-full antialiased`}>
      <head>
        {/* Prima del paint: tema (upstream) + lingua/direzione salvate (fork),
            così né il tema né l'RTL lampeggiano. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t;try{t=localStorage.getItem("pictorium_ui_theme");}catch(e){}var s=t==="light"||t==="dark"?t:"system";var d=s==="system"?(typeof window.matchMedia==="function"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):"dark"):s;document.documentElement.setAttribute("data-theme",d);document.documentElement.setAttribute("data-theme-setting",s);document.documentElement.classList.add(d);document.documentElement.classList.remove(d==="dark"?"light":"dark");var l;try{l=(localStorage.getItem("preferred_lang")||"").toLowerCase();}catch(e){}if(/^[a-z]{2}$/.test(l||"")){document.documentElement.lang=l;document.documentElement.dir=(l==="he"||l==="ar")?"rtl":"ltr";}})();`,
          }}
        />
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="preconnect" href="https://api.themoviedb.org" />
      </head>
      <body className="min-h-full" suppressHydrationWarning>
        <ThemeProvider>
          <DocumentChrome />
          <main id="main-content">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
