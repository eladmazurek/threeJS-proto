import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for GitHub Pages (repo name)
  base: '/3JS-proto/',

  root: 'src',
  publicDir: '../static',

  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Minification and tree-shaking (enabled by default, but being explicit)
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        // Chunk large dependencies separately for better caching
        manualChunks: {
          three: ['three'],
          h3: ['h3-js'],
        },
      },
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['three', 'h3-js'],
  },
});
