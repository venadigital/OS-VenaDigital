import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { selectedLabel, SelectToggle, useSelectionCtx } from './selection';

/**
 * Back to the list of views, where the views don't fit beside the content; there "Seleccionar" goes
 * beside it, and while choosing the count takes its place.
 */
export function NotasBack({ selectable = false }: { selectable?: boolean }) {
  const selection = useSelectionCtx();
  return (
    <div className="notas-top">
      {selection.on ? (
        <span className="notas-top-count tnum">{selectedLabel(selection.ids.size)}</span>
      ) : (
        <Link to="/notas" className="notas-back">
          <ChevronLeft size={22} aria-hidden />
          Notas
        </Link>
      )}
      {(selectable || selection.on) && <SelectToggle />}
    </div>
  );
}
