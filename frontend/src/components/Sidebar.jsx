import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';

const GROUPS = [
  { label:'Principal', items:[
    { icon:'📊', label:'Dashboard', path:'/',      roles:['admin','master','vendedor'] },
    { icon:'🎯', label:'Funil',     path:'/funil', roles:['admin','master','vendedor'] },
  ]},
  { label:'Gestão', items:[
    { icon:'🏭', label:'Produção',  path:'/producao',  roles:['admin','master'] },
    { icon:'💰', label:'Planos',    path:'/planos',    roles:['admin','master'] },
    { icon:'💵', label:'Comissões', path:'/comissoes', roles:['admin','master'] },
  ]},
  { label:'Administração', items:[
    { icon:'👥', label:'Vendedores',    path:'/admin',          roles:['admin','master'] },
    { icon:'⚙️', label:'Configurações', path:'/configuracoes',  roles:['admin'] },
    { icon:'🤖', label:'Robôs',           path:'/robos',          roles:['admin'] },
  ]},
];

export default function Sidebar() {
  const nav            = useNavigate();
  const { pathname }   = useLocation();
  const { user, logout, role, company } = useAuth();

  const [open, setOpen] = useState({});
  const isOpen = (l) => open[l] === true;
  const toggle = (l) => setOpen(p => ({ ...p, [l]: !p[l] }));

  const groups = GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || i.roles.includes(role)) }))
    .filter(g => g.items.length);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" style={{ display:'flex', alignItems:'center', gap:10 }}>
        <img src="/logo-icon.svg" alt="P. Soluções"
          style={{ height:36, width:36, objectFit:'contain', flexShrink:0 }} />
        <div>
          <h1>P. Funil</h1>
          <span>Gestão Comercial</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {groups.map(g => (
          <div key={g.label}>
            <button
              className="nav-section"
              onClick={() => toggle(g.label)}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', background:'none', border:'none', cursor:'pointer' }}
            >
              <span>{g.label}</span>
              <span style={{ fontSize:9, opacity:.6 }}>{isOpen(g.label) ? '▾' : '▸'}</span>
            </button>
            {isOpen(g.label) && g.items.map(item => (
              <button
                key={item.path}
                className={`nav-item ${pathname === item.path ? 'active' : ''}`}
                onClick={() => nav(item.path)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
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

      {/* Banner de trial */}
      {(() => {
        const trialEnd = company?.trial_ends_at;
        if (!trialEnd || company?.plan !== 'trial') return null;
        const dias = Math.ceil((new Date(trialEnd) - Date.now()) / 86400000);
        if (dias <= 0) return (
          <div style={{ margin:'8px 8px 0', padding:'10px 12px', background:'rgba(239,68,68,.15)',
            borderRadius:'var(--radius)', border:'1px solid rgba(239,68,68,.3)', fontSize:11 }}>
            <div style={{ color:'#f87171', fontWeight:700 }}>⚠️ Trial expirado</div>
            <div style={{ color:'var(--muted)', marginTop:2 }}>Entre em contato para continuar.</div>
          </div>
        );
        if (dias > 14) return null;
        const cor = dias <= 3 ? 'rgba(239,68,68,.15)' : 'rgba(251,191,36,.1)';
        const txt = dias <= 3 ? '#f87171' : 'var(--warning)';
        return (
          <div style={{ margin:'8px 8px 0', padding:'10px 12px', background:cor,
            borderRadius:'var(--radius)', border:`1px solid ${txt}40`, fontSize:11 }}>
            <div style={{ color:txt, fontWeight:700 }}>⏳ {dias} dia{dias!==1?'s':''} de trial</div>
            <div style={{ color:'var(--muted)', marginTop:2 }}>
              Fale com a gente para assinar.
            </div>
          </div>
        );
      })()}

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
