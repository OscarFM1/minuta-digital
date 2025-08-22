/**
 * Capa de acceso a datos para MINUTAS.
 * - Inserción tolerante a esquema (user_id / created_by, y columnas opcionales).
 * - Folio consistente con RPC + fallback.
 * - Tipos y selects seguros.
 */

import { supabase } from "@/lib/supabaseClient";
import type { Minute } from "@/types/minute";
import { buildFolioForInsert } from "@/lib/folio";

// ---------------------------------
// Detecciones cacheadas de columnas
// ---------------------------------

let ownerColumnCache: "user_id" | "created_by" | "none" | null = null;
const columnExistsCache: Record<string, boolean> = {};

/** Detecta si existe una columna en public.minute (cacheado). */
async function hasColumn(col: string): Promise<boolean> {
  if (col in columnExistsCache) return columnExistsCache[col];
  const { error } = await supabase.from("minute").select(`id, ${col}`).limit(1);
  const ok = !error;
  columnExistsCache[col] = ok;
  return ok;
}

/** ¿La tabla tiene columna description? */
async function hasDescriptionColumn() {
  return hasColumn("description");
}

/**
 * Detecta la columna de “dueño” que existe en tu instancia.
 * Devuelve "user_id", "created_by" o "none".
 */
async function detectOwnerColumn(): Promise<"user_id" | "created_by" | "none"> {
  if (ownerColumnCache) return ownerColumnCache;

  {
    const { error } = await supabase.from("minute").select("id,user_id").limit(1);
    if (!error) {
      ownerColumnCache = "user_id";
      return ownerColumnCache;
    }
  }
  {
    const { error } = await supabase.from("minute").select("id,created_by").limit(1);
    if (!error) {
      ownerColumnCache = "created_by";
      return ownerColumnCache;
    }
  }
  ownerColumnCache = "none";
  return ownerColumnCache;
}

// ------------------
// Helpers de usuario
// ------------------

/** Devuelve el user id o lanza error claro. */
async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("No hay sesión activa.");
  return data.user.id;
}

/** Devuelve {name, email} del usuario actual (metadata común). */
async function getCurrentUserIdentity(): Promise<{ name: string | null; email: string | null }> {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  const meta = (u?.user_metadata ?? {}) as Record<string, any>;
  const name =
    (meta.full_name as string) ??
    (meta.name as string) ??
    (meta.display_name as string) ??
    null;
  const email = (u?.email as string) ?? null;
  return { name, email };
}

// -------------------------------
// Folio con RPC + fallback local
// -------------------------------

async function nextFolioForUser(userId: string): Promise<number> {
  const rpc = await supabase.rpc("next_minute_folio_for_user", { p_user_id: userId });
  if (!rpc.error && typeof rpc.data === "number") return rpc.data;

  const ownerCol = await detectOwnerColumn();
  let query = supabase.from("minute").select("folio").order("folio", { ascending: false }).limit(1);
  if (ownerCol === "user_id") query = query.eq("user_id", userId);
  else if (ownerCol === "created_by") query = query.eq("created_by", userId);

  const { data } = await query;
  const n = Number(data?.[0]?.folio);
  return Number.isFinite(n) ? n + 1 : 1;
}

// --------------------------------------
// Inserción tolerante a columna de dueño
// --------------------------------------

async function insertMinuteWithOwner(base: Record<string, unknown>, userId: string): Promise<Minute> {
  const detected = await detectOwnerColumn();

  const candidates: Array<Record<string, unknown>> = [];
  if (detected === "user_id") {
    candidates.push({ ...base, user_id: userId });
    candidates.push({ ...base, created_by: userId });
  } else if (detected === "created_by") {
    candidates.push({ ...base, created_by: userId });
    candidates.push({ ...base, user_id: userId });
  } else {
    candidates.push({ ...base }); // instancia sin columna de dueño
  }

  let lastErr: any = null;
  for (const payload of candidates) {
    const { data, error } = await supabase.from("minute").insert(payload).select().single();
    if (!error) return data as Minute;

    const msg = (error.message || "").toLowerCase();
    const missing = msg.includes("could not find") || msg.includes("does not exist") || msg.includes("unknown column");
    if (missing) {
      lastErr = error;
      continue;
    }
    throw error;
  }
  throw lastErr ?? new Error("No fue posible insertar la minuta (columna dueño desconocida).");
}

// -------------------------------
// API pública
// -------------------------------

/**
 * createMinute:
 * - Fecha/horas opcionales (Start/Stop completan después).
 * - Rellena folio y dueño.
 * - Si existen, setea created_by_name / created_by_email y description.
 */
export async function createMinute(input: {
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  tarea_realizada: string;
  novedades?: string | null;
  is_protected?: boolean;
  description?: string; // opcional; solo si existe la columna
}): Promise<Minute> {
  const userId = await getCurrentUserId();
  const { name, email } = await getCurrentUserIdentity();

  // Folio consistente
  const nextFolio = await nextFolioForUser(userId);
  const { folio, folio_serial } = buildFolioForInsert(nextFolio);

  const base: Record<string, unknown> = {
    tarea_realizada: input.tarea_realizada,
    novedades: input.novedades ?? null,
    is_protected: input.is_protected ?? false,
    folio,
    folio_serial,
  };

  // Opcionales
  if (input.date != null) base.date = input.date;
  if (input.start_time != null) base.start_time = input.start_time;
  if (input.end_time != null) base.end_time = input.end_time;

  // Campos de identidad (solo si existen las columnas)
  if (await hasColumn("created_by_name")) base.created_by_name = name;
  if (await hasColumn("created_by_email")) base.created_by_email = email;

  // description (si existe columna y viene dato)
  if (input.description && (await hasDescriptionColumn())) {
    base.description = input.description;
  }

  const row = await insertMinuteWithOwner(base, userId);
  return row;
}

/** updateMinute: patch seguro y devuelve fila actualizada. */
export async function updateMinute(
  id: string,
  patch: {
    start_time?: string | null;
    end_time?: string | null;
    tarea_realizada?: string;
    novedades?: string | null;
    is_protected?: boolean;
  }
): Promise<Minute> {
  const { data, error } = await supabase.from("minute").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as Minute;
}

/** getMinuteById: devuelve la fila o null si no existe. */
export async function getMinuteById(id: string): Promise<Minute | null> {
  const { data, error } = await supabase.from("minute").select("*").eq("id", id).single();
  if (error) return null;
  return data as Minute;
}

/** listMyMinutes: lista del usuario actual. */
export async function listMyMinutes(): Promise<Minute[]> {
  const userId = await getCurrentUserId();
  const ownerCol = await detectOwnerColumn();

  let query = supabase
    .from("minute")
    .select(
      `
      id, date, start_time, end_time, tarea_realizada, novedades,
      folio, folio_serial, created_at, updated_at, is_protected,
      created_by_name, created_by_email, user_id, created_by
    `
    )
    .order("date", { ascending: false })
    .order("start_time", { ascending: false });

  if (ownerCol === "user_id") query = query.eq("user_id", userId);
  else if (ownerCol === "created_by") query = query.eq("created_by", userId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Minute[];
}

/** listAllMinutesForAdmin: listado global (RLS según admin). */
export async function listAllMinutesForAdmin(): Promise<Minute[]> {
  const { data, error } = await supabase
    .from("minute")
    .select(
      `
      id, date, start_time, end_time, tarea_realizada, novedades,
      folio, folio_serial, created_at, updated_at, is_protected,
      created_by_name, created_by_email, user_id, created_by
    `
    )
    .order("date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Minute[];
}

// START/STOP con hora del servidor (RPC)
export async function startMinute(minuteId: string): Promise<Minute> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("No hay sesión.");
  const { data, error } = await supabase.rpc("minute_start", { p_minute_id: minuteId, p_user_id: userId });
  if (error) throw error;
  return data as Minute;
}

export async function stopMinute(minuteId: string): Promise<Minute> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("No hay sesión.");
  const { data, error } = await supabase.rpc("minute_stop", { p_minute_id: minuteId, p_user_id: userId });
  if (error) throw error;
  return data as Minute;
}
