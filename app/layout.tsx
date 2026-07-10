import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteChrome } from '@/components/SiteChrome';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz'],
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

// Ensure mobile browsers render at device width (not zoomed-out desktop width).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: 'Tulips Talent — Creator & Influencer Talent Agency',
    template: '%s · Tulips Talent',
  },
  description:
    'Tulips Talent represents the creators brands build with. Explore our roster, see live partnerships, and start a collaboration.',
  openGraph: {
    title: 'Tulips Talent',
    description: 'The creators brands build with.',
    type: 'website',
  },
  verification: {
    google: [
      'JgK8IiRgCg9e0gkeinu8Ta7RgXaP03h_I368GKCY42I',
      'Y2YVgXDM_pOVyWtzL80Xy2eS3ywGDF7AC-AluCHqa20',
    ],
    // TikTok URL-prefix (developer app) domain verification.
    other: {
      'tiktok-developers-site-verification': 'xMf56jUoFGMdcx3hRMTkHdFwkE2skHIi',
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="flex min-h-screen flex-col">
        <SiteChrome header={<SiteHeader />} footer={<SiteFooter />}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
