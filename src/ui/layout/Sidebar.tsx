import { NavLink } from 'react-router-dom';
import { Settings, RefreshCcw, Zap, Shuffle, BarChart3, Archive, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/ui/components/separator';
import { useAllRuleCount } from '@/ui/hooks/useRules';
import { useTransactionCount } from '@/ui/hooks/useTransactions';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  testId: string;
  badge?: number;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface SidebarProps {
  dbStatus: 'connected' | 'error' | 'initializing';
}

export function Sidebar({ dbStatus }: SidebarProps) {
  const ruleCount = useAllRuleCount();
  const transactionCount = useTransactionCount();

  const navGroups: NavGroup[] = [
    {
      label: 'Konfiguration',
      items: [
        {
          to: '/konfiguration',
          label: 'Konfiguration',
          icon: <Settings className="h-4 w-4" />,
          testId: 'nav-tab-konfiguration',
        },
      ],
    },
    {
      label: 'Generierung',
      items: [
        {
          to: '/dauerauftraege',
          label: 'Daueraufträge',
          icon: <RefreshCcw className="h-4 w-4" />,
          testId: 'nav-tab-dauerauftraege',
          badge: ruleCount > 0 ? ruleCount : undefined,
        },
        {
          to: '/episodisch',
          label: 'Episodische Buchungen',
          icon: <Zap className="h-4 w-4" />,
          testId: 'nav-tab-episodisch',
        },
        {
          to: '/streubuchungen',
          label: 'Streubuchungen',
          icon: <Shuffle className="h-4 w-4" />,
          testId: 'nav-tab-streubuchungen',
        },
      ],
    },
    {
      label: 'Auswertung',
      items: [
        {
          to: '/transaktionen',
          label: 'Transaktionen',
          icon: <BarChart3 className="h-4 w-4" />,
          testId: 'nav-tab-transaktionen',
          badge: transactionCount > 0 ? transactionCount : undefined,
        },
      ],
    },
    {
      label: 'Verwaltung',
      items: [
        {
          to: '/backup',
          label: 'Backup & Export',
          icon: <Archive className="h-4 w-4" />,
          testId: 'nav-tab-backup',
        },
      ],
    },
  ];

  return (
    <aside className="flex h-full w-60 flex-col border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
          <span className="text-sm font-bold text-primary">PG</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Payments</p>
          <p className="text-xs text-muted-foreground">Generator</p>
        </div>
      </div>

      <Separator />

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    data-testid={item.testId}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:-translate-y-1/2 before:w-0.5 before:rounded-r before:bg-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )
                    }
                  >
                    {item.icon}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">
                        {item.badge > 999 ? '999+' : item.badge}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <Separator />

      {/* Footer – DB Status */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Database className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-xs text-muted-foreground">IndexedDB</span>
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            dbStatus === 'connected' && 'bg-[#10B981] animate-pulse-dot',
            dbStatus === 'initializing' && 'bg-amber-400 animate-pulse-dot',
            dbStatus === 'error' && 'bg-[#EF4444]',
          )}
          aria-label={'DB Status: ' + dbStatus}
        />
      </div>
    </aside>
  );
}
