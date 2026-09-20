import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4096 },
  // El paquete de materiales vive fuera de juego/: hay que permitir su lectura.
  server: { fs: { allow: ['..'] }, headers: { 'Cross-Origin-Opener-Policy':'same-origin', 'Cross-Origin-Embedder-Policy':'require-corp' } },
});
