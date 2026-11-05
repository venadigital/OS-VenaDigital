import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Back to the list of views, where the views don't fit beside the content. */
export function NotasBack() {
  return (
    <Link to="/notas" className="notas-back">
      <ChevronLeft size={22} aria-hidden />
      Notas
    </Link>
  );
}
