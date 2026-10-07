import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { BarChart3, Home, Plus, UserRound, WifiOff } from 'lucide-react';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/log', label: 'Log', icon: Plus, primary: true },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/profile', label: 'Profile', icon: UserRound },
] as const;

export function AppShell() {
  const online = useOnline();
  const { pathname } = useLocation();
  // Block body on purpose: newer browsers return a Promise from scrollTo(), and an effect
  // must return nothing or a cleanup function.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-28">
      {!online && (
        <div
          className="sticky top-0 z-30 flex items-center gap-2 bg-ink px-4 py-2 text-[13px] font-bold text-white"
          role="status"
        >
          <WifiOff className="size-4" aria-hidden />
          You’re offline — logging still works and syncs later.
        </div>
      )}
      <main className="px-4 pt-[max(env(safe-area-inset-top),1rem)]">
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-line bg-bg/95 backdrop-blur safe-bottom"
      >
        <ul className="grid grid-cols-4 px-2 pt-2">
          {TABS.map((tab) => (
            <li key={tab.to} className="flex justify-center">
              <NavLink
                to={tab.to}
                end={'end' in tab ? tab.end : false}
                className={({ isActive }) =>
                  `flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-2 py-1 text-[11px] font-extrabold transition ${
                    isActive ? 'text-primary-ink' : 'text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {'primary' in tab ? (
                      <span
                        className={`-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-float transition active:scale-95 ${
                          isActive ? 'ring-4 ring-primary-soft' : ''
                        }`}
                      >
                        <tab.icon className="size-7" strokeWidth={2.6} aria-hidden />
                      </span>
                    ) : (
                      <tab.icon className="size-6" strokeWidth={isActive ? 2.6 : 2} aria-hidden />
                    )}
                    <span>{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
