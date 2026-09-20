import { defineConfig } from 'vite';

export default defineConfig({
    root: 'src',
    publicDir: false,
    base: './',
    build: {
        outDir: '..',
        emptyOutDir: false,
        target: 'es2022',
        assetsDir: 'assets',
        sourcemap: false,
        minify: 'esbuild',
        chunkSizeWarningLimit: 4096
    }
});
