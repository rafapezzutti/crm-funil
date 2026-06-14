import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';

export default function MasterEmpresas() {
  const { role, impersonate } = useAuth();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (role !== 'master') { navigate('/'); return; }
    api.get('/master/companies')
      .then(r => setCompanies(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function planBadge(plan) {
    const color = plan === 'trial' ? 'var(--warning)' : plan === 'ativo' ? 'var(--success)' : 'var(--muted)';
    return <span style={{ fontSize:11, fontWeight:700, color, textTransform:'uppercase' }}>{plan}</span>;
  }

  function trialDias(ends_at) {
    if (!ends_at) return null;
    const d = Math.ceil((new Date(ends_at) - Date.now()) / 86400000);
    if (d <= 0) return <span style={{ fontSize:11, color:'var(--danger)' }}>Expirado</span>;
    return <span style={{ fontSize:11, color: d <= 3 ? 'var(--danger)' : 'var(--muted)' }}>{d}d restantes</span>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🏢 Empresas</h1>
          <span className="text-muted" style={{ fontSize:13 }}>{companies.length} clientes cadastrados</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>Carregando…</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {companies.map(c => (
            <div key={c.id} className="card" style={{ padding:'14px 20px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{c.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)', fontFamily:'monospace' }}>{c.id}</div>
              </div>
              <div style={{ display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Plano</div>
                  <div>{planBadge(c.plan)}</div>
                  {c.plan === 'trial' && <div>{trialDias(c.trial_ends_at)}</div>}
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Leads</div>
                  <div style={{ fontWeight:700 }}>{c.total_leads}</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Robôs</div>
                  <div style={{ fontWeight:700 }}>{c.total_robots}</div>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize:12 }}
                onClick={() => impersonate(c.id)}>
                🎭 Entrar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
