import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EshetikVault — POS",
  description: "Module POS / Facturation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}