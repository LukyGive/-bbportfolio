import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'stadadtkqytlnzxlmkzg.supabase.co',
        pathname: '/storage/v1/object/public/portfolio-renders/**',
      },
    ],
  },
};

export default nextConfig;
