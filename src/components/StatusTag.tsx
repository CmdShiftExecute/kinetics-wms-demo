import type { ReplenishmentStatus } from '../../data/schema';
import { STATUS_LABEL, cx } from '../lib/format';

/** The replenishment status as a bordered tag; hazard only when an order is overdue. */
export function StatusTag({ s }: { s: ReplenishmentStatus }) {
  return <span className={cx('tag', s === 'below' && 'hz')} style={{ marginLeft: 0 }}>{STATUS_LABEL[s]}</span>;
}
