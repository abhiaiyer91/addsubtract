import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'muted';
}

const sizeConfig = {
  sm: {
    padding: 'py-8',
    iconContainer: 'p-3',
    iconSize: 'h-6 w-6',
    title: 'text-sm',
    description: 'text-xs max-w-[200px]',
  },
  md: {
    padding: 'py-12',
    iconContainer: 'p-4',
    iconSize: 'h-8 w-8',
    title: 'text-base',
    description: 'text-sm max-w-xs',
  },
  lg: {
    padding: 'py-16',
    iconContainer: 'p-5',
    iconSize: 'h-10 w-10',
    title: 'text-lg',
    description: 'text-sm max-w-sm',
  },
};

const variantConfig = {
  default: {
    iconBg: 'bg-muted/50',
    iconColor: 'text-muted-foreground/70',
  },
  success: {
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
  },
  muted: {
    iconBg: 'bg-muted/30',
    iconColor: 'text-muted-foreground/50',
  },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'md',
  variant = 'default',
}: EmptyStateProps) {
  const sizeStyles = sizeConfig[size];
  const variantStyles = variantConfig[variant];

  return (
    <div className={cn('flex flex-col items-center justify-center text-center', sizeStyles.padding, className)}>
      <div className={cn('mb-4 rounded-xl', sizeStyles.iconContainer, variantStyles.iconBg)}>
        <Icon className={cn(sizeStyles.iconSize, variantStyles.iconColor)} strokeWidth={1.5} />
      </div>
      <h3 className={cn('font-medium text-foreground', sizeStyles.title)}>{title}</h3>
      {description && (
        <p className={cn('text-muted-foreground mt-1.5 leading-relaxed', sizeStyles.description)}>
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
