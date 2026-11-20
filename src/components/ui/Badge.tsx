import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: 'mint' | 'danger' | 'warning' | 'neutral' | 'info';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  icon,
  className = '',
  ...props
}) => {
  const variantClasses = {
    mint: 'bg-teal-500/15 text-teal-300 border-teal-500/30 shadow-sm shadow-teal-500/10',
    danger: 'bg-red-500/15 text-red-300 border-red-500/30 shadow-sm shadow-red-500/10',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-sm shadow-amber-500/10',
    neutral: 'bg-white/[0.06] text-slate-300 border-white/[0.08]',
    info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 rounded-full gap-1',
    md: 'text-xs font-medium px-2.5 py-1 rounded-full gap-1.5',
  };

  return (
    <span
      className={`inline-flex items-center border font-sans tracking-wide uppercase ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
};

export default Badge;
