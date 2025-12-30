import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLockBodyScroll } from '@/hooks/use-mobile';

const BottomSheet = DialogPrimitive.Root;

const BottomSheetTrigger = DialogPrimitive.Trigger;

const BottomSheetPortal = DialogPrimitive.Portal;

const BottomSheetClose = DialogPrimitive.Close;

const BottomSheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
BottomSheetOverlay.displayName = 'BottomSheetOverlay';

interface BottomSheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Height of the sheet: 'auto' (content-based), 'half' (50vh), 'full' (90vh) */
  height?: 'auto' | 'half' | 'full';
  /** Whether to show the drag handle indicator */
  showHandle?: boolean;
  /** Whether to show the close button */
  showCloseButton?: boolean;
}

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  BottomSheetContentProps
>(({ className, children, height = 'auto', showHandle = true, showCloseButton = true, ...props }, ref) => {
  const heightClasses = {
    auto: 'max-h-[90vh]',
    half: 'h-[50vh]',
    full: 'h-[90vh]',
  };

  return (
    <BottomSheetPortal>
      <BottomSheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Base styles
          'fixed inset-x-0 bottom-0 z-50',
          'bg-background border-t border-border/50',
          'rounded-t-2xl shadow-2xl',
          'flex flex-col',
          // Safe area for notched devices
          'pb-[env(safe-area-inset-bottom,0)]',
          // Height
          heightClasses[height],
          // Animations
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'duration-300 ease-out',
          className
        )}
        {...props}
      >
        {/* Drag handle indicator */}
        {showHandle && (
          <div className="flex justify-center py-3 touch-none">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>
        )}
        
        {/* Close button */}
        {showCloseButton && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-2 opacity-70 ring-offset-background transition-all hover:opacity-100 hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none touch-target z-10">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
        
        {/* Content container */}
        <div className="flex-1 overflow-y-auto overscroll-contain scroll-touch px-4">
          {children}
        </div>
      </DialogPrimitive.Content>
    </BottomSheetPortal>
  );
});
BottomSheetContent.displayName = 'BottomSheetContent';

const BottomSheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left px-2 pb-4',
      className
    )}
    {...props}
  />
);
BottomSheetHeader.displayName = 'BottomSheetHeader';

const BottomSheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col gap-2 px-4 py-4 border-t border-border/50 mt-auto',
      'safe-bottom',
      className
    )}
    {...props}
  />
);
BottomSheetFooter.displayName = 'BottomSheetFooter';

const BottomSheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
BottomSheetTitle.displayName = 'BottomSheetTitle';

const BottomSheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
BottomSheetDescription.displayName = 'BottomSheetDescription';

// List item component optimized for bottom sheets
interface BottomSheetListItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  destructive?: boolean;
  disabled?: boolean;
}

const BottomSheetListItem = React.forwardRef<HTMLButtonElement, BottomSheetListItemProps>(
  ({ className, icon, label, description, destructive, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-3 rounded-lg',
        'text-left transition-colors touch-target no-tap-highlight',
        'hover:bg-muted/60 active:bg-muted',
        destructive && 'text-destructive hover:bg-destructive/10',
        disabled && 'opacity-50 pointer-events-none',
        className
      )}
      {...props}
    >
      {icon && (
        <span className={cn('flex-shrink-0', destructive ? 'text-destructive' : 'text-muted-foreground')}>
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className={cn('font-medium', destructive && 'text-destructive')}>
          {label}
        </div>
        {description && (
          <div className="text-sm text-muted-foreground truncate">
            {description}
          </div>
        )}
      </div>
    </button>
  )
);
BottomSheetListItem.displayName = 'BottomSheetListItem';

export {
  BottomSheet,
  BottomSheetPortal,
  BottomSheetOverlay,
  BottomSheetClose,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetListItem,
};
