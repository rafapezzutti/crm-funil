import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import api from '../api';

const GROUPS = [
  { label:'Principal', items:[
    { icon:'📊', label:'Dashboard', path:'/',      roles:['admin','master','vendedor'] },
    { icon:'🎯', label:'Funil',     path:'/funil',      roles:['admin','master','vendedor'] },
    { icon:'📋', label:'Prospecção', path:'/prospeccao', roles:['admin','master','vendedor'] },
  ]},
  { label:'Gestão', items:[
    { icon:'🏭', label:'Produção',  path:'/producao',  roles:['admin','master'] },
    { icon:'💰', label:'Planos',    path:'/planos',    roles:['master'] },
    { icon:'💵', label:'Comissões', path:'/comissoes', roles:['admin','master'] },
  ]},
  { label:'Administração', items:[
    { icon:'👥', label:'Vendedores',    path:'/admin',           roles:['admin','master'] },
    { icon:'⚙️', label:'Configurações', path:'/configuracoes',   roles:['admin','master'] },
    { icon:'🤖', label:'Robôs',         path:'/robos',           roles:['admin','master'] },
    { icon:'🏢', label:'Empresas',      path:'/master/empresas', roles:['master'] },
  ]},
];

export default function Sidebar() {
  const nav          = useNavigate();
  const { pathname } = useLocation();
  const { user, logout, role, company, impersonating, exitImpersonation, impersonate } = useAuth();

  const [open, setOpen]             = useState({});
  const [allCompanies, setAll]      = useState([]);
  const [impOpen, setImpOpen]       = useState(false);
  const [compSearch, setCompSearch] = useState('');
  const impRef = useRef(null);

  const isOpen = l => open[l] === true;
  const toggle = l => setOpen(p => ({ ...p, [l]: !p[l] }));

  const groups = GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => !i.roles || i.roles.includes(role)) }))
    .filter(g => g.items.length);

  useEffect(() => {
    function handle(e) { if (impRef.current && !impRef.current.contains(e.target)) setImpOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    if (impOpen && role === 'master' && allCompanies.length === 0) {
      api.get('/master/companies').then(r => setAll(r.data)).catch(() => {});
    }
  }, [impOpen, role]);

  const filtered = allCompanies.filter(c =>
    c.id !== company?.id && c.name.toLowerCase().includes(compSearch.toLowerCase())
  );

  return (
    <aside className="sidebar">
      {/* Banner de impersonation */}
      {impersonating && (
        <div style={{
          background:'rgba(239,68,68,.2)', borderBottom:'1px solid rgba(239,68,68,.35)',
          padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <span style={{ fontSize:11, color:'#f87171', fontWeight:700 }}>
            🎭 Visualizando como cliente
          </span>
          <button onClick={exitImpersonation} style={{
            background:'rgba(239,68,68,.3)', border:'none', color:'#f87171',
            borderRadius:4, padding:'2px 8px', fontSize:11, cursor:'pointer', fontWeight:700,
          }}>Sair</button>
        </div>
      )}

      {/* Logo + nome da empresa */}
      <div className="sidebar-logo">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo-icon.svg" alt="P. Soluções"
            style={{ height:36, width:36, objectFit:'contain', flexShrink:0 }} />
          <div style={{ flex:1, minWidth:0 }}>
            <h1 style={{ margin:0, fontSize:14, fontWeight:700, lineHeight:1.2,
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {company?.name || 'P. Funil'}
            </h1>
            <span style={{ fontSize:10, color:'var(--muted)' }}>Gestão Comercial</span>
          </div>
        </div>

        {/* Botão entrar como cliente — logo abaixo do nome da empresa */}
        {role === 'master' && (
          <div ref={impRef} style={{ position:'relative', marginTop:10 }}>
            <button
              onClick={() => setImpOpen(o => !o)}
              style={{
                width:'100%', display:'flex', alignItems:'center', gap:8,
                padding:'7px 10px', borderRadius:8, cursor:'pointer', fontSize:12,
                background: impersonating ? 'rgba(239,68,68,.15)' : 'var(--card2)',
                border:'1px solid ' + (impersonating ? 'rgba(239,68,68,.35)' : 'var(--border)'),
                color: impersonating ? '#f87171' : 'var(--text)',
                fontWeight:600,
              }}
            >
              <span>🎭</span>
              <span style={{ flex:1, textAlign:'left' }}>
                {impersonating ? 'Sair da visualização' : 'Entrar como cliente'}
              </span>
              <span style={{ fontSize:9, opacity:.6 }}>{impOpen ? '▾' : '▸'}</span>
            </button>

            {impOpen && (
              <div style={{
                position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:999,
                background:'var(--card)', border:'1px solid var(--border)',
                borderRadius:10, boxShadow:'0 8px 30px rgba(0,0,0,.4)',
              }}>
                <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', fontSize:12, fontWeight:600 }}>
                  🎭 Selecione a empresa
                </div>
                <div style={{ padding:'8px 10px' }}>
                  <input
                    value={compSearch}
                    onChange={e => setCompSearch(e.target.value)}
                    placeholder="Buscar empresa…"
                    style={{ width:'100%', boxSizing:'border-box', fontSize:12, padding:'6px 8px', borderRadius:6 }}
                    autoFocus
                  />
                </div>
                <div style={{ maxHeight:220, overflowY:'auto', padding:'0 8px 8px' }}>
                  {filtered.length === 0 ? (
                    <div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:'12px 0' }}>
                      {allCompanies.length === 0 ? 'Carregando…' : 'Nenhuma empresa encontrada'}
                    </div>
                  ) : filtered.map(c => (
                    <button key={c.id}
                      onClick={() => { impersonate(c.id); setImpOpen(false); }}
                      style={{ width:'100%', textAlign:'left', padding:'8px 10px', borderRadius:8,
                        background:'none', border:'none', cursor:'pointer', display:'block' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--card2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{c.name}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>
                        {c.plan} · {c.total_leads} leads
                      </div>
                    </button>
                  ))}
                </div>
                {impersonating && (
                  <div style={{ padding:'8px 10px', borderTop:'1px solid var(--border)' }}>
                    <button onClick={() => { exitImpersonation(); setImpOpen(false); }}
                      style={{ width:'100%', padding:'7px', borderRadius:6, cursor:'pointer',
                        background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)',
                        color:'#f87171', fontSize:12, fontWeight:700 }}>
                      ← Voltar à minha conta
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {groups.map(g => (
          <div key={g.label}>
            <button className="nav-section" onClick={() => toggle(g.label)}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                width:'100%', background:'none', border:'none', cursor:'pointer' }}>
              <span>{g.label}</span>
              <span style={{ fontSize:9, opacity:.6 }}>{isOpen(g.label) ? '▾' : '▸'}</span>
            </button>
            {isOpen(g.label) && g.items.map(item => (
              <button key={item.path}
                className={'nav-item ' + (pathname === item.path ? 'active' : '')}
                onClick={() => nav(item.path)}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
        {role === 'vendedor' && (
          <div style={{ margin:'12px 8px 0', padding:'8px 12px', background:'rgba(31,111,235,.1)',
            borderRadius:'var(--radius)', fontSize:11, color:'var(--accent)' }}>
            👤 Você está vendo apenas seus leads
          </div>
        )}
      </nav>

      {/* Trial banner removido — modelo sem período de trial */}

      <div className="sidebar-footer">
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:2 }}>{user?.name}</div>
        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>
          {role === 'vendedor' ? 'Vendedor' : role === 'master' ? '⭐ Master' : 'Admin'}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout} style={{width:'100%'}}>Sair</button>
      </div>
    </aside>
  );
}
