/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; transpile them in the app build.
  transpilePackages: ['@evenup/core', '@evenup/api', '@evenup/db', '@evenup/i18n'],
  eslint: {
    // Lint is run as its own CI job; don't fail the production build on it.
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'nodemailer'],
  // Universal links (docs/store/universal-links.md): Apple's CDN fetches
  // /.well-known/apple-app-site-association verbatim, so map it onto the API
  // route that returns the file. The locale middleware already leaves the
  // path alone (see src/middleware.ts).
  // Universal links (docs/store/universal-links.md): Apple's CDN fetches
  // /.well-known/apple-app-site-association verbatim, so map it onto the API
  // route that returns the file. The locale middleware already leaves the
  // path alone (see src/middleware.ts). NOTE: this MUST stay a function —
  // Next 15.5 silently drops the object form of `rewrites` (verified against
  // routes-manifest.json: object form → beforeFiles: []).
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/.well-known/apple-app-site-association',
          destination: '/api/wellknown/apple-app-site-association',
        },
      ],
    };
  },
  webpack: (config) => {
    // Workspace packages use `.js` import specifiers that point at `.ts` source
    // (NodeNext/Bundler style). Teach webpack to resolve `.js` -> `.ts`.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      ...config.resolve.extensionAlias,
    };
    return config;
  },
};

export default nextConfig;
