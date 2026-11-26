import type { Metadata, Viewport } from "next";
import { uiFont } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "aloudli",
  description:
    "Lesson audio plus a short spoken debrief, turned into what to teach next.",
  // Added to an iPhone's home screen: its own window, named aloudli.
  appleWebApp: { capable: true, title: "aloudli", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0f7b63" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`h-full antialiased ${uiFont.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
