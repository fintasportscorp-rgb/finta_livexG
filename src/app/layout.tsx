import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finta Spot — Live xG vs Goals",
  description:
    "Live football matches ranked by goals-vs-xG differential, with transparent provider fallback (FotMob → Sportmonks).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
