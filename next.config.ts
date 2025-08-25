// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // ✅ permite que el build de producción continúe aunque existan errores de ESLint
  eslint: {
    ignoreDuringBuilds: true,
  },

  // (tu config actual aquí: headers, images, etc. si tenías algo más)
}

export default nextConfig
