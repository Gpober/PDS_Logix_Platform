/** @type {import('next').NextConfig} */
const nextConfig = {
  // The daily production email's template lives in docs/ so the Python preview
  // renderer and the app read ONE file. Serverless bundling only traces code
  // imports, so the template has to be force-included or it is simply missing
  // at runtime on Vercel.
  outputFileTracingIncludes: {
    '/api/cron/daily-production-report': ['./docs/daily-production-email/template.html'],
  },
  images: {
    // Headshots/logos can be hosted anywhere (Supabase Storage, a CDN, a URL the
    // team pastes in), so allow any https image host for next/image.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
