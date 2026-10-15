import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Serves scene.gltf, scene.bin, and textures/ at the site root.
  publicDir: path.join(root, 'monitor__computer__realistic_computer_monitor'),
  server: {
    port: 5173,
  },
});
