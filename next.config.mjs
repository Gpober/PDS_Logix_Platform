/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Logos / vehicle photos can be hosted anywhere (Supabase Storage, a CDN, a
    // pasted URL), so allow any https image host for next/image.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
