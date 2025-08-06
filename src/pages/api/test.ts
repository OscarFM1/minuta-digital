// src/pages/api/test.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabaseClient'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Endpoint de prueba para verificar conexión a Supabase y Prisma.
 * - Consulta la tabla "Minute" vía Supabase.
 * - Consulta la misma tabla vía Prisma.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // 1. Prueba Supabase
  const { data: sbData, error: sbError } = await supabase
    .from('Minute')
    .select('*')
  if (sbError) {
    return res.status(500).json({ error: 'Supabase Error', details: sbError })
  }

  // 2. Prueba Prisma
  try {
    const prData = await prisma.minute.findMany()
    return res.status(200).json({ supabase: sbData, prisma: prData })
  } catch (err: any) {
    return res.status(500).json({ error: 'Prisma Error', details: err.message })
  }
}
