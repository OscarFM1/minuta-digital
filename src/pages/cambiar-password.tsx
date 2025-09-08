// src/pages/cambiar-password.tsx
import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { supabase } from '@/lib/supabaseClient'
import { mutate } from 'swr'
import styles from '@/styles/ChangePassword.module.css'

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
    setErr(null); setOk(false)

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
      const { data: me, error: meErr } = await supabase.auth.getUser()
      if (meErr || !me?.user) throw new Error('Sesión inválida, vuelve a iniciar sesión.')

      // 1) Cambiar contraseña
      const { error: updErr } = await supabase.auth.updateUser({ password })
      if (updErr) throw updErr

      // 2) Apagar flag: RPC → fallback UPDATE self
      const tryRpc = async () => {
        const { error } = await supabase.rpc('clear_must_change_password')
        if (error) throw error
      }
      const tryFallback = async () => {
        const { error } = await supabase
          .from('profiles')
          .update({ must_change_password: false, updated_at: new Date().toISOString() })
          .eq('id', me.user.id)
        if (error) throw error
      }
      try { await tryRpc() } catch { await tryFallback() }

      // 3) Invalida caché de perfil SIEMPRE (SWR)
      await mutate(['profile:me', me.user.id])
      await mutate('auth:uid')

      // 4) Refresca sesión y cierra sesión para evitar ecos del JWT anterior
      await supabase.auth.refreshSession()
      setOk(true)
      await supabase.auth.signOut()

      // 5) Redirige limpio a login con feedback y destino
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
