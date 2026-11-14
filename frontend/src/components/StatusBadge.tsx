import { DEMAND_STATUS_LABEL, ITEM_STATUS_LABEL } from '../lib/format';

type Status = keyof typeof ITEM_STATUS_LABEL | keyof typeof DEMAND_STATUS_LABEL | 'created' | 'urgent' | 'closed' | 'reimbursed' | 'unreimbursed';

const LABELS: Record<Status, string> = {
  ...ITEM_STATUS_LABEL,
  ...DEMAND_STATUS_LABEL,
  created: 'erstellt',
  urgent: 'dringend',
  closed: 'abgeschlossen',
  reimbursed: 'erstattet',
  unreimbursed: 'nicht erstattet',
};

/** Colored status label. */
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>;
}
