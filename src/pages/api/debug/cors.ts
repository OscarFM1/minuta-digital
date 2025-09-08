import type { NextApiRequest, NextApiResponse } from 'next'
import { ALLOWED_ORIGINS, resolveRequestOrigin, isOriginAllowed } from '@/lib/allowedOrigins'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const resolved = resolveRequestOrigin(req)
  res.status(200).json({
    resolved,
    allowedList: ALLOWED_ORIGINS,
    isAllowed: isOriginAllowed(resolved),
    headers: {
      origin: req.headers.origin || null,
      xfProto: req.headers['x-forwarded-proto'] || null,
      xfHost: req.headers['x-forwarded-host'] || null,
      host: req.headers['host'] || null,
    },
  })
}
