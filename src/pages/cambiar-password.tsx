// src/pages/cambiar-password.tsx
import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import styles from '@/styles/ChangePassword.module.css'

/**
 * /cambiar-password
 * -----------------------------------------------------------------------------
 * - Requiere sesión activa (si no, redirige a /login).
 * - Cambia la contraseña del usuario actual en Supabase Auth.
 * - 🔑 FIX LOOP:
 *     1) Intenta RPC `public.clear_must_change_password()` (fuente única en profiles).
 *     2) Si el RPC no existe/queda inaccesible, fallback a UPDATE self en `profiles`.
 * - Refresca sesión para limpiar cualquier estado en memoria/JWT.
 * - Redirige a ?go=<ruta> o /minutas/estadisticas tras éxito.
 * - "Cancelar" = cerrar sesión y /login.
 * - 100% CSR. No toca Policies/Triggers/Metadata.
 */
export default function CambiarPasswordPage() {
  const router = useRouter()

  // Si no viene ?go=, ruta segura (evita /403 inexistente)
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

  // ✅ Verifica sesión al montar. Si no hay usuario → /login
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

  // 🔙 Cancelar = cerrar sesión y volver a /login
  const onCancel = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  // 💾 Guardar nueva contraseña
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setOk(false)

    // Validaciones básicas en cliente
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
      // 1) Seguridad: confirma que haya sesión válida
      const { data: me, error: meErr } = await supabase.auth.getUser()
      if (meErr || !me?.user) throw new Error('Sesión inválida, vuelve a iniciar sesión.')

      // 2) Cambiar contraseña en Auth
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw updErr

      // 3) 🔑 FIX LOOP — limpiar flag en profiles usando RPC, con fallback seguro
      //    - Si tu función existe: CREATE OR REPLACE FUNCTION public.clear_must_change_password() ...
      //    - Debe apagar profiles.must_change_password para el usuario actual (auth.uid()).
      const tryRpc = async () => {
        const { error: rpcErr } = await supabase.rpc('clear_must_change_password')
        if (rpcErr) throw rpcErr
      }

      const tryFallbackUpdate = async () => {
        // Fallback: self-update (RLS debe permitir que el usuario actual actualice su propio profile)
        const uid = me.user.id
        const { error: dbErr } = await supabase
          .from('profiles')
          .update({ must_change_password: false, updated_at: new Date().toISOString() })
          .eq('id', uid)
        if (dbErr) throw dbErr
      }

      try {
        await tryRpc()
      } catch (rpcErr: any) {
        // Errores típicos si el RPC no existe/no expuesto: 42883, PGRST116, 404
        // Fallback no intrusivo que respeta RLS
        await tryFallbackUpdate()
      }

      // 4) Refresca sesión (limpia cualquier claim/estado viejo) y redirige
      await supabase.auth.refreshSession()
      setOk(true)

      // Opcional fuerte: cerrar sesión para evitar ecos en otros dispositivos
      // await supabase.auth.signOut()

      setTimeout(() => router.replace(go), 400)
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
          <p className={styles.cpSubtitle}>
            Define una nueva contraseña segura para tu cuenta.
          </p>

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
              <small className={styles.cpHint}>
                Usa mayúsculas, minúsculas, números y símbolos.
              </small>
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
              <button
                type="submit"
                className={styles.cpButton}
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? 'Guardando…' : 'Guardar nueva contraseña'}
              </button>

              <button
                type="button"
                className={styles.cpButtonSecondary}
                onClick={onCancel}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
