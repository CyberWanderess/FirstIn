import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const config = {
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  sourcemap: true,
  outdir: 'dist',
  entryPoints: {
    'background':       'src/background/service-worker.ts',
    'content-linkedin': 'src/content/linkedin/index.ts',
    'content-indeed':   'src/content/indeed/index.ts',
    'popup':            'src/popup/popup.ts',
    'options':          'src/options/options.ts',
  },
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(config);
  console.log('Build complete.');
}
