import type { Metadata, Viewport } from "next";
import "../styles/globals.css";
import CapacitorInit from "@/components/CapacitorInit";

export const metadata: Metadata = {
  title: "BitWet",
  description: "Swiss climbing weather forecast app",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <CapacitorInit />
        {children}
      </body>
    </html>
  );
}
