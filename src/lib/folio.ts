// src/lib/folio.ts
import type { Minute } from "@/types/minute";

/**
 * leftPad: convierte un número a string con ceros a la izquierda.
 * width por defecto = 4 para "0001".
 */
function leftPad(n: number, width = 4): string {
  const raw = String(Math.max(0, Math.trunc(n)));
  return raw.length >= width ? raw.slice(-width) : raw.padStart(width, "0");
}

/**
 * toIntOrNull: intenta parsear un string a int positivo. Retorna null si no es numérico.
 */
function toIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return parseInt(v, 10);
  return null;
}

export type FolioInfo = {
  display: string;   // Siempre algo mostrable (e.g. "0007" o fallback al id)
  numeric?: number;  // Si logramos interpretar número, lo devolvemos
  source: "folio" | "folio_serial" | "id";
};

/**
 * resolveFolio:
 * - Prioriza folio numérico → "0007"
 * - Luego folio_serial numérico → normaliza a 4 dígitos
 * - Luego folio_serial no-numérico → lo deja tal cual (ej. "M-0007")
 * - Fallback: usa id.slice(0, 8).toUpperCase()
 *
 * No tira exceptions; siempre retorna algo mostrable.
 */
export function resolveFolio(
  minute: Pick<Minute, "id" | "folio" | "folio_serial">,
  width = 4
): FolioInfo {
  // 1) folio numérico directo
  const folioNum = toIntOrNull(minute.folio ?? null);
  if (folioNum !== null) {
    return { display: leftPad(folioNum, width), numeric: folioNum, source: "folio" };
  }

  // 2) folio_serial numérico (e.g. "12", "0012")
  const serialNum = toIntOrNull(minute.folio_serial ?? null);
  if (serialNum !== null) {
    return { display: leftPad(serialNum, width), numeric: serialNum, source: "folio_serial" };
  }

  // 3) folio_serial con formato custom (e.g. "M-0007" o "A12")
  if (typeof minute.folio_serial === "string" && minute.folio_serial.trim() !== "") {
    return { display: minute.folio_serial.trim(), source: "folio_serial" };
  }

  // 4) fallback: id corto
  const fallback = (minute.id || "").slice(0, 8).toUpperCase() || "—";
  return { display: fallback, source: "id" };
}

/**
 * buildFolioForInsert:
 * Para INSERT/UPSERT: si tienes un número, devuelve {folio, folio_serial}.
 * Si sólo tienes string, intenta parsear a número; si no se puede, guarda sólo folio_serial.
 */
export function buildFolioForInsert(
  value: number | string,
  width = 4
): { folio: number | null; folio_serial: string | null } {
  const n = toIntOrNull(value);
  if (n !== null) {
    return { folio: n, folio_serial: leftPad(n, width) };
  }
  // guarda tal cual como serial "custom"
  return { folio: null, folio_serial: String(value) };
}
