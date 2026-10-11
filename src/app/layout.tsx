import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { isClerkConfigured } from "@/lib/env";
import "./globals.css";

const SITE_NAME = "島マップ";
const DESCRIPTION = "アイドルファンのための、島のかたちをしたSNS";

/** OGP などの絶対URLの基準。Vercel の本番ドメイン → ローカルの順 */
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "ja_JP",
    title: SITE_NAME,
    description: DESCRIPTION,
  },
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
