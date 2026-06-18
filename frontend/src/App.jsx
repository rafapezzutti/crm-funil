import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { CrmTypesProvider } from './CrmTypesContext';
import Sidebar from './components/Sidebar';
import Login          from './pages/Login';
import Dashboard      from './pages/Dashboard';
import Funil          from './pages/Funil';
import LeadDetail     from './pages/LeadDetail';
import Producao       from './pages/Producao';
import Planos         from './pages/Planos';
import Admin          from './pages/Admin';
import Comissoes      from './pages/Comissoes';
import FillAssessment  from './pages/FillAssessment';
import Register        from './pages/Register';
import ForgotPassword  from './pages/ForgotPassword';
import ResetPassword   from './pages/ResetPassword';
import Settings        from './pages/Settings';
import Robos           from './pages/Robos';
import MasterEmpresas  from './pages/MasterEmpresas';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

function Shell({ children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">{children}</div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CrmTypesProvider>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<PrivateRoute><Shell><Dashboard /></Shell></PrivateRoute>} />
          <Route path="/funil" element={<PrivateRoute><Shell><Funil /></Shell></PrivateRoute>} />
          <Route path="/leads/:id" element={<PrivateRoute><Shell><LeadDetail /></Shell></PrivateRoute>} />
          <Route path="/producao" element={<PrivateRoute><Shell><Producao /></Shell></PrivateRoute>} />
          <Route path="/planos" element={<PrivateRoute><Shell><Planos /></Shell></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute><Shell><Admin /></Shell></PrivateRoute>} />
          <Route path="/comissoes"     element={<PrivateRoute><Shell><Comissoes /></Shell></PrivateRoute>} />
          <Route path="/configuracoes" element={<PrivateRoute><Shell><Settings /></Shell></PrivateRoute>} />
          <Route path="/robos"          element={<PrivateRoute><Shell><Robos /></Shell></PrivateRoute>} />
          <Route path="/master/empresas"   element={<PrivateRoute><Shell><MasterEmpresas /></Shell></PrivateRoute>} />
          <Route path="/avaliacao/:token"  element={<FillAssessment />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </CrmTypesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
