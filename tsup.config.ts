import { defineConfig } from 'tsup'

export default defineConfig([
  // Type definitions build
  {
    entry: {
      index: 'src/index.ts'
    },
    format: ['esm'],
    dts: {
      only: true
    },
    outDir: 'dist/types',
    clean: true
  },
  // ESM build
  {
    entry: {
      index: 'src/index.ts',
      cli: 'src/converters/cli.ts'
    },
    format: ['esm'],
    target: 'es2022',
    outDir: 'dist/esm',
    dts: false,
    clean: false,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    // Production minification - enabled when --minify flag is used
    minify: process.env.NODE_ENV === 'production' || process.argv.includes('--minify'),
    external: [
      '@langchain/anthropic',
      '@langchain/community', 
      '@langchain/core',
      '@langchain/google-genai',
      '@langchain/langgraph',
      '@langchain/ollama',
      '@langchain/openai',
      'axios',
      'dotenv',
      'langchain',
      'langsmith',
      'uuid',
      'zod'
    ]
  },
  // CommonJS build
  {
    entry: {
      index: 'src/index.ts',
      cli: 'src/converters/cli.ts'
    },
    format: ['cjs'],
    target: 'node14',
    outDir: 'dist/cjs',
    dts: false,
    clean: false, // Don't clean since type definitions build already cleaned
    sourcemap: true,
    splitting: false,
    treeshake: true,
    // Production minification - enabled when --minify flag is used
    minify: process.env.NODE_ENV === 'production' || process.argv.includes('--minify'),
    minifyIdentifiers: false,
    minifySyntax: false,
    esbuildOptions(options) {
      options.supported = {
        ...options.supported,
        'logical-assignment': false, // Disable ??=, ||=, &&= operators
      }
    },
    external: [
      '@langchain/anthropic',
      '@langchain/community',
      '@langchain/core', 
      '@langchain/google-genai',
      '@langchain/langgraph',
      '@langchain/ollama',
      '@langchain/openai',
      'axios',
      'dotenv',
      'langchain',
      'langsmith',
      'uuid',
      'zod'
    ]
  }
])