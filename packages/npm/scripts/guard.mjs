// Guard: this folder is not a valid package root for `npm pack` / `npm
// publish`. npm applies the repository's .gitignore rules over the `files`
// whitelist and would silently drop the generated bundle (monet.js) and the
// skill template from the tarball. The tarball is assembled from a staging
// directory outside the repository instead — see scripts/pack.mjs.
console.error('Pack from a staging directory outside the repository instead:')
console.error('')
console.error('  npm run pack')
console.error('  npm publish monet-cli-<version>.tgz')
process.exit(1)
