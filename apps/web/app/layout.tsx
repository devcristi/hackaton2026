import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NeoTwin — Neonatal Digital Twin",
  description: "Real-time incubator monitoring with predictive simulation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
