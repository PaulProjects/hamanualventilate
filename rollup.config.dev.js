import resolve from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import serve from 'rollup-plugin-serve';
import json from '@rollup/plugin-json';

const onwarn = (warning, warn) => {
  if (warning.code === 'THIS_IS_UNDEFINED' && warning.id?.includes('/node_modules/')) {
    return;
  }
  warn(warning);
};

export default {
  input: 'src/ventilation-card.ts',
  output: {
    file: './dist/ventilation-card.js',
    format: 'es',
    inlineDynamicImports: true,
  },
  plugins: [
    resolve(),
    esbuild({ target: 'es2022' }),
    json(),
    serve({
      contentBase: './dist',
      host: '0.0.0.0',
      port: 5005,
      allowCrossOrigin: true,
      mimeTypes: {
        'application/javascript; charset=utf-8': ['js'],
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }),
  ],
  watch: {
    include: 'src/**',
    exclude: 'node_modules/**',
    buildDelay: 500,
    chokidar: {
      usePolling: true,
      interval: 1000,
    },
  },
  onwarn,
};
