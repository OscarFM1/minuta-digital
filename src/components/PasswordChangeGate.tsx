/**
 * Envoltorio que activa el hook de cambio obligatorio de contraseña.
 * Úsalo en _app.tsx o en tu layout principal.
 */
import React from 'react'
import { usePasswordChangeGate } from '@/hooks/usePasswordChangeGate'

export default function PasswordChangeGate({ children }: { children: React.ReactNode }) {
  usePasswordChangeGate()
  return <>{children}</>
}
