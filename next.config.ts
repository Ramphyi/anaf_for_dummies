import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: { position: "bottom-left" },
  serverExternalPackages: ["@libsql/client", "libsql", "nodemailer"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Cache-ul Turbopack refolosit la repornirea `next dev` (16.4) trimite „restart” la fiecare conectare HMR → buclă de reîncărcare.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
