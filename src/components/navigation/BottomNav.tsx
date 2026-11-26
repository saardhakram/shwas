import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ScanEye, Route, Users2, MessageSquareHeart } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const { t } = useTranslation();

  const navItems = [
    {
      to: '/today',
      label: t('nav.today', 'Today'),
      icon: CalendarDays,
    },
    {
      to: '/scan',
      label: t('nav.scan', 'Scan'),
      icon: ScanEye,
    },
    {
      to: '/routes',
      label: t('nav.routes', 'Routes'),
      icon: Route,
    },
    {
      to: '/community',
      label: t('nav.community', 'Community'),
      icon: Users2,
    },
    {
      to: '/ask',
      label: t('nav.ask', 'Ask Shwas'),
      icon: MessageSquareHeart,
    },
  ];

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-nav/95 backdrop-blur-xl border-t border-white/[0.08] shadow-[0_-8px_30px_rgba(0,0,0,0.5)]"
    >
      <div className="max-w-md mx-auto px-2 py-2 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `group relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                  isActive ? 'text-teal-400 font-medium' : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`relative p-1 rounded-xl transition-transform duration-200 ${
                      isActive
                        ? 'bg-teal-500/15 -translate-y-0.5 text-teal-400 ring-1 ring-teal-500/30 shadow-sm shadow-teal-500/30'
                        : 'group-hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon
                      className="w-5 h-5 transition-transform duration-200 group-active:scale-90"
                      aria-hidden="true"
                    />
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_8px_theme(colors.mint.DEFAULT)]"
                      />
                    )}
                  </div>
                  <span className="text-[10px] tracking-tight mt-1 leading-none">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
