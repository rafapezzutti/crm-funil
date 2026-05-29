import { useState } from 'react';
import api from '../api';

export default function Sync() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [err,     setErr]     = useState('');

  async function runSync() {
    setLoading(true); setErr(''); setResults(null);
    try {
      const { data } = await api.post('/sync/run');
      setResults(data.results);
    } catch(e) { setErr(e.response?.data?.error || 'Erro ao sincronizar.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="page" style={{maxWidth:600}}>
      <div className="page-header">
        <div>
          <h1>🔄 Sincronização</h1>
          <span className="text-muted" style={{fontSize:13}}>
            Importa clientes ativos dos CRMs externos para Produção
          </span>
        </div>
      </div>

      <div className="card" style={{marginBottom:20}}>
        <p style={{fontSize:13, color:'var(--muted)', marginBottom:20, lineHeight:1.6}}>
          A sincronização importa automaticamente os clientes ativos dos CRMs Saúde, Spa e Esportes
          para a etapa <strong>Produção</strong> do funil de vendas. Clientes já existentes (por nome,
          e-mail ou telefone) não são duplicados.
        </p>
        <button className="btn btn-primary" onClick={runSync} disabled={loading}>
          {loading ? <><span className="spinner">⏳</span> Sincronizando…</> : '🔄 Executar Sync Agora'}
        </button>
      </div>

      {err && <div className="alert alert-high" style={{marginBottom:16}}>{err}</div>}

      {results && (
        <div className="card">
          <div className="section-title">Resultado</div>
          <div style={{display:'flex', flexDirection:'column', gap:10}}>
            {results.map((r, i) => (
              <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'10px 14px', background:'var(--card2)', borderRadius:'var(--radius)',
                border:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontWeight:600, fontSize:13}}>
                    {r.source?.toUpperCase() || 'Fonte'}
                    {r.skipped && <span style={{color:'var(--muted)', fontWeight:'normal', fontSize:11, marginLeft:8}}>· não configurado</span>}
                    {r.error   && <span style={{color:'var(--danger)', fontWeight:'normal', fontSize:11, marginLeft:8}}>· erro</span>}
                  </div>
                  {r.reason && <div style={{fontSize:11, color:'var(--muted)'}}>{r.reason}</div>}
                  {r.error   && <div style={{fontSize:11, color:'var(--danger)'}}>{r.error}</div>}
                </div>
                {r.imported != null && (
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:700, color:'var(--success)', fontSize:16}}>{r.imported}</div>
                    <div style={{fontSize:11, color:'var(--muted)'}}>importados de {r.total}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
