/**
 * CanWriteMinutes — Renderiza children solo si el usuario puede escribir minutas.
 * Uso:
 *   <CanWriteMinutes><Button>Crear minuta</Button></CanWriteMinutes>
 *   <CanWriteMinutes elseRender={<></>}>...</CanWriteMinutes>
 */
import { ReactNode } from 'react'
import { useRole } from '@/hooks/useRole'

export default function CanWriteMinutes({
  children,
  elseRender = null,
}: { children: ReactNode; elseRender?: ReactNode }) {
  const { loading, canWriteMinutes } = useRole()
  if (loading) return null // evita parpadeos
  return canWriteMinutes ? <>{children}</> : <>{elseRender}</>
}
