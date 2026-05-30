import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const ALL_ITEMS = [
  { icon:'📊', label:'Dashboard',   path:'/',            roles:['admin','master','vendedor'] },
  { icon:'🎯', label:'Funil',       path:'/funil',       roles:['admin','master','vendedor'] },
  { icon:'🏭', label:'Produção',    path:'/producao',    roles:['admin','master'] },
  { icon:'💰', label:'Planos',      path:'/planos',      roles:['admin','master'] },
  { icon:'💵', label:'Comissões',   path:'/comissoes',   roles:['admin','master'] },
  { icon:'👥', label:'Vendedores',  path:'/admin',       roles:['admin','master'] },
];

export default function Sidebar() {
  const nav            = useNavigate();
  const { pathname }   = useLocation();
  const { user, logout, role } = useAuth();

  const items = ALL_ITEMS.filter(i => !i.roles || i.roles.includes(role) || i.roles.includes('vendedor'));

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" style={{ display:'flex', alignItems:'center', gap:10 }}>
        <img src="/logo-p.png" alt="P. Soluções"
          style={{ height:36, width:36, objectFit:'contain', flexShrink:0 }}
          onError={e => { e.target.src='/logo-icon.svg'; }} />
        <div>
          <h1>P. Funil</h1>
          <span>Gestão Comercial</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">Menu</div>
        {items.map(item => (
          <button
            key={item.path}
            className={`nav-item ${pathname === item.path ? 'active' : ''}`}
            onClick={() => nav(item.path)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        {role === 'vendedor' && (
          <div style={{
            margin:'12px 8px 0', padding:'8px 12px',
            background:'rgba(31,111,235,.1)', borderRadius:'var(--radius)',
            fontSize:11, color:'var(--accent)',
          }}>
            👤 Você está vendo apenas seus leads
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>{user?.name}</div>
        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>
          {role === 'vendedor' ? 'Vendedor' : 'Admin'}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout} style={{width:'100%'}}>
          Sair
        </button>
      </div>
    </aside>
  );
}
