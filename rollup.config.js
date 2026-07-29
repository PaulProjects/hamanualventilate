import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';

const plugins = [
  nodeResolve(),
  commonjs(),
  typescript(),
  json(),
  terser(),
];

const onwarn = (warning, warn) => {
  if (warning.code === 'THIS_IS_UNDEFINED' && warning.id?.includes('/node_modules/')) {
    return;
  }
  warn(warning);
};

export default [
  {
    input: 'src/ventilation-card.ts',
    output: {
      file: 'dist/ventilation-card.js',
      format: 'es',
      inlineDynamicImports: true,
    },
    plugins,
    onwarn,
  },
];
