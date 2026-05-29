import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const ITEMS = [
  { icon:'📊', label:'Dashboard',   path:'/' },
  { icon:'🎯', label:'Funil',       path:'/funil' },
  { icon:'🏭', label:'Produção',    path:'/producao' },
  { icon:'💰', label:'Planos',      path:'/planos' },
  { icon:'🔄', label:'Sync',        path:'/sync' },
];

export default function Sidebar() {
  const nav      = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>CRM Pezzutti</h1>
        <span>Gestão Comercial</span>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">Menu</div>
        {ITEMS.map(item => (
          <button
            key={item.path}
            className={`nav-item ${pathname === item.path ? 'active' : ''}`}
            onClick={() => nav(item.path)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
          {user?.name || user?.email}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout} style={{width:'100%'}}>
          Sair
        </button>
      </div>
    </aside>
  );
}
