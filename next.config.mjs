/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Headshots/logos can be hosted anywhere (Supabase Storage, a CDN, a URL the
    // team pastes in), so allow any https image host for next/image.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
