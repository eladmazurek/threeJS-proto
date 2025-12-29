/**
 * Vite Configuration
 *
 * Vite is a modern build tool that provides fast development server
 * with hot module replacement (HMR) and optimized production builds.
 *
 * This configuration is set up for a Three.js project with GLSL shaders.
 */

import restart from 'vite-plugin-restart'
import glsl from 'vite-plugin-glsl'

export default {
    // Source directory - where index.html and source files are located
    root: 'src/',

    // Static assets directory - files here are served as-is and copied to dist
    // Contains textures like earth/day.jpg, earth/night.jpg, etc.
    publicDir: '../static/',

    // Base path for all assets - './' means relative paths
    // This allows the built app to work from any subdirectory
    base: './',

    // Development server configuration
    server: {
        // Allow access from other devices on the local network
        // Useful for testing on mobile devices
        host: true,

        // Automatically open browser when dev server starts
        // Disabled in CodeSandbox environments (they handle this themselves)
        open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env)
    },

    // Production build configuration
    build: {
        // Output directory for production build
        outDir: '../dist',

        // Clean the output directory before building
        emptyOutDir: true,

        // Generate source maps for debugging production code
        sourcemap: true
    },

    // Vite plugins
    plugins: [
        // vite-plugin-restart: Automatically restart dev server when
        // static files change (textures, etc.)
        // Without this, you'd need to manually restart after adding new textures
        restart({ restart: ['../static/**'] }),

        // vite-plugin-glsl: Enables importing .glsl shader files as strings
        // Also provides shader minification and include support
        glsl()
    ]
}
