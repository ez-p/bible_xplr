import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent this page being embedded in an iframe (clickjacking)
          { key: "X-Frame-Options", value: "DENY" },
          // Stop browsers guessing content types from response bodies
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Only send the origin (no path/query) as the referrer to third parties
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable browser features this app never uses
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Keep this app out of search engine indexes
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
