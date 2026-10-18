// Excel de tareas de un cliente en un período: las que tuvieron horas en esas fechas
// (hechas o pendientes) y las que se terminaron en ellas.
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Task, TimeEntry } from '@/data/types';
import { dayKey, fromDayKey } from '@/lib/time';
import { plainName } from '@/lib/text';
import { minutesByTask } from './model';

export type ExportRow = {
  name: string;
  /** Day it was finished (yyyy-mm-dd); null while pending. */
  completed: string | null;
  due: string | null;
  /** Minutes worked inside the period. */
  minutes: number;
};

/**
 * Tasks to export for [fromKey, toKey] (both days included). A done task without
 * `completed_at` (finished before the field existed) takes its last session's day.
 */
export function exportRows(tasks: Task[], entries: TimeEntry[], fromKey: string, toKey: string, now: Date): ExportRow[] {
  const from = fromDayKey(fromKey);
  const to = addDays(fromDayKey(toKey), 1);
  const minutes = minutesByTask(entries, from, to, now);
  const last = new Map<string, string>();
  for (const e of entries) {
    const at = e.ended_at ?? e.started_at;
    if ((last.get(e.task_id) ?? '') < at) last.set(e.task_id, at);
  }
  const rows: ExportRow[] = [];
  for (const t of tasks) {
    const doneAt = t.archived ? (t.completed_at ?? last.get(t.id) ?? null) : null;
    const completed = doneAt ? dayKey(new Date(doneAt)) : null;
    const m = Math.round(minutes.get(t.id) ?? 0);
    const finishedInPeriod = completed != null && completed >= fromKey && completed <= toKey;
    if (m > 0 || finishedInPeriod) rows.push({ name: t.name, completed, due: t.due_date ?? null, minutes: m });
  }
  // Done first, in the order they were finished; then pending by name.
  return rows.sort(
    (a, b) =>
      Number(a.completed == null) - Number(b.completed == null) ||
      (a.completed ?? '').localeCompare(b.completed ?? '') ||
      a.name.localeCompare(b.name, 'es'),
  );
}

const longDay = (key: string) => format(fromDayKey(key), "d 'de' MMMM 'de' yyyy", { locale: es });

/** "Tareas Clínica Andina 2026-09-01 a 2026-09-30.xlsx", safe for any file system. */
export function exportFileName(clientName: string, fromKey: string, toKey: string): string {
  const name = plainName(clientName).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Cliente';
  return `Tareas ${name} ${fromKey} a ${toKey}.xlsx`;
}

/** Excel stores dates without a zone: write the calendar day as UTC midnight. */
const excelDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export async function exportTasksXlsx(clientName: string, fromKey: string, toKey: string, rows: ExportRow[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = (value: string) => ({ value, fontWeight: 'bold' as const, bottomBorderStyle: 'thin' as const });
  const DATE = 'dd/mm/yyyy';
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const data = [
    [{ value: `${plainName(clientName)} · Tareas del ${longDay(fromKey)} al ${longDay(toKey)}`, fontWeight: 'bold' as const, fontSize: 14 }],
    [],
    [head('Tarea'), head('Fecha de terminado'), head('Fecha de entrega'), { ...head('Horas en el período'), align: 'right' as const }, head('Entregable')],
    ...rows.map((r) => [
      { value: r.name },
      r.completed ? { value: excelDay(r.completed), type: Date, format: DATE, align: 'left' as const } : { value: 'Pendiente' },
      r.due ? { value: excelDay(r.due), type: Date, format: DATE, align: 'left' as const } : null,
      { value: r.minutes / 60, type: Number, format: '0.00' },
      { value: r.due ? 'Sí' : 'No' },
    ]),
    [{ value: 'Total', fontWeight: 'bold' as const, topBorderStyle: 'thin' as const }, null, null, { value: total / 60, type: Number, format: '0.00', fontWeight: 'bold' as const, topBorderStyle: 'thin' as const }, null],
  ];
  return writeXlsxFile(data, { sheet: 'Tareas', columns: [{ width: 48 }, { width: 20 }, { width: 18 }, { width: 20 }, { width: 12 }] }).toBlob();
}

/**
 * Hand the file to the user. On a phone the share sheet ("Guardar en Archivos",
 * Drive, WhatsApp…) is the reliable path; on the Mac it is a normal download.
 */
export async function deliverFile(blob: Blob, fileName: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type });
  const phone = window.matchMedia('(pointer: coarse)').matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      // Share failed for another reason: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
