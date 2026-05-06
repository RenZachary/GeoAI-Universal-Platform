import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';
import { defineConfig } from 'rollup';

export default defineConfig({
  input: 'src/index.ts',
  output: {
    file: 'dist-bundled/index.cjs',
    format: 'cjs',
    sourcemap: true,
    exports: 'auto',
    inlineDynamicImports: true
  },
  plugins: [
    json(),
    resolve({
      preferBuiltins: true,
      extensions: ['.ts', '.js']
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      compilerOptions: {
        outDir: './dist-bundled',
        declaration: false,
        declarationMap: false,
        sourceMap: true
      }
    })
  ],
  external: [
    // Keep native modules and large dependencies external
    'better-sqlite3',
    'canvas',
    'gdal-async'
  ]
});
