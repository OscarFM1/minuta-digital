import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import styles from '@/styles/ChangePassword.module.css'

/**
 * /cambiar-password
 * - Requiere sesión activa (si no, redirige a /login).
 * - Cambia la contraseña y pone user_metadata.first_login=false si venía true.
 * - Redirige a ?go=<ruta> o /mis-minutas tras éxito.
 * - Incluye botón "Cancelar" (cierra sesión y va a /login).
 * - Accesible y 100% CSR (sin server rendering).
 */
export default function CambiarPasswordPage() {
  const router = useRouter()
  const go = typeof router.query.go === 'string' ? router.query.go : '/mis-minutas'

  const [checking, setChecking] = useState(true)
  const [userMeta, setUserMeta] = useState<Record<string, any>>({})

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  const minLength = 8

  // Verifica sesión al montar
  useEffect(() => {
    ;(async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) {
        router.replace('/login')
        return
      }
      setUserMeta(user.user_metadata || {})
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

    if (!password || password.length < minLength) {
      setErr(`La contraseña debe tener al menos ${minLength} caracteres.`)
      return
    }
    if (password !== confirm) {
      setErr('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      // 1) Cambiar contraseña
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw updErr

      // 2) Si venía first_login=true, lo apagamos
      const meta = { ...userMeta }
      if (meta.first_login) meta.first_login = false
      const { error: metaErr } = await supabase.auth.updateUser({ data: meta })
      if (metaErr) throw metaErr

      // 3) Refrescar sesión y redirigir
      await supabase.auth.refreshSession()
      setOk(true)
      setTimeout(() => router.replace(go), 600)
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
          {ok && <div className={styles.cpSuccess}>Contraseña actualizada correctamente.</div>}

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
