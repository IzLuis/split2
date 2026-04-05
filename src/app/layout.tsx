import type { Metadata } from "next";
import "./globals.css";
import { getRequestLocale } from '@/lib/i18n/server';
import { AppToaster } from '@/components/app-toaster';

export const metadata: Metadata = {
  title: "Split2",
  description: "Simple shared expense tracking for friends and family",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestLocale();

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
