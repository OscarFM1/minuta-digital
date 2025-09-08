// src/pages/cambiar-password.tsx
import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import { mutate } from 'swr'
import styles from '@/styles/ChangePassword.module.css'

/**
 * Cambiar contraseña
 * -----------------------------------------------------------------------------
 * - Requiere sesión.
 * - Cambia contraseña en Auth.
 * - 🔒 Apaga SIEMPRE ambos flags en profiles:
 *     must_change_password=false y first_login=false  (previene doble gate).
 * - Fallbacks si RLS bloquea: RPC clear_must_change_password / ack_first_login.
 * - Invalida SWR, refresh de sesión, signOut y redirección a login con next.
 * - Cortacircuito local: sessionStorage.pwdChanged="1" para saltar gates 1 vez.
 * - Sin cambios a triggers/policies/metadata.
 */
export default function CambiarPasswordPage() {
  const router = useRouter()
  const go =
    typeof router.query.go === 'string' && router.query.go.trim().length > 0
      ? router.query.go
      : '/minutas/estadisticas'

  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const MIN_LEN = 8

  // Verifica sesión al montar
  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        router.replace('/login')
        return
      }
      setChecking(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCancel = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setOk(false)

    if (!password || password.length < MIN_LEN) {
      setErr(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`)
      return
    }
    if (password !== confirm) {
      setErr('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      // Usuario actual
      const { data: me, error: meErr } = await supabase.auth.getUser()
      if (meErr || !me?.user) throw new Error('Sesión inválida, vuelve a iniciar sesión.')
      const uid = me.user.id

      // 1) Cambiar contraseña en Auth
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw updErr

      // 2) Apagar flags en profiles en UNA sola operación (preferido)
      //    - Evita doble redirect (must_change_password / first_login)
      const trySingleUpdate = async () => {
        const { error } = await supabase
          .from('profiles')
          .update({
            must_change_password: false,
            first_login: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', uid)
        if (error) throw error
      }

      // 2b) Fallbacks por si RLS bloquea: RPCs (opcionales si existen)
      const tryRpcClearMust = async () => {
        const { error } = await supabase.rpc('clear_must_change_password') // RETURNS boolean/void
        if (error) throw error
      }
      const tryRpcAckFirst = async () => {
        // si tienes este RPC; si no existe, se ignora
        const { error } = await supabase.rpc('ack_first_login') // RETURNS boolean/void
        if (error) throw error
      }

      try {
        await trySingleUpdate()
      } catch {
        // Intentar apagar cada flag por RPC si el UPDATE directo falló
        try { await tryRpcClearMust() } catch { /* ignore */ }
        try { await tryRpcAckFirst() } catch { /* ignore */ }
      }

      // 3) Invalida cachés SWR y refresca sesión
      await mutate(['profile:me', uid]) // trae profile sin flags
      await mutate('auth:uid')
      await supabase.auth.refreshSession()

      // 👇 Cortacircuito de gates en el siguiente render del cliente
      try { sessionStorage.setItem('pwdChanged', '1') } catch { /* ignore */ }

      setOk(true)

      // 4) Cerrar sesión para evitar ecos del JWT previo
      await supabase.auth.signOut()

      // 5) Redirigir limpio a login con feedback y return
      const next = encodeURIComponent(go)
      router.replace(`/login?changed=1&next=${next}`)
    } catch (e: any) {
      setErr(e?.message || 'No se pudo actualizar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  if (checking) return <p className="mt-4">Verificando sesión…</p>

  return (
    <>
      <Head><title>Cambiar contraseña</title></Head>
      <div className={styles.cpContainer}>
        <div className={styles.cpCard} role="region" aria-label="Cambiar contraseña">
          <h1 className={styles.cpTitle}>Cambiar contraseña</h1>
          <p className={styles.cpSubtitle}>Define una nueva contraseña segura para tu cuenta.</p>

          {err && <div className={styles.cpError} role="alert">{err}</div>}
          {ok && <div className={styles.cpSuccess} role="status">Contraseña actualizada correctamente.</div>}

          <form className={styles.cpForm} onSubmit={onSubmit}>
            <label className={styles.cpLabel}>
              <span>Nueva contraseña</span>
              <input
                type="password"
                className={styles.cpInput}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                aria-label="Nueva contraseña"
                autoFocus
              />
              <small className={styles.cpHint}>Usa mayúsculas, minúsculas, números y símbolos.</small>
            </label>

            <label className={styles.cpLabel}>
              <span>Confirmar contraseña</span>
              <input
                type="password"
                className={styles.cpInput}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repite tu nueva contraseña"
                aria-label="Confirmar contraseña"
              />
            </label>

            <div className={styles.cpActions}>
              <button type="submit" className={styles.cpButton} disabled={loading} aria-busy={loading}>
                {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
              </button>
              <button type="button" className={styles.cpButtonSecondary} onClick={onCancel}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
