import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workOrderId } = await req.json();

    if (!workOrderId) {
      return Response.json({ error: 'workOrderId is required' }, { status: 400 });
    }

    // Fetch the work order
    const workOrder = await base44.entities.WorkOrder.get(workOrderId);

    if (!workOrder) {
      return Response.json({ error: 'Work order not found' }, { status: 404 });
    }

    const totalAmount = workOrder.total_amount || 0;
    const stages = workOrder.technology_stages || [];

    // Calculate payment for each stage
    const calculatedStages = stages.map(stage => {
      let calculatedAmount = 0;

      if (stage.payment_type === 'fixed') {
        // Fixed amount
        calculatedAmount = stage.payment_value;
      } else if (stage.payment_type === 'percentage') {
        // Percentage of total amount
        calculatedAmount = (totalAmount * stage.payment_value) / 100;
      }

      return {
        ...stage,
        calculated_amount: Math.round(calculatedAmount * 100) / 100, // Round to 2 decimals
      };
    });

    // Calculate totals
    const totalTechnicianPay = calculatedStages.reduce(
      (sum, stage) => sum + (stage.calculated_amount || 0),
      0
    );
    const labGrossProfit = totalAmount - totalTechnicianPay;

    // Group by technician for summary
    const technicianSummary = {};
    calculatedStages.forEach(stage => {
      if (!technicianSummary[stage.technician_id]) {
        technicianSummary[stage.technician_id] = {
          technician_id: stage.technician_id,
          technician_name: stage.technician_name,
          total_pay: 0,
          stages: [],
        };
      }
      technicianSummary[stage.technician_id].total_pay += stage.calculated_amount;
      technicianSummary[stage.technician_id].stages.push({
        stage_name: stage.stage_name,
        amount: stage.calculated_amount,
      });
    });

    const result = {
      workOrderId,
      total_order_amount: totalAmount,
      technology_stages: calculatedStages,
      technician_summary: Object.values(technicianSummary),
      total_technician_pay: Math.round(totalTechnicianPay * 100) / 100,
      lab_gross_profit: Math.round(labGrossProfit * 100) / 100,
      profit_margin_percent: totalAmount > 0 ? ((labGrossProfit / totalAmount) * 100).toFixed(2) : 0,
    };

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});