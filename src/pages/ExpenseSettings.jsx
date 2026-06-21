import PageHeader from '@/components/PageHeader';
import CostCalculator from '@/components/CostCalculator';

export default function ExpenseSettings() {

  return (
    <div>
      <PageHeader title="Калькулятор собівартості" subtitle="Розраховування прибутку та рентабельності" />
      <CostCalculator />
    </div>
  );
}