/**
 * AdminResetPassword.tsx (login o correo) — JSON limpio para backend
 * -----------------------------------------------------------------------------
 * Cambios clave:
 * - Envía SIEMPRE JSON con 'Content-Type: application/json'.
 * - Decide automáticamente si enviar { login } o { email } según el input.
 * - Si el admin activa modo personalizado, envía { password } (NO 'tempPassword').
 * - NO depende del token de sesión del usuario (no se envía Authorization).
 * - Si configuras NEXT_PUBLIC_INTERNAL_ADMIN_TOKEN, se manda en 'x-internal-admin-token'.
 *
 * Backend esperado:
 * - POST /api/admin/force-password-reset  (ajusta si tu ruta difiere)
 * - Body: { login?: string; email?: string; password?: string }
 * - Respuesta OK: { ok: true, email: string, tempPassword?: string }
 *
 * Buenas prácticas:
 * - Validaciones mínimas de input.
 * - Estados de carga/éxito/error visibles.
 * - Copiar contraseña temporal con 1 clic.
 */

import React, { useState } from 'react'
import { Form, InputGroup, Button, Spinner, Alert, Collapse } from 'react-bootstrap'

const LOGIN_DOMAIN = (process.env.NEXT_PUBLIC_LOGIN_DOMAIN || 'login.local').trim()
const ADMIN_TOKEN = (process.env.NEXT_PUBLIC_INTERNAL_ADMIN_TOKEN || '').trim()
const API_PATH = '/api/admin/force-password-reset' // ajusta si tu ruta es distinta

function normalizeToEmail(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  return raw.includes('@') ? raw : `${raw}@${LOGIN_DOMAIN}`
}

function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
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

    const raw = (loginOrEmail || '').trim()
    if (!raw) {
      setErrMsg('Por favor ingresa un login o correo.')
      return
    }

    // Decidir login vs email de acuerdo al input
    let payload: Record<string, string> = {}
    if (raw.includes('@')) {
      const email = raw
      if (!isEmail(email)) {
        setErrMsg('El correo no parece válido.')
        return
      }
      payload.email = email
    } else {
      // login simple sin @
      payload.login = raw
    }

    // Si piden contraseña personalizada, validar y añadir como "password"
    if (customMode) {
      if (!customPwd || customPwd.length < 8) {
        setErrMsg('La contraseña personalizada debe tener al menos 8 caracteres.')
        return
      }
      payload.password = customPwd
    }

    setLoading(true)
    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (ADMIN_TOKEN) headers['x-internal-admin-token'] = ADMIN_TOKEN

      const res = await fetch(API_PATH, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        // back compat con tu backend que devolvía "login requerido"
        const reason = json?.error || json?.message || `HTTP ${res.status}`
        setErrMsg(`No se pudo forzar el cambio de contraseña: ${reason}`)
        return
      }

      setTempPwd(json?.tempPassword || null)
      const correo = json?.email ? ` (${json.email})` : ''
      setOkMsg(`Listo. Contraseña reseteada correctamente${correo}. Compártela al usuario y pídelo iniciar sesión.`)
      setCustomPwd('')
    } catch (e: any) {
      setErrMsg(e?.message || 'Error de red o CORS.')
    } finally {
      setLoading(false)
    }
  }

  const previewEmail = loginOrEmail
    ? (loginOrEmail.includes('@') ? loginOrEmail : normalizeToEmail(loginOrEmail))
    : normalizeToEmail('kat.acosta')

  return (
    <div aria-label="Forzar cambio de contraseña (ADMIN)">
      <Form onSubmit={(e) => { e.preventDefault(); void forceReset() }}>
        <Form.Label className="mb-1">Login o correo del usuario</Form.Label>
        <InputGroup className="mb-1">
          <Form.Control
            type="text"
            placeholder="kat.acosta  ó  kat.acosta@login.local"
            value={loginOrEmail}
            onChange={(e) => setLoginOrEmail(e.target.value)}
            aria-label="Login o correo del usuario a resetear"
            autoComplete="off"
          />
        </InputGroup>

        <div className="text-muted mb-2" style={{ fontSize: '0.9rem' }}>
          Si escribes solo el login, el backend usará este dominio por defecto: <code>@{LOGIN_DOMAIN}</code><br />
          Vista previa (solo informativa): <code>{previewEmail}</code>
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
                placeholder="Ej: Temporal-2025!"
                value={customPwd}
                onChange={(e) => setCustomPwd(e.target.value)}
                aria-label="Contraseña temporal personalizada"
                autoComplete="off"
              />
            </InputGroup>
            <div className="text-muted" style={{ fontSize: '0.9rem' }}>
              Mínimo 8 caracteres. Ideal: mayúsculas, minúsculas, número y símbolo.
            </div>
          </div>
        </Collapse>

        <div className="d-flex gap-2 mt-3">
          <Button variant="primary" onClick={() => void forceReset()} disabled={loading}>
            {loading ? <Spinner size="sm" animation="border" /> : 'Forzar cambio'}
          </Button>
          <Button
            variant="outline-secondary"
            type="button"
            disabled={loading}
            onClick={() => { setLoginOrEmail(''); setCustomMode(false); setCustomPwd(''); setErrMsg(null); setOkMsg(null); setTempPwd(null) }}
          >
            Limpiar
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
            Pídele al usuario que inicie sesión con esta contraseña. Será redirigido a <strong>/cambiar-password</strong>.
          </div>
        </Alert>
      )}
    </div>
  )
}
