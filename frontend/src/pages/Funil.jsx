import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import LeadModal from '../components/LeadModal';
import { useCrmTypes } from '../CrmTypesContext';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../AuthContext';

const STAGES = [
  { key:'prospeccao', label:'Prospecção',  color:'var(--stage-prospeccao)', icon:'🎯' },
  { key:'negociacao', label:'Negociação',  color:'var(--stage-negociacao)', icon:'🤝' },
  { key:'piloto',     label:'Piloto',      color:'var(--stage-piloto)',     icon:'🧪' },
  { key:'producao',   label:'Produção',    color:'var(--stage-producao)',   icon:'🏭' },
  { key:'perdido',    label:'Perdidos',    color:'var(--stage-perdido)',    icon:'❌' },
];

const SCORE_ICON = { muito_quente:'🔥', quente:'🌶️', morno:'⚡', frio:'💧', muito_frio:'❄️' };
const ORIGEM_LABEL = {
  whatsapp:'WhatsApp', linkedin:'LinkedIn', google:'Google', instagram:'Instagram',
  site:'Site', indicacao:'Indicação', evento:'Evento', prospeccao_ativa:'Prospecção Ativa', outro:'Outro',
};

function trialDays(end) {
  if (!end) return null;
  return Math.ceil((new Date(end) - Date.now()) / 86400000);
}

function whatsappAge(ts) {
  if (!ts) return null;
  const diff = Math.round((Date.now() - new Date(ts)) / 86400000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  return `${diff}d atrás`;
}

function LeadCard({ lead, onOpen, onMove, selectMode, selected, onToggle }) {
  const { crmLabel, crmBadgeClass } = useCrmTypes();
  const days    = lead.stage === 'piloto' ? trialDays(lead.trial_end) : null;
  const zap     = whatsappAge(lead.ultimo_whatsapp_at);
  const isProsp = lead.origem === 'prospeccao_ativa';
  const isSelected = selected?.has(lead.id);

  const handleClick = () => {
    if (selectMode) { onToggle(lead.id); }
    else { onOpen(lead.id); }
  };

  return (
    <div
      style={{
        background: isSelected ? 'rgba(31,111,235,.08)' : 'var(--card2)',
        border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius:'var(--radius)', padding:'12px', cursor:'pointer',
        transition:'border-color .15s',
        borderLeft: isSelected ? '3px solid var(--accent)' : isProsp ? '3px solid #25D366' : '1px solid var(--border)',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor='var(--accent)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor= isProsp ? '#25D366' : 'var(--border)'; }}
      onClick={handleClick}
    >
      {/* Checkbox em modo seleção */}
      {selectMode && (
        <div style={{
          position:'absolute', top:8, right:8,
          width:18, height:18, borderRadius:4,
          border: isSelected ? 'none' : '2px solid var(--border)',
          background: isSelected ? 'var(--accent)' : 'transparent',
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          {isSelected && <span style={{color:'#fff', fontSize:12, fontWeight:700}}>✓</span>}
        </div>
      )}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6}}>
        <div style={{fontWeight:600, fontSize:13, lineHeight:1.3, flex:1, marginRight: selectMode ? 24 : 4}}>
          {lead.empresa || lead.nome}
        </div>
        {!selectMode && lead.score && <span title={lead.score}>{SCORE_ICON[lead.score]}</span>}
      </div>
      {lead.empresa && (
        <div style={{fontSize:11, color:'var(--muted)', marginBottom:6}}>{lead.nome}</div>
      )}
      <div style={{display:'flex', flexWrap:'wrap', gap:4, marginBottom:8}}>
        {lead.crm && (
          <span className={`badge ${crmBadgeClass(lead.crm)}`}>
            {crmLabel(lead.crm)}
          </span>
        )}
        {isProsp && (
          <span className="badge" style={{background:'rgba(37,211,102,.15)', color:'#25D366', fontSize:9}}>
            📱 Prosp. Ativa
          </span>
        )}
        {lead.plano_nome && (
          <span className="badge" style={{background:'var(--card)', color:'var(--muted)'}}>
            {lead.plano_nome}
          </span>
        )}
      </div>
      {/* Trial warning */}
      {days !== null && (
        <div style={{
          fontSize:11, padding:'3px 7px', borderRadius:4, marginBottom:6,
          background: days < 0 ? 'rgba(248,81,73,.15)' : days <= 3 ? 'rgba(210,153,34,.15)' : 'rgba(163,113,247,.15)',
          color:       days < 0 ? 'var(--danger)'       : days <= 3 ? 'var(--warning)'       : 'var(--purple)',
        }}>
          {days < 0 ? `⏰ Vencido há ${Math.abs(days)}d` : `🧪 Vence em ${days}d`}
        </div>
      )}
      {/* Último contato WhatsApp (só para leads de prospecção ativa) */}
      {isProsp && zap && (
        <div style={{
          fontSize:10, padding:'2px 6px', borderRadius:4, marginBottom:6,
          background:'rgba(37,211,102,.08)', color:'var(--muted)',
          display:'inline-flex', alignItems:'center', gap:4,
        }}>
          💬 Último contato: {zap}
        </div>
      )}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div style={{fontSize:11, color:'var(--muted)'}}>
          {lead.valor_negociado
            ? <span style={{color:'var(--success)', fontWeight:600}}>
                R$ {Number(lead.valor_negociado).toLocaleString('pt-BR',{minimumFractionDigits:2})}
              </span>
            : lead.plano_valor
            ? <span>R$ {Number(lead.plano_valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>
            : null}
        </div>
        {lead.data_proxima_acao && (
          <div style={{
            fontSize:10, color: new Date(lead.data_proxima_acao) < new Date() ? 'var(--danger)' : 'var(--muted)'
          }}>
            📅 {new Date(lead.data_proxima_acao).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
          </div>
        )}
      </div>
      {/* Move stage buttons — ocultos em modo seleção */}
      {!selectMode && (
        <div style={{display:'flex', gap:4, marginTop:8}} onClick={e => e.stopPropagation()}>
          {STAGES.filter(s => s.key !== lead.stage).map(s => (
            <button key={s.key}
              className="btn btn-ghost btn-sm"
              style={{flex:1, fontSize:10, padding:'3px 4px'}}
              onClick={() => onMove(lead, s.key)}
              title={`Mover para ${s.label}`}
            >
              → {s.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Funil() {
  const nav  = useNavigate();
  const { role } = useAuth();
  const { types, crmLabel } = useCrmTypes();
  const [leads,      setLeads]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState(false);
  const [q,          setQ]          = useState('');
  const [crmF,       setCrmF]       = useState('');
  const [scoreF,     setScoreF]     = useState('');
  const [origemF,    setOrigemF]    = useState('');
  const [moveDlg,    setMoveDlg]    = useState(null);
  const [motivo,     setMotivo]     = useState('');

  // Seleção em lote
  const isAdmin     = ['admin', 'master'].includes(role);
  const [selectMode, setSelectMode] = useState(false);
  const [selected,   setSelected]   = useState(new Set());
  const [deleting,   setDeleting]   = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const debouncedQ = useDebounce(q, 300);

  useEffect(() => { load(); }, [debouncedQ, crmF, scoreF, origemF]);

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(leads.map(l => l.id)));
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
    setConfirmBulk(false);
  }

  async function bulkDelete() {
    setDeleting(true);
    try {
      await Promise.all([...selected].map(id => api.delete(`/leads/${id}`)));
      exitSelectMode();
      load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erro ao excluir leads.');
    } finally {
      setDeleting(false);
      setConfirmBulk(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/leads', { params: { q: debouncedQ, crm: crmF, score: scoreF } });
      let filtered = data.filter(l => l.stage !== 'cancelado');
      if (origemF) filtered = filtered.filter(l => l.origem === origemF);
      setLeads(filtered);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  function byStage(s) {
    return leads.filter(l => l.stage === s);
  }

  async function doMove(lead, targetStage) {
    if ((targetStage === 'perdido' || targetStage === 'cancelado') && !motivo) {
      setMoveDlg({ lead, targetStage });
      return;
    }
    try {
      await api.put(`/leads/${lead.id}/stage`, {
        stage: targetStage,
        motivo_perda: motivo || undefined,
      });
      setMotivo('');
      setMoveDlg(null);
      load();
    } catch(e) { alert(e.response?.data?.error || 'Erro ao mover lead.'); }
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>🎯 Funil de Vendas</h1>
          <span className="text-muted" style={{fontSize:13}}>
            {leads.length} lead{leads.length!==1?'s':''} ativos
          </span>
        </div>
        <div style={{display:'flex', gap:8}}>
          {isAdmin && !selectMode && (
            <button className="btn btn-ghost" onClick={() => setSelectMode(true)}>
              ☑ Selecionar
            </button>
          )}
          {selectMode && (
            <button className="btn btn-ghost" onClick={exitSelectMode}>
              ✕ Cancelar seleção
            </button>
          )}
          {!selectMode && (
            <button className="btn btn-primary" onClick={() => setModal(true)}>
              ＋ Novo Lead
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div style={{display:'flex', gap:8, marginBottom:20, flexWrap:'wrap'}}>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="🔍 Buscar por nome ou empresa…"
          style={{width:260, flex:'none'}} />
        <select value={crmF} onChange={e => { setCrmF(e.target.value); }} style={{width:140, flex:'none'}}>
          <option value="">Todos os CRMs</option>
          {types.map(t => <option key={t.value} value={t.value}>{crmLabel(t.value)}</option>)}
        </select>
        <select value={scoreF} onChange={e => setScoreF(e.target.value)} style={{width:140, flex:'none'}}>
          <option value="">Todos os scores</option>
          {['muito_quente','quente','morno','frio','muito_frio'].map(s =>
            <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
        <select value={origemF} onChange={e => setOrigemF(e.target.value)} style={{width:160, flex:'none'}}>
          <option value="">Todas as origens</option>
          <option value="prospeccao_ativa">📱 Prospecção Ativa</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="indicacao">Indicação</option>
          <option value="instagram">Instagram</option>
          <option value="outro">Outro</option>
        </select>
        <button className="btn btn-ghost" onClick={load}>Filtrar</button>
      </div>

      {/* Kanban */}
      {loading ? (
        <div style={{textAlign:'center', padding:40, color:'var(--muted)'}}>Carregando…</div>
      ) : (
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(5,1fr)',
          gap:12, alignItems:'start', overflowX:'auto',
        }}>
          {STAGES.map(s => {
            const cards = byStage(s.key);
            return (
              <div key={s.key}>
                {/* Cabeçalho coluna */}
                <div style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'10px 14px', background:'var(--card)', borderRadius:'var(--radius)',
                  border:`1px solid var(--border)`, borderTop:`3px solid ${s.color}`,
                  marginBottom:8,
                }}>
                  <div style={{fontWeight:700, fontSize:13}}>{s.icon} {s.label}</div>
                  <span style={{
                    background: s.color, color:'#fff', borderRadius:'50%',
                    width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:700,
                  }}>{cards.length}</span>
                </div>
                {/* Cards */}
                <div style={{display:'flex', flexDirection:'column', gap:8}}>
                  {cards.map(lead => (
                    <LeadCard key={lead.id} lead={lead}
                      onOpen={id => nav(`/leads/${id}`)}
                      onMove={(l, t) => doMove(l, t)}
                      selectMode={selectMode}
                      selected={selected}
                      onToggle={toggleSelect} />
                  ))}
                  {cards.length === 0 && (
                    <div style={{
                      textAlign:'center', padding:'20px 12px', border:'2px dashed var(--border)',
                      borderRadius:'var(--radius)', color:'var(--muted)', fontSize:12,
                    }}>
                      Nenhum lead
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog motivo de perda */}
      {moveDlg && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setMoveDlg(null)}>
          <div style={{background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)',
            padding:24, maxWidth:400, width:'100%'}}>
            <h3 style={{marginBottom:16}}>Motivo de {moveDlg.targetStage==='perdido'?'perda':'cancelamento'}</h3>
            <div className="form-group" style={{marginBottom:16}}>
              <label>Motivo *</label>
              <select value={motivo} onChange={e => setMotivo(e.target.value)}>
                <option value="">Selecione…</option>
                {['Preço','Concorrente','Não gostou','Não tem interesse'].map(m =>
                  <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={() => { setMoveDlg(null); setMotivo(''); }}>Cancelar</button>
              <button className="btn btn-danger" disabled={!motivo}
                onClick={() => doMove(moveDlg.lead, moveDlg.targetStage)}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal criar lead */}
      {modal && (
        <LeadModal onClose={() => setModal(false)} onSaved={() => { setModal(false); load(); }} />
      )}

      {/* Barra flutuante de seleção em lote */}
      {selectMode && (
        <div style={{
          position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)',
          background:'var(--card)', border:'1px solid var(--border)',
          borderRadius:999, padding:'10px 20px',
          boxShadow:'0 8px 32px rgba(0,0,0,.45)',
          display:'flex', alignItems:'center', gap:14, zIndex:999,
          minWidth:320,
        }}>
          <span style={{fontSize:13, fontWeight:700}}>
            {selected.size > 0 ? `${selected.size} selecionado${selected.size>1?'s':''}` : 'Clique nos cards para selecionar'}
          </span>
          {selected.size < leads.length && (
            <button
              onClick={selectAll}
              style={{
                fontSize:11, padding:'4px 12px', borderRadius:999,
                border:'1px solid var(--border)', background:'none',
                color:'var(--text)', cursor:'pointer',
              }}>
              Todos ({leads.length})
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={() => setSelected(new Set())}
              style={{
                fontSize:11, padding:'4px 12px', borderRadius:999,
                border:'1px solid var(--border)', background:'none',
                color:'var(--muted)', cursor:'pointer',
              }}>
              Limpar
            </button>
          )}
          <div style={{flex:1}} />
          <button
            onClick={() => setConfirmBulk(true)}
            disabled={selected.size === 0 || deleting}
            style={{
              fontSize:13, padding:'6px 18px', borderRadius:999,
              border:'none',
              background: selected.size > 0 ? 'var(--danger)' : 'var(--card2)',
              color: selected.size > 0 ? '#fff' : 'var(--muted)',
              cursor: selected.size > 0 ? 'pointer' : 'not-allowed',
              fontWeight:600,
            }}>
            🗑 Excluir {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      )}

      {/* Modal confirmação bulk delete */}
      {confirmBulk && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setConfirmBulk(false)}>
          <div style={{
            background:'var(--card)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)', padding:24, maxWidth:400, width:'100%',
          }}>
            <h3 style={{margin:'0 0 12px', fontSize:16}}>Excluir {selected.size} lead{selected.size>1?'s':''}?</h3>
            <p style={{margin:'0 0 20px', fontSize:13, color:'var(--muted)', lineHeight:1.6}}>
              Esta ação é permanente e não pode ser desfeita. Todos os dados, atividades e histórico dos leads selecionados serão removidos.
            </p>
            <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
              <button className="btn btn-ghost" onClick={() => setConfirmBulk(false)} disabled={deleting}>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={bulkDelete} disabled={deleting}>
                {deleting ? 'Excluindo...' : `Excluir ${selected.size} lead${selected.size>1?'s':''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
