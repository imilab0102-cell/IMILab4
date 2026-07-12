import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { isSameDay, parseISO } from "date-fns"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { STATUS_COLORS } from "@/lib/constants"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  orders = [], // Приймаємо масив нарядів з батьківського компонента
  ...props
}) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-muted-foreground rounded-md w-8 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-md"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 p-0 font-normal aria-selected:opacity-100 relative flex flex-col justify-center items-center"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ className, ...props }) => (
          <ChevronLeft className={cn("h-4 w-4", className)} {...props} />
        ),
        IconRight: ({ className, ...props }) => (
          <ChevronRight className={cn("h-4 w-4", className)} {...props} />
        ),
        // Кастомний рендеринг вмісту клітинки дня для відображення нарядів
        DayContent: ({ date, ...props }) => {
          // Шукаємо наряди на цей конкретний день
          const dayOrders = React.useMemo(() => {
            if (!Array.isArray(orders)) return [];
            return orders.filter(o => o && o.due_date && isSameDay(parseISO(o.due_date), date));
          }, [orders, date]);

          return (
            <div className="w-full h-full flex flex-col items-center justify-center relative pt-1">
              {/* Число дня */}
              <span className="text-xs">{date.getDate()}</span>
              
              {/* Індикатори нарядів (крапки) */}
              {dayOrders.length > 0 && (
                <div className="absolute bottom-0.5 flex gap-0.5 justify-center max-w-full overflow-hidden px-0.5">
                  {dayOrders.slice(0, 3).map((order, i) => {
                    // Витягуємо колір фону з констант STATUS_COLORS
                    // Наприклад: "bg-green-100 text-green-800" -> беремо лише класи кольору або ставимо дефолтну сіру
                    const statusClass = STATUS_COLORS[order.status] || "bg-gray-400";
                    // Оскільки нам потрібна просто маленька крапка, очистимо текст-класи, якщо вони заважають
                    const dotColor = statusClass.split(' ')[0] || "bg-gray-400";

                    return (
                      <span 
                        key={order.id || i} 
                        className={cn("w-1 h-1 rounded-full shrink-0", dotColor)}
                        title={`${order.patient_name || 'Наряд'} (${order.status || ''})`}
                      />
                    );
                  })}
                  {/* Якщо нарядів більше 3-х, показуємо крихітний плюсик або загальну точку */}
                  {dayOrders.length > 3 && (
                    <span className="text-[7px] leading-[4px] font-bold text-muted-foreground">+</span>
                  )}
                </div>
              )}
            </div>
          );
        }
      }}
      {...props} 
    />
  );
}
Calendar.displayName = "Calendar"

export { Calendar }