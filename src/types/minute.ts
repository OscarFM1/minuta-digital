// src/types/minute.ts
export type MinuteId = string;

export interface Minute {
  id: MinuteId;
  user_id: string;
  start_time: string;         // Formato 'HH:mm' o el que uses
  end_time: string;           // Ídem
  tarea_realizada: string;
  novedades: string | null;
  created_by_name: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string | null;
}

export type MinuteUpdate = Partial<
  Pick<Minute, 'start_time' | 'end_time' | 'tarea_realizada' | 'novedades'>
>;

// Valores que usa el formulario (crear/editar)
export interface MinuteFormValues {
  start_time: string;
  end_time: string;
  tarea_realizada: string;
  novedades: string;
}

export const emptyMinuteFormValues: MinuteFormValues = {
  start_time: '',
  end_time: '',
  tarea_realizada: '',
  novedades: '',
};
