import type { Metadata } from "next";
import "./globals.css";
import { CandidateProvider } from "@/lib/candidate-context";

export const metadata: Metadata = {
  title: "Club Recruitment Arcade — Insert Coin",
  description:
    "An 8-bit arcade recruitment experience. Pick your domain, create your character, and join the party.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Pixel fonts loaded via stylesheet (matches the design HTML and
            avoids build-time font fetching). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <CandidateProvider>{children}</CandidateProvider>
      </body>
    </html>
  );
}
