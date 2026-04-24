import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
const Dashboard = React.lazy(() => import('./Dashboard'));
const PartnerView = React.lazy(() => import('./PartnerView'));
const TeamManager = React.lazy(() => import('./TeamManager'));

function App() {
  return (
    <BrowserRouter>
      <React.Suspense fallback={<div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Cargando...</div>}>
        <Routes>
          <Route path="/" element={<PartnerView />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/equipo" element={<TeamManager />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  );
}

export default App;
