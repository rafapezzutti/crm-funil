import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import api from '../api';

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
    { icon:'⚙️', label:'Configurações', path:'/configuracoes',  roles:['admin','master'] },
    { icon:'🤖', label:'Robôs',           path:'/robos',          roles:['admin','master'] },
  ]},
  { label:'Master', items:[
    { icon:'🏢', label:'Empresas',   path:'/master/empresas',  roles:['master'] },
  ]},
];

export default function Sidebar() {
  const nav            = useNavigate();
  const { pathname }   = useLocation();
  const { user, logout, role, company, impersonating, exitImpersonation, impersonate } = useAuth();

  const [open, setOpen] = useState({});
  const [allCompanies, setAllCompanies] = useState([]);
  const [impModal, setImpModal] = useState(false);

  const isOpen = (l) => open[l] === true;
  const toggle = (l) => setOpen(p => ({ ...p, [l]: !p[l] }));

  const groups = GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || i.roles.includes(role)) }))
    .filter(g => g.items.length);

  useEffect(() => {
    if (role === 'master' && impModal && allCompanies.length === 0) {
      api.get('/master/companies')
        .then(r => setAllCompanies(r.data))
        .catch(() => {});
    }
  }, [impModal, role]);

  return (
    <aside className="sidebar">
      {/* Banner impersonation */}
      {impersonating && (
        <div style={{
          background:'rgba(239,68,68,.2)', borderBottom:'1px solid rgba(239,68,68,.4)',
          padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <span style={{ fontSize:11, color:'#f87171', fontWeight:700 }}>
            🎭 Visualizando: {company?.name}
          </span>
          <button onClick={exitImpersonation} style={{
            background:'rgba(239,68,68,.3)', border:'none', color:'#f87171',
            borderRadius:4, padding:'2px 8px', fontSize:11, cursor:'pointer', fontWeight:700,
          }}>
            Sair
          </button>
        </div>
      )}

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

        {/* Botão de impersonation para master */}
        {role === 'master' && !impersonating && (
          <div style={{ padding:'8px 8px 0' }}>
            <button
              className="btn btn-ghost"
              style={{ width:'100%', fontSize:12, justifyContent:'flex-start', gap:8 }}
              onClick={() => setImpModal(true)}
            >
              🎭 Entrar como cliente
            </button>
          </div>
        )}

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

      {/* Trial banner */}
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
            <div style={{ color:'var(--muted)', marginTop:2 }}>Fale com a gente para assinar.</div>
          </div>
        );
      })()}

      <div className="sidebar-footer">
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>{user?.name}</div>
        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>
          {role === 'vendedor' ? 'Vendedor' : role === 'master' ? 'Master' : 'Admin'}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout} style={{width:'100%'}}>
          Sair
        </button>
      </div>

      {/* Modal de seleção de empresa para impersonation */}
      {impModal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setImpModal(false)}>
          <div className="modal" style={{ maxWidth:500, maxHeight:'80vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2>🎭 Entrar como cliente</h2>
              <button className="close-btn" onClick={() => setImpModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
                Selecione uma empresa para visualizar o sistema no contexto dela. Você poderá sair a qualquer momento.
              </div>
              {allCompanies.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--muted)', padding:24 }}>Carregando…</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {allCompanies
                    .filter(c => c.id !== company?.id)
                    .map(c => (
                    <button key={c.id}
                      onClick={() => { impersonate(c.id); setImpModal(false); }}
                      style={{
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'12px 16px', borderRadius:8, background:'var(--card2)',
                        border:'1px solid var(--border)', cursor:'pointer', textAlign:'left',
                        width:'100%',
                      }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14 }}>{c.name}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          {c.plan} · {c.total_leads} leads · {c.total_robots} robôs
                        </div>
                      </div>
                      <span style={{ fontSize:18 }}>→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
