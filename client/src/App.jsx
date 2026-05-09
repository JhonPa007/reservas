import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';

const Dashboard = React.lazy(() => import('./Dashboard'));
const PartnerView = React.lazy(() => import('./PartnerView'));
const TeamManager = React.lazy(() => import('./TeamManager'));
const Login = React.lazy(() => import('./Login'));

const ProtectedRoute = ({ children, requiredPermission }) => {
  const { user, loading, hasPermission } = useAuth();

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>Cargando...</div>;
  
  if (!user) return <Navigate to="/login" />;
  
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/" />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <React.Suspense fallback={<div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>Cargando...</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <ProtectedRoute requiredPermission="ver_reservas">
                <PartnerView />
              </ProtectedRoute>
            } />
            
            <Route path="/dashboard" element={
              <ProtectedRoute requiredPermission="ver_dashboard">
                <Dashboard />
              </ProtectedRoute>
            } />
            
            <Route path="/equipo" element={
              <ProtectedRoute requiredPermission="ver_equipo">
                <TeamManager />
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </React.Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
