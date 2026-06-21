import { STATUS_COLORS } from '@/lib/constants';

export default function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors}`}>
      {status}
    </span>
  );
}