import path from 'node:path';
import { build } from 'esbuild';
import { confinedFile } from './files.ts';
import { RunError } from './manifest.ts';

const JS = /\.(?:js|mjs)$/i;
const RELATIVE = /^\.\.?\//;

// Use a virtual namespace and give esbuild no resolveDir. Only the callbacks
// read inputs, so run code cannot trigger package lookup, filesystem globbing,
// tsconfig discovery, or network loads while it is compiled.
export async function bundleModule(root: string, slug: string, entry: string, read: (absolute: string, relative: string) => string): Promise<string> {
  if (!JS.test(entry)) throw new RunError(slug, `module entry "${entry}" must be a .js or .mjs file`);
  try {
    const result = await build({
      entryPoints: ['demo-entry'],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      legalComments: 'inline',
      logLevel: 'silent',
      logOverride: { 'unsupported-dynamic-import': 'error', 'unsupported-require-call': 'error' },
      tsconfigRaw: {},
      plugins: [{
        name: 'confined-run-modules',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === 'entry-point') return { path: entry, namespace: 'run' };
            if (!RELATIVE.test(args.path) || !JS.test(args.path) || /[?#]/.test(args.path) ||
                !['import-statement', 'dynamic-import'].includes(args.kind)) {
              throw new RunError(slug, `module import "${args.path}" must be a relative .js or .mjs import`);
            }
            const fromDir = path.dirname(path.join(root, args.importer));
            const abs = confinedFile(root, args.path, slug, 'module import', fromDir);
            return { path: path.relative(root, abs).split(path.sep).join('/'), namespace: 'run' };
          });
          builder.onLoad({ filter: /.*/, namespace: 'run' }, ({ path: rel }) => ({
            contents: read(confinedFile(root, rel, slug, 'module source'), rel),
            loader: 'js',
          }));
        },
      }],
    });
    return result.outputFiles[0].text;
  } catch (error) {
    throw new RunError(slug, `could not bundle "${entry}": ${error instanceof Error ? error.message : error}`);
  }
}
