import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  dbStatus: 'connected' | 'error' | 'initializing';
}

export function AppShell({ dbStatus }: AppShellProps) {
  const { pathname } = useLocation();
  if (pathname === '/') {
    return <Navigate to="/konfiguration" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar dbStatus={dbStatus} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
