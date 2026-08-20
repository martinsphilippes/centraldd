import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Carimbo de versão exibido no rodapé — permite confirmar qual build está no aparelho.
    __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(5, 16).replace('T', ' ')),
  },
  build: {
    rollupOptions: {
      output: {
        // Divide o pacote: navegador baixa em paralelo e reaproveita o cache
        // entre versões (o Firebase raramente muda; o código do app muda sempre).
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})
