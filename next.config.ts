import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['mathml2omml', 'pptxgenjs'],
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, '');
        }),
      );
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'node:assert': false,
        'node:crypto': false,
        'node:fs': false,
        'node:path': false,
        'node:stream': false,
        'node:zlib': false,
      };
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        assert: false,
        crypto: false,
        fs: false,
        path: false,
        stream: false,
        zlib: false,
      };
    }
    return config;
  },
  outputFileTracingExcludes: {
    '/*': ['./assets/**/*', './OpenMAIC-org/**/*'],
  },
  experimental: {
    proxyClientMaxBodySize: '200mb',
  },
};

export default nextConfig;
