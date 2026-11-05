import type { Progress } from './lists';

const RADIUS = 6.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** How much of a project is done. Decorative unless it gets a label. */
export function ProgressRing({ progress, size = 16, label }: { progress?: Progress; size?: number; label?: string }) {
  const share = progress?.total ? progress.done / progress.total : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className="progress-ring" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <circle className="progress-ring-track" cx="8" cy="8" r={RADIUS} />
      {share > 0 && <circle className="progress-ring-value" cx="8" cy="8" r={RADIUS} strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`} transform="rotate(-90 8 8)" />}
    </svg>
  );
}
