import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const CRM_LABEL = { saude:'CRM Saúde', spa:'CRM Spa', esportes:'CRM Esportes', pet:'CRM Pet' };
const CRM_COLOR = { saude:'var(--crm-saude)', spa:'var(--crm-spa)', esportes:'var(--crm-esportes)', pet:'var(--crm-pet)' };
const SCORE_ICON = { muito_quente:'🔥', quente:'🌶️', morno:'⚡', frio:'💧', muito_frio:'❄️' };
const TIPO_ICON = {
  criacao:'✨', mudanca_etapa:'📍', ligacao:'📞', email:'✉️',
  whatsapp:'💬', demo:'🖥', proposta:'📄', obs:'💬', trial_criado:'🚀', convertido:'🏆', perdido:'❌',
};

function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function daysAgo(d) {
  const diff = Math.round((Date.now() - new Date(d)) / 86400000);
  return diff === 0 ? 'hoje' : diff === 1 ? 'ontem' : `${diff}d atrás`;
}

export default function Dashboard() {
  const nav = useNavigate();
  const [data,   setData]   = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/dashboard'), api.get('/dashboard/alerts')])
      .then(([d, a]) => { setData(d.data); setAlerts(a.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:300 }}>
      <span className="spinner">⏳</span>
    </div>
  );

  const stage = data?.byStage || {};
  const mrr   = data?.mrr    || {};

  const stages = [
    { key:'prospeccao', label:'Prospecção',  color:'var(--stage-prospeccao)', icon:'🎯' },
    { key:'negociacao', label:'Negociação',  color:'var(--stage-negociacao)', icon:'🤝' },
    { key:'piloto',     label:'Piloto',      color:'var(--stage-piloto)',     icon:'🧪' },
    { key:'producao',   label:'Produção',    color:'var(--stage-producao)',   icon:'🏭' },
    { key:'perdido',    label:'Perdidos',    color:'var(--stage-perdido)',    icon:'❌' },
    { key:'cancelado',  label:'Cancelados',  color:'var(--stage-cancelado)', icon:'🚫' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <span className="text-muted" style={{fontSize:13}}>Visão executiva da operação</span>
        </div>
        <button className="btn btn-primary" onClick={() => nav('/funil')}>
          🎯 Abrir Funil
        </button>
      </div>

      {/* KPIs por etapa */}
      <div className="kpi-grid">
        {stages.map(s => (
          <div key={s.key} className="kpi-card" style={{ borderLeft:`3px solid ${s.color}` }}>
            <div className="kpi-label">{s.icon} {s.label}</div>
            <div className="kpi-value" style={{ color: s.color }}>{stage[s.key] || 0}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
        {/* MRR */}
        <div className="card">
          <div className="section-title">💰 Receita Mensal Recorrente</div>
          <div style={{ fontSize:32, fontWeight:800, color:'var(--success)', marginBottom:12 }}>
            {fmt(mrr.total || 0)}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {['saude','spa','esportes','pet'].map(crm => (
              mrr[crm] > 0 && (
                <div key={crm} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background: CRM_COLOR[crm] }} />
                    <span style={{ fontSize:13 }}>{CRM_LABEL[crm]}</span>
                  </div>
                  <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>
                      {stage.producao ? Math.round((mrr[crm]/mrr.total)*100) : 0}%
                    </span>
                    <span style={{ fontWeight:700, color: CRM_COLOR[crm] }}>{fmt(mrr[crm])}</span>
                  </div>
                </div>
              )
            ))}
          </div>
          {data?.ticket > 0 && (
            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
              <span className="text-muted" style={{fontSize:12}}>Ticket médio:</span>
              <span style={{fontWeight:700, marginLeft:8}}>{fmt(data.ticket)}</span>
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className="card">
          <div className="section-title" style={{marginBottom:alerts.length?12:20}}>
            🔔 Alertas ({alerts.length})
          </div>
          {alerts.length === 0 ? (
            <div style={{ textAlign:'center', padding:'24px 0', color:'var(--muted)', fontSize:13 }}>
              ✅ Nenhum alerta pendente
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:260, overflowY:'auto' }}>
              {alerts.map((a, i) => (
                <div key={i}
                  className={`alert alert-${a.severity}`}
                  style={{ cursor:'pointer' }}
                  onClick={() => a.lead_id && nav(`/leads/${a.lead_id}`)}
                >
                  <span style={{flexShrink:0}}>
                    {a.tipo==='trial_vencido'?'⏰':a.tipo==='trial_vencendo'?'⚠️':a.tipo==='acao_atrasada'?'📅':'😶'}
                  </span>
                  <span style={{fontSize:12, lineHeight:1.4}}>{a.descricao}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Testes próximos do vencimento */}
        {data?.trials?.length > 0 && (
          <div className="card">
            <div className="section-title">🧪 Pilotos em Atenção</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {data.trials.map(t => (
                <div key={t.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer'}}
                  onClick={() => nav(`/leads/${t.id}`)}>
                  <div>
                    <div style={{fontWeight:600, fontSize:13}}>{t.empresa || t.nome}</div>
                    <div style={{fontSize:11, color:'var(--muted)'}}>
                      {t.dias_restantes < 0
                        ? `Vencido há ${Math.abs(Math.round(t.dias_restantes))} dias`
                        : `Vence em ${Math.round(t.dias_restantes)} dias`}
                    </div>
                  </div>
                  <span className={`badge badge-${t.dias_restantes < 0 ? 'perdido':'piloto'}`}>
                    {t.dias_restantes < 0 ? 'Vencido' : 'Atenção'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feed de atividades recentes */}
        <div className="card" style={{gridColumn: data?.trials?.length > 0 ? 'auto' : '1/-1'}}>
          <div className="section-title">📋 Atividades Recentes</div>
          {!data?.recentActivity?.length ? (
            <div style={{color:'var(--muted)', fontSize:13, textAlign:'center', padding:'16px 0'}}>Sem atividades recentes.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:280, overflowY:'auto' }}>
              {data.recentActivity.map(a => (
                <div key={a.id} style={{ display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer' }}
                  onClick={() => nav(`/leads/${a.lead_id}`)}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--card2)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                    {TIPO_ICON[a.tipo] || '💬'}
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontWeight:600, fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                      {a.lead_empresa || a.lead_nome}
                    </div>
                    <div style={{fontSize:12, color:'var(--muted)', lineHeight:1.4}}>{a.descricao}</div>
                  </div>
                  <div style={{fontSize:11, color:'var(--muted)', flexShrink:0, whiteSpace:'nowrap'}}>
                    {daysAgo(a.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
