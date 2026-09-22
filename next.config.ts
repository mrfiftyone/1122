import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/main", destination: "/" },
      { source: "/feed", destination: "/" },
      { source: "/teachers", destination: "/" },
      { source: "/teachers/:path*", destination: "/" },
      { source: "/directory", destination: "/" },
      { source: "/notifications", destination: "/" },
      { source: "/profile", destination: "/" },
      { source: "/profile/:username*", destination: "/" },
      { source: "/admin", destination: "/" },
    ];
  },
};

export default nextConfig;
