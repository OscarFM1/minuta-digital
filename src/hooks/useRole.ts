/**
 * useRole
 * - Lee role y must_change_password del perfil actual.
 * - Expone banderas útiles para UI.
 * - Política de edición: solo los 'worker' pueden crear/editar/eliminar minutas.
 */
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type Role = 'worker' | 'admin' | 'super_admin'

type State = {
  role: Role | null
  mustChange: boolean
  loading: boolean
  isWorker: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  canWriteMinutes: boolean
}

export function useRole(): State {
  const [state, setState] = useState<State>({
    role: null,
    mustChange: false,
    loading: true,
    isWorker: false,
    isAdmin: false,
    isSuperAdmin: false,
    canWriteMinutes: false,
  })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const user = auth?.user
      if (!user) {
        if (alive) setState(s => ({ ...s, loading: false }))
        return
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('role, must_change_password')
        .eq('id', user.id)
        .single()

      const role = (prof?.role ?? null) as Role | null
      const mustChange = !!prof?.must_change_password
      const isWorker = role === 'worker'
      const isAdmin = role === 'admin'
      const isSuperAdmin = role === 'super_admin'
      const canWriteMinutes = isWorker // ← política: solo worker escribe

      if (alive) {
        setState({
          role,
          mustChange,
          loading: false,
          isWorker,
          isAdmin,
          isSuperAdmin,
          canWriteMinutes,
        })
      }
    })()
    return () => { alive = false }
  }, [])

  return state
}
