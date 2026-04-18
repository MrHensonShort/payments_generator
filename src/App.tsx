import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/ui/layout/AppShell';
import { ViewportGuard } from '@/ui/guards/ViewportGuard';
import KonfigurationPage from '@/ui/pages/KonfigurationPage';
import DauerauftraegePage from '@/ui/pages/DauerauftraegePage';
import EpisodischePage from '@/ui/pages/EpisodischePage';
import StreubuchungenPage from '@/ui/pages/StreubuchungenPage';
import TransaktionenPage from '@/ui/pages/TransaktionenPage';
import BackupExportPage from '@/ui/pages/BackupExportPage';
import { useAllRuleCount } from '@/ui/hooks/useRules';
import { useTransactionCount } from '@/ui/hooks/useTransactions';

function AppWithCounts() {
  const ruleCount = useAllRuleCount();
  const transactionCount = useTransactionCount();

  return (
    <Routes>
      <Route
        element={
          <AppShell
            dbStatus="connected"
            ruleCount={ruleCount}
            transactionCount={transactionCount}
          />
        }
      >
        <Route path="/" element={null} />
        <Route path="/konfiguration" element={<KonfigurationPage />} />
        <Route path="/dauerauftraege" element={<DauerauftraegePage />} />
        <Route path="/episodisch" element={<EpisodischePage />} />
        <Route path="/streubuchungen" element={<StreubuchungenPage />} />
        <Route path="/transaktionen" element={<TransaktionenPage />} />
        <Route path="/backup" element={<BackupExportPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <ViewportGuard>
      <HashRouter>
        <AppWithCounts />
      </HashRouter>
    </ViewportGuard>
  );
}

export default App;
