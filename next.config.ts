import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  serverExternalPackages: [],
  outputFileTracingExcludes: {
    '/*': ['./assets/**/*', './OpenMAIC-org/**/*'],
  },
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
