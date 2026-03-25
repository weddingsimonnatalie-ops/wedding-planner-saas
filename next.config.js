/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Konva's Node.js build references 'canvas' which is not available in Next.js
    // SeatingVisualView is dynamically imported with ssr:false so this is browser-only
    config.externals = [...(config.externals ?? []), { canvas: "canvas" }];
    return config;
  },
  async headers() {
    // Content Security Policy headers
    // Note: 'unsafe-inline' for scripts is required by Next.js App Router
    // for hydration and client-side navigation. 'unsafe-eval' is required
    // for development mode (React Fast Refresh).
    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' ws: wss: https:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;