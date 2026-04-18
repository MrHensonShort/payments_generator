import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

interface AppShellProps {
  dbStatus: 'connected' | 'error' | 'initializing';
  ruleCount?: number;
  transactionCount?: number;
}

export function AppShell({ dbStatus, ruleCount, transactionCount }: AppShellProps) {
  const { pathname } = useLocation();
  if (pathname === '/') {
    return <Navigate to="/konfiguration" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar dbStatus={dbStatus} ruleCount={ruleCount} transactionCount={transactionCount} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
