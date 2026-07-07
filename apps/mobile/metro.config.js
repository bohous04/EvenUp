// Metro config for the EvenUp monorepo.
// - watch the workspace root so changes to packages/* hot-reload
// - resolve modules from both app and root node_modules
// - map `.js` import specifiers to `.ts(x)` source (the workspace packages use
//   NodeNext-style `.js` specifiers that point at TypeScript source)
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.disableHierarchicalLookup = false;
// The workspace packages (@evenup/*) expose their entry only via the package.json
// `exports` field (pointing at TS source, incl. subpaths like @evenup/api/trpc),
// so Metro must honour `exports` to resolve them.
config.resolver.unstable_enablePackageExports = true;

const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Rewrite "./foo.js" -> "./foo.ts" for relative imports into TS source pkgs.
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return context.resolveRequest(context, moduleName.replace(/\.js$/, '.ts'), platform);
    } catch {
      // fall through to default resolution
    }
  }
  const resolver = originalResolveRequest ?? context.resolveRequest;
  return resolver(context, moduleName, platform);
};

module.exports = config;
