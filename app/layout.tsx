import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import QueryProvider from "@/app/providers/QueryProvider";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

// viewportFit:"cover" is deliberately NOT set here. It was previously
// applied at this root layout for a /planner-only Android landscape
// black-bar fix -- but app/planner/layout.tsx already declares its own
// viewportFit:"cover" independently (added earlier, for iOS status-bar
// notch handling), so the root-level one was pure redundancy for the
// route it was meant to help and instead leaked "extend under the
// system UI" onto every OTHER route too -- the marketing site, /login,
// /admin -- none of which have the matching env(safe-area-inset-*)
// padding CalculatorLayoutClient.tsx's Header/ShellChrome carry. Real,
// confirmed regression from that: /login rendered with a huge dead gap
// below the form on a real Android phone (viewport-fit:cover reports the
// full physical screen height as the CSS viewport; this page's own
// content just sits near the top of it with nothing to fill the rest,
// reading as "vertically stretched"). Removing it here is a pure
// revert-to-default for every route except /planner, which is
// unaffected -- it never needed this one, it already has its own.
export const viewport: Viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: "ProTankr",
  description: "Verify your load before you cross the scale.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ProTankr",
  },
  icons: {
    icon: "/icons/favicon.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "dark", background: "#111111" }}>
      <head>
        {/* theme-color itself comes from the `viewport` export below (Next's
            Metadata API) rather than a hardcoded tag here -- nested layouts
            (e.g. app/planner/layout.tsx) override it per-route, and a
            static tag here would coexist with that override ambiguously. */}
        <meta name="color-scheme" content="dark" />
      </head>
      <body
        className={`${outfit.variable} antialiased`}
        style={{ background: "#111111", colorScheme: "dark" }}
      >
        <ServiceWorkerRegistration />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
