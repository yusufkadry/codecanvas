import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// WebContainers require cross-origin isolation (SharedArrayBuffer).
// These headers make `npm run dev` and `vite preview` work locally.
// Production headers are set in vercel.json.
const isolationHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: {
    chunkSizeWarningLimit: 4000, // monaco is heavy; it's code-split below
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ["monaco-editor"],
        },
      },
    },
  },
});
