import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Slim runtime image: only the traced server files get copied. */
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["3000-ws-75w25qzi.arctis.netcupvps.marinotech.com.br"],
  experimental: {
    /* The dynamic file lives outside .next — keep it out of the trace. */
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
