// How the game is bundled, in one place (used by build.mjs and by the tests that check what ships).
import { readFile } from 'node:fs/promises';

/**
 * YouTube Playables may decline games that use eval(), `new Function`, web workers or WebAssembly, and requires that the game make no
 * calls to outside URLs. Three.js carries a few documentation links inside strings and shader comments (and none of its `new Function` uses
 * is reached here), so the text itself is removed from the bundle: the stubs below throw if anything ever reached them, and the URLs lose their scheme.
 */
export const noDynamicCode = {
  name: 'no-dynamic-code',
  setup(build) {
    build.onLoad({ filter: /three[\\/](build|src)[\\/].*\.m?js$/ }, async (args) => {
      let text = await readFile(args.path, 'utf8');
      const hasFn = text.includes('new Function'), hasUrl = /https?:\/\/(www\.pixijs\.com|jcgt\.org)/.test(text);
      if (!hasFn && !hasUrl) return undefined;
      text = text.replaceAll('new Function', '__noDynamicCode').replace(/https?:\/\/(www\.pixijs\.com|jcgt\.org)/g, '$1');
      if (hasFn) text = 'const __noDynamicCode = () => { throw new Error("dynamic code is disabled"); };\n' + text;
      return { contents: text, loader: 'js' };
    });
  },
};

export const bundleConfig = ({ playables = false, outfile = 'dist/game.js', logLevel = 'info' } = {}) => ({
  entryPoints: ['src/main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020',
  outfile, legalComments: 'none', logLevel,
  plugins: [noDynamicCode],
  define: { __PLAYABLES__: String(playables) },       // true only in the YouTube build: it drops the file:// fallbacks (no script injection)
});

/** Per-file size guidance of YouTube Playables (SHOULD-level): 512 KiB. */
export const MAX_FILE_BYTES = 512 * 1024;
const SPLIT_STUBS = ['three-core', 'three-renderer'];

/**
 * The YouTube build: the same code as bundleConfig, as ES modules cut into several files (the main file is `game.js`, loaded with
 * `<script type="module">`; see forPlayables). Three.js alone is over 512 KiB as one file, so the stub entries in
 * tools/split/ make esbuild give Three's core and Three's renderer their own files. The stub outputs are not needed and are dropped.
 */
export const playablesConfig = ({ outdir = 'dist-playables', logLevel = 'info' } = {}) => ({
  ...bundleConfig({ playables: true, logLevel }),
  outfile: undefined, outdir, format: 'esm', splitting: true, metafile: true, chunkNames: 'chunk-[hash]',
  entryPoints: { game: 'src/main.ts', ...Object.fromEntries(SPLIT_STUBS.map(n => [n, `tools/split/${n}.mjs`])) },
});

/** The output files of a playablesConfig build that are real (everything but the stub entries). */
export const shippedOutputs = (outputs) => Object.entries(outputs).filter(([, o]) => !(o.entryPoint && o.entryPoint.startsWith('tools/split/')));
