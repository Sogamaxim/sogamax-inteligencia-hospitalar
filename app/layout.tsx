import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sogamax | Inteligência Hospitalar",
  description: "Protótipo da ferramenta de cruzamento entre descrições do mercado hospitalar e o estoque Sogamax.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
