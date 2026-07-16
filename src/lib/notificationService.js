import { LocalNotifications } from '@capacitor/local-notifications';

export const NotificationService = {
  async requestPermissions() {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
    } catch (e) {
      console.error('Error requesting notification permissions', e);
    }
  },

  async scheduleOrderReminders(order) {
    if (!order || !order.due_date || !order.id) return;

    // Спершу видаляємо старі сповіщення для цього замовлення, якщо вони є
    await this.cancelOrderReminders(order.id);

    // Якщо наряд уже виконаний або скасований, не плануємо нагадувань
    const isInactive = ['Здано', 'Виконано', 'Скасовано', 'Скасований'].includes(order.status);
    if (isInactive) return;

    const dueDate = new Date(order.due_date);
    const now = new Date();

    const notifications = [];

    // 1. Нагадування за 24 години до дедлайну
    const reminder24h = new Date(dueDate.getTime());
    reminder24h.setDate(reminder24h.getDate() - 1);
    reminder24h.setHours(10, 0, 0, 0); // О 10 ранку за день до

    if (reminder24h > now) {
      notifications.push({
        id: Number(order.id) * 10 + 1,
        title: 'Завтра дедлайн! ⏳',
        body: `Наряд #${order.order_number} (${order.patient_name}) потрібно здати завтра`,
        schedule: { at: reminder24h },
        extra: { orderId: order.id }
      });
    }

    // 2. Нагадування в день дедлайну
    const reminderDayOf = new Date(dueDate.getTime());
    reminderDayOf.setHours(9, 0, 0, 0); // О 9 ранку в день здачі

    if (reminderDayOf > now) {
      notifications.push({
        id: Number(order.id) * 10 + 2,
        title: 'Сьогодні здача! 🔥',
        body: `Наряд #${order.order_number} (${order.patient_name}) має бути готовий сьогодні`,
        schedule: { at: reminderDayOf },
        extra: { orderId: order.id }
      });
    }

    if (notifications.length > 0) {
      try {
        await LocalNotifications.schedule({ notifications });
        console.log(`Scheduled ${notifications.length} reminders for order ${order.order_number}`);
      } catch (e) {
        console.error('Failed to schedule notifications', e);
      }
    }
  },

  async cancelOrderReminders(orderId) {
    if (!orderId) return;
    try {
      const id1 = Number(orderId) * 10 + 1;
      const id2 = Number(orderId) * 10 + 2;
      await LocalNotifications.cancel({ notifications: [{ id: id1 }, { id: id2 }] });
    } catch (e) {
      console.error('Error cancelling notifications', e);
    }
  }
};
