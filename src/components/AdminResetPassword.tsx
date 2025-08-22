/**
 * AdminResetPassword.tsx (login o correo)
 *
 * - Acepta "login" simple (p.ej., "kat.acosta") o correo (p.ej., "kat.acosta@login.local").
 * - Normaliza automáticamente a email usando NEXT_PUBLIC_LOGIN_DOMAIN.
 * - Forza cambio de contraseña (genera temporal) y marca first_login=true.
 * - Muestra la contraseña temporal para copiar/compartir.
 *
 * Requisitos:
 * - NEXT_PUBLIC_LOGIN_DOMAIN definido (fallback: "login.local").
 * - /api/admin/force-password-reset actualizado (ver sección 2).
 */

import React, { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Form, InputGroup, Button, Spinner, Alert, Collapse } from 'react-bootstrap'

const LOGIN_DOMAIN = (process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local').trim()

function normalizeToEmail(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  return raw.includes('@') ? raw : `${raw}@${LOGIN_DOMAIN}`
}

export default function AdminResetPassword() {
  const [loginOrEmail, setLoginOrEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [tempPwd, setTempPwd] = useState<string | null>(null)
  const [customMode, setCustomMode] = useState(false)
  const [customPwd, setCustomPwd] = useState('')

  async function forceReset() {
    setErrMsg(null); setOkMsg(null); setTempPwd(null)

    const email = normalizeToEmail(loginOrEmail)
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setErrMsg(`Por favor ingresa un login o correo válido. Ej: kat.acosta  → ${normalizeToEmail('kat.acosta')}`)
      return
    }
    if (customMode && (!customPwd || customPwd.length < 8)) {
      setErrMsg('La contraseña personalizada debe tener al menos 8 caracteres.')
      return
    }

    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        setErrMsg('No hay sesión válida. Vuelve a iniciar sesión como ADMIN.')
        return
      }

      const res = await fetch('/api/admin/force-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email, // ya normalizado
          mode: customMode ? 'custom' : 'auto',
          tempPassword: customMode ? customPwd : undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setErrMsg(json?.error || 'No se pudo forzar el cambio de contraseña.')
        return
      }

      setTempPwd(json?.tempPassword || null)
      setOkMsg('Listo. Comparte la contraseña temporal al usuario y pídele que inicie sesión.')
    } catch (e: any) {
      setErrMsg(e?.message || 'Error inesperado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div aria-label="Forzar cambio de contraseña (ADMIN)">
      <Form onSubmit={(e) => { e.preventDefault(); void forceReset() }}>
        <Form.Label className="mb-1">Login o correo del usuario</Form.Label>
        <InputGroup className="mb-1">
          <Form.Control
            type="text"
            placeholder="kat.acosta"
            value={loginOrEmail}
            onChange={(e) => setLoginOrEmail(e.target.value)}
            aria-label="Login o correo del usuario a resetear"
            autoComplete="off"
          />
        </InputGroup>
        <div className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
          Se convertirá a: <code>{loginOrEmail ? normalizeToEmail(loginOrEmail) : normalizeToEmail('kat.acosta')}</code>
        </div>

        <Form.Check
          type="switch"
          id="customPwdSwitch"
          label="Personalizar contraseña temporal"
          checked={customMode}
          onChange={(e) => setCustomMode(e.currentTarget.checked)}
          className="mb-2"
        />

        <Collapse in={customMode}>
          <div>
            <InputGroup className="mb-2">
              <Form.Control
                type="text"
                placeholder="Ej: Temporal-2024!"
                value={customPwd}
                onChange={(e) => setCustomPwd(e.target.value)}
                aria-label="Contraseña temporal personalizada"
              />
            </InputGroup>
            <div className="text-muted" style={{ fontSize: '0.9rem' }}>
              Requiere mínimo 8 caracteres. Ideal: mayúsculas, minúsculas, número y símbolo.
            </div>
          </div>
        </Collapse>

        <div className="d-flex gap-2 mt-3">
          <Button variant="primary" onClick={() => void forceReset()} disabled={loading}>
            {loading ? <Spinner size="sm" animation="border" /> : 'Forzar cambio'}
          </Button>
        </div>
      </Form>

      {okMsg && <Alert className="mt-3" variant="success">{okMsg}</Alert>}
      {errMsg && <Alert className="mt-3" variant="danger">{errMsg}</Alert>}

      {tempPwd && (
        <Alert className="mt-2" variant="info">
          <div className="d-flex align-items-center justify-content-between gap-2">
            <div>
              <div className="fw-bold">Contraseña temporal generada:</div>
              <code>{tempPwd}</code>
            </div>
            <Button
              size="sm"
              variant="outline-dark"
              onClick={() => navigator.clipboard.writeText(tempPwd)}
            >
              Copiar
            </Button>
          </div>
          <div className="mt-2 small">
            Indícale al usuario que inicie sesión con esta contraseña temporal.
            Al entrar, será redirigido a <strong>/cambiar-password</strong> para definir la definitiva.
          </div>
        </Alert>
      )}
    </div>
  )
}
