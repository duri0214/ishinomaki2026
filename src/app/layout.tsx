import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { isClerkConfigured } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "島マップ",
    template: "%s | 島マップ",
  },
  description: "アイドルファンのための、島のかたちをしたSNS",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const content = (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
  // Clerk のキーがなければ ClerkProvider を使わない（閲覧のみのモードで動く）
  return isClerkConfigured() ? (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      {content}
    </ClerkProvider>
  ) : (
    content
  );
}
