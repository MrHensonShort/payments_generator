import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/ui/layout/AppShell';
import { ViewportGuard } from '@/ui/guards/ViewportGuard';
import KonfigurationPage from '@/ui/pages/KonfigurationPage';
import DauerauftraegePage from '@/ui/pages/DauerauftraegePage';
import EpisodischePage from '@/ui/pages/EpisodischePage';
import StreubuchungenPage from '@/ui/pages/StreubuchungenPage';
import TransaktionenPage from '@/ui/pages/TransaktionenPage';
import BackupExportPage from '@/ui/pages/BackupExportPage';

function App() {
  return (
    <ViewportGuard>
      <HashRouter>
        <Routes>
          <Route element={<AppShell dbStatus="connected" ruleCount={0} transactionCount={0} />}>
            <Route path="/" element={null} />
            <Route path="/konfiguration" element={<KonfigurationPage />} />
            <Route path="/dauerauftraege" element={<DauerauftraegePage />} />
            <Route path="/episodisch" element={<EpisodischePage />} />
            <Route path="/streubuchungen" element={<StreubuchungenPage />} />
            <Route path="/transaktionen" element={<TransaktionenPage />} />
            <Route path="/backup" element={<BackupExportPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ViewportGuard>
  );
}

export default App;
