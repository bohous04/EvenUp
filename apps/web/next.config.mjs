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
