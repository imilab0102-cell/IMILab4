import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [orders, externalLabOrders] = await Promise.all([
      base44.asServiceRole.entities.WorkOrder.list(),
      base44.asServiceRole.entities.ExternalLabOrder.list(),
    ]);

    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: {
        orders: orders || [],
        externalLabOrders: externalLabOrders || [],
      },
      summary: {
        ordersCount: (orders || []).length,
        externalLabOrdersCount: (externalLabOrders || []).length,
      },
    };

    return Response.json(backup);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});