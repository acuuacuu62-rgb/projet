import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "ZetaInstall — Your infrastructure, under control",
  description:
    "Connect your VPS, manage SSH keys, and deploy Pterodactyl Panel and Wings from one secure workspace.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
