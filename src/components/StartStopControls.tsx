// src/components/StartStopControls.tsx
import { useState } from 'react'
import { Button } from 'react-bootstrap'
import { startMinute, stopMinute } from '@/lib/minutes'
import type { Minute } from '@/types/minute'

type Props = {
  minute: Minute
  onChange?: (m: Minute) => void
}

export default function StartStopControls({ minute, onChange }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasStarted = !!minute.start_time
  const hasEnded = !!minute.end_time

  const onStart = async () => {
    setLoading(true)
    setError(null)
    try {
      const updated = await startMinute(minute.id)
      onChange?.(updated)
    } catch (e: any) {
      setError(e?.message ?? 'No fue posible iniciar la minuta.')
    } finally {
      setLoading(false)
    }
  }

  const onStop = async () => {
    setLoading(true)
    setError(null)
    try {
      const updated = await stopMinute(minute.id)
      onChange?.(updated)
    } catch (e: any) {
      setError(e?.message ?? 'No fue posible finalizar la minuta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="d-flex flex-column gap-2">
      <div className="d-flex gap-2">
        {!hasStarted && !hasEnded && (
          <Button size="sm" variant="success" onClick={onStart} disabled={loading}>
            ▶ Start
          </Button>
        )}
        {hasStarted && !hasEnded && (
          <Button size="sm" variant="danger" onClick={onStop} disabled={loading}>
            ■ Stop
          </Button>
        )}
        {hasStarted && hasEnded && (
          <span className="text-success fw-semibold">Finalizada</span>
        )}
      </div>

      {error && (
        <div
          className="text-danger"
          role="alert"
          aria-live="assertive"
          style={{ fontSize: '.9rem' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
