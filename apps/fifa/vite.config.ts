import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// The PeerColab CLI prints generated PathItems into src/peercolab-fifa/Fifa_player_dashboard.
// Alias it as @gen so app code imports operations/types without long relative paths.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  resolve: {
    alias: {
      '@gen': fileURLToPath(new URL('./src/peercolab-fifa/Fifa_player_dashboard', import.meta.url)),
    },
  },
})
