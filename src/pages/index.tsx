// src/pages/index.tsx
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/login') // Redirige automáticamente al login
  }, [router])

  return null // No renderiza nada mientras redirige
}
