import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm placeholder-gray-400',
        'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
        'disabled:bg-gray-50 disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm placeholder-gray-400',
        'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
        'disabled:bg-gray-50 disabled:cursor-not-allowed resize-y min-h-[80px]',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm',
        'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
        'disabled:bg-gray-50 disabled:cursor-not-allowed appearance-none bg-no-repeat bg-right pr-10',
        className
      )}
      {...props}
    />
  )
);
Select.displayName = 'Select';