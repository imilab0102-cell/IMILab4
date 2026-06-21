import { ORDER_STATUSES, STATUS_COLORS } from '@/lib/constants';
import OrderCard from './OrderCard';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function KanbanBoard({ orders, onOrderClick }) {
  const columns = ORDER_STATUSES.filter(s => s !== 'Скасований');

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
      {columns.map(status => {
        const statusOrders = orders.filter(o => o.status === status);
        const colorClasses = STATUS_COLORS[status] || '';
        return (
          <div key={status} className="flex-shrink-0 w-72 md:w-auto md:flex-1">
            <div className="mb-3 flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${colorClasses}`}>
                {status}
              </span>
              <span className="text-xs text-muted-foreground">{statusOrders.length}</span>
            </div>
            <div className="space-y-3 min-h-[200px] bg-muted/30 rounded-xl p-3">
              {statusOrders.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Немає нарядів</p>
              ) : (
                statusOrders.map(order => (
                  <OrderCard key={order.id} order={order} onClick={onOrderClick} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}