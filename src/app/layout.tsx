import type { Metadata } from "next";
import { DEFAULT_DESIGN, DESIGN_INIT_SCRIPT } from "@/features/design/design";
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
  return (
    <html lang="ja" data-design={DEFAULT_DESIGN} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 検証済みの固定スクリプトで保存済みのデザインを初回描画前に復元する */}
        <script dangerouslySetInnerHTML={{ __html: DESIGN_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
