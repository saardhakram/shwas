import React from 'react';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'mint' | 'danger' | 'warning' | 'subtle';
  interactive?: boolean;
  className?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  variant = 'default',
  interactive = false,
  className = '',
  ...props
}) => {
  const variantStyles = {
    default: 'bg-surface-panel/70 border-white/[0.08] shadow-lg shadow-black/40',
    mint: 'bg-surface-mint-card/75 border-teal-500/30 shadow-lg shadow-teal-950/40',
    danger: 'bg-surface-danger-card/75 border-red-500/30 shadow-lg shadow-red-950/40',
    warning: 'bg-surface-warning-card/75 border-amber-500/30 shadow-lg shadow-amber-950/40',
    subtle: 'bg-white/[0.03] border-white/[0.05] shadow-md',
  };

  const interactiveStyles = interactive
    ? 'transition-all duration-200 hover:-translate-y-0.5 hover:bg-opacity-90 cursor-pointer active:scale-[0.99]'
    : '';

  return (
    <div
      className={`relative backdrop-blur-xl rounded-2xl border p-4 ${variantStyles[variant]} ${interactiveStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default GlassCard;
