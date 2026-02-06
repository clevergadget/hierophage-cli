import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Viz } from './pages/Viz';
import { Run } from './pages/Run';
import { Replay } from './pages/Replay';
import { Concepts } from './pages/Concepts';
import { TreeGuide } from './pages/TreeGuide';
import { Agents } from './pages/Agents';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="viz" element={<Viz />} />
          <Route path="run" element={<Run />} />
          <Route path="replay" element={<Replay />} />
          <Route path="concepts" element={<Concepts />} />
          <Route path="tree-guide" element={<TreeGuide />} />
          <Route path="agents" element={<Agents />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
