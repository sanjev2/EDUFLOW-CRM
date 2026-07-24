import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EduFlow", template: "%s | EduFlow" },
  description: "EduFlow helps education consultancies manage student enquiries, counselling work and application progress in one secure workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
