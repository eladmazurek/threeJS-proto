import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],

  // Base path for GitHub Pages (repo name)
  base: '/threeJS-proto/',

  root: 'src',
  publicDir: '../static',
  envDir: '../',

  server: {
    proxy: {
      // Proxy OpenSky auth server for OAuth2 token requests
      '/api/opensky-auth': {
        target: 'https://auth.opensky-network.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/opensky-auth/, ''),
        secure: true,
      },
      // Proxy OpenSky API requests to avoid CORS issues in development
      '/api/opensky': {
        target: 'https://opensky-network.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/opensky/, '/api'),
        secure: true,
      },
    },
  },

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
