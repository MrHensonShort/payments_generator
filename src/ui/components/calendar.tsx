import * as React from 'react';
import { DayPicker } from 'react-day-picker';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      locale={de}
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        month_caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium text-foreground',
        nav: 'flex items-center gap-1',
        button_previous:
          'absolute left-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
        button_next:
          'absolute right-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground transition-colors',
        month_grid: 'w-full border-collapse space-y-1',
        weekdays: 'flex',
        weekday: 'text-muted-foreground rounded-md w-9 font-normal text-xs',
        week: 'flex w-full mt-2',
        day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day_button:
          'inline-flex items-center justify-center h-9 w-9 rounded-md text-sm font-normal text-foreground hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
        selected:
          'bg-primary text-primary-foreground rounded-md hover:bg-primary hover:text-primary-foreground',
        today: 'border border-primary text-primary',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50 cursor-not-allowed',
        range_middle: 'aria-selected:bg-accent aria-selected:text-accent-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}

Calendar.displayName = 'Calendar';
export { Calendar };
