import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';

const STATUS_CONFIG = {
  quente:       { label: 'Quente',       bg: 'rgba(216,90,48,.15)',  color: '#D85A30' },
  morno:        { label: 'Morno',        bg: 'rgba(186,117,23,.15)', color: '#BA7517' },
  frio:         { label: 'Frio',         bg: 'rgba(24,95,165,.12)',  color: '#185FA5' },
  visualizado:  { label: 'Visualizado',  bg: 'rgba(83,74,183,.12)',  color: '#534AB7' },
  sem_resposta: { label: 'Sem resposta', bg: 'var(--card2)',          color: 'var(--muted)' },
  nao_entregue: { label: 'Não entregue', bg: 'rgba(163,45,45,.12)',  color: '#A32D2D' },
};

const CRM_CONFIG = {
  pet:   { label: 'Pet',   bg: 'rgba(15,110,86,.12)',  color: '#0F6E56' },
  saude: { label: 'Saúde', bg: 'rgba(24,95,165,.12)',  color: '#185FA5' },
};

function initials(nome) {
  return (nome || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

export default function Prospecting() {
  const { role } = useAuth();
  const navigate   = useNavigate();
  const canPromote = role === 'admin' || role === 'master';

  const [dates, setDates]         = useState([]);
  const [selDate, setSelDate]     = useState('');
  const [records, setRecords]     = useState([]);
  const [totais, setTotais]       = useState({});
  const [loading, setLoading]     = useState(false);
  const [fCrm, setFCrm]           = useState('');
  const [fStatus, setFStatus]     = useState('');
  const [fQ, setFQ]               = useState('');
  const [confirmRec, setConfirm]  = useState(null);
  const [saving, setSaving]       = useState(false);
  const [expanded, setExpanded]   = useState(null);

  // Vendedores
  const [sellers, setSellers]     = useState([]);
  const [bulkSeller, setBulkSeller] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Mapa local de vendedor_id por record id (sobrescreve o que viou do servidor até próximo fetch)
  const [sellerMap, setSellerMap] = useState({});

  useEffect(() => {
    api.get('/prospecting/dates').then(r => {
      const ds = r.data.dates || [];
      setDates(ds);
      if (ds.length > 0) setSelDate(ds[0].date);
    }).catch(() => {});

    api.get('/prospecting/sellers').then(r => setSellers(r.data || [])).catch(() => {});
  }, []);

  const loadRecords = useCallback(async () => {
    if (!selDate) return;
    setLoading(true);
    try {
      const r = await api.get('/prospecting/records', {
        params: {
          date: selDate,
          crm: fCrm || undefined,
          status: fStatus || undefined,
          q: fQ || undefined,
        },
      });
      const recs = r.data.records || [];
      setRecords(recs);
      setTotais(r.data.totais || {});
      // Inicializar mapa com o que veio do servidor
      const m = {};
      recs.forEach(rec => { m[rec.id] = rec.vendedor_id || ''; });
      setSellerMap(m);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selDate, fCrm, fStatus, fQ]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handlePromote = async () => {
    if (!confirmRec) return;
    setSaving(true);
    try {
      const res = await api.post(`/prospecting/records/${confirmRec.id}/promote`);
      navigate(`/leads/${res.data.lead_id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao promover.');
      setSaving(false);
      setConfirm(null);
    }
  };

  // Atribuir vendedor a um único registro
  const assignOne = async (recId, vendedorId) => {
    setSellerMap(m => ({ ...m, [recId]: vendedorId }));
    try {
      await api.put(`/prospecting/records/${recId}`, { vendedor_id: vendedorId || null });
    } catch {
      // silencioso — o mapa local já atualizou visualmente
    }
  };

  // Atribuir mesmo vendedor a todos os registros visíveis
  const assignAll = async () => {
    if (!bulkSeller || records.length === 0) return;
    setAssigning(true);
    const assignments = records
      .filter(r => !r.promoted_at)
      .map(r => ({ id: r.id, vendedor_id: bulkSeller }));
    try {
      await api.post('/prospecting/assign-bulk', { assignments });
      const m = { ...sellerMap };
      assignments.forEach(a => { m[a.id] = a.vendedor_id; });
      setSellerMap(m);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atribuir.');
    } finally {
      setAssigning(false);
    }
  };

  // Distribuir aleatoriamente entre todos os vendedores
  const assignRandom = async () => {
    if (sellers.length === 0 || records.length === 0) return;
    setAssigning(true);
    const targets = records.filter(r => !r.promoted_at);
    // Embaralhar lista de vendedores e distribuir round-robin
    const shuffled = [...sellers].sort(() => Math.random() - 0.5);
    const assignments = targets.map((rec, idx) => ({
      id: rec.id,
      vendedor_id: shuffled[idx % shuffled.length].id,
    }));
    try {
      await api.post('/prospecting/assign-bulk', { assignments });
      const m = { ...sellerMap };
      assignments.forEach(a => { m[a.id] = a.vendedor_id; });
      setSellerMap(m);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atribuir.');
    } finally {
      setAssigning(false);
    }
  };

  const sellerName = id => {
    const s = sellers.find(x => x.id === id);
    return s ? s.name : '';
  };

  const total    = Number(totais.total    || 0);
  const quentes  = Number(totais.quentes  || 0);
  const mornos   = Number(totais.mornos   || 0);
  const frios    = Number(totais.frios    || 0);
  const promovidos = Number(totais.promovidos || 0);
  const taxaResp = total > 0 ? Math.round(((quentes + mornos + frios) / total) * 100) : 0;

  const selectStyle = {
    fontSize: 13, padding: '6px 10px',
    borderRadius: 'var(--radius)', border: '1px solid var(--border)',
    background: 'var(--card)', color: 'var(--text)',
  };

  const sem = records.filter(r => !sellerMap[r.id] && !r.promoted_at).length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>📋 Prospecção</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Prospects só entram no funil após promoção manual por administrador
          </p>
        </div>
        <select value={selDate} onChange={e => setSelDate(e.target.value)} style={{ ...selectStyle, minWidth: 200 }}>
          {dates.length === 0 && <option value="">Nenhum registro ainda</option>}
          {dates.map(d => (
            <option key={d.date} value={d.date}>
              {fmtDate(d.date)} — {d.total} abordados
            </option>
          ))}
        </select>
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Abordados',     val: total,          color: 'var(--text)' },
          { label: '🔥 Quentes',    val: quentes,        color: '#D85A30' },
          { label: '🌡️ Mornos',    val: mornos,          color: '#BA7517' },
          { label: '📈 Resposta',   val: taxaResp + '%', color: '#1D9E75' },
          { label: '🎯 Promovidos', val: promovidos,     color: '#534AB7' },
        ].map(m => (
          <div key={m.label} style={{ background: 'var(--card2)', borderRadius: 'var(--radius)', padding: '12px 14px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{m.val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={selectStyle}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={fCrm} onChange={e => setFCrm(e.target.value)} style={selectStyle}>
          <option value="">Pet + Saúde</option>
          <option value="pet">Pet</option>
          <option value="saude">Saúde</option>
        </select>
        <input
          value={fQ}
          onChange={e => setFQ(e.target.value)}
          placeholder="Buscar nome ou empresa..."
          style={{ ...selectStyle, flex: 1, minWidth: 180 }}
        />
        <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
          {records.length} registros
        </span>
      </div>

      {/* Toolbar de atribuição de vendedor */}
      {sellers.length > 0 && records.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          background: 'var(--card2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 12,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
            👤 Designar Vendedor:
          </span>
          <select
            value={bulkSeller}
            onChange={e => setBulkSeller(e.target.value)}
            style={{ ...selectStyle, minWidth: 180 }}
          >
            <option value="">— Selecionar vendedor —</option>
            {sellers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            onClick={assignAll}
            disabled={!bulkSeller || assigning}
            style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius)',
              border: '1px solid var(--accent)', background: bulkSeller ? 'var(--accent)' : 'var(--card)',
              color: bulkSeller ? '#fff' : 'var(--muted)',
              cursor: bulkSeller ? 'pointer' : 'not-allowed', fontWeight: 600,
            }}
          >
            {assigning ? '…' : `Atribuir a todos (${records.filter(r => !r.promoted_at).length})`}
          </button>

          <div style={{ flex: 1 }} />

          <button
            onClick={assignRandom}
            disabled={assigning || sellers.length === 0}
            style={{
              fontSize: 12, padding: '6px 14px', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--text)', cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            🎲 Gerar Aleatório
          </button>

          {sem > 0 && (
            <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              {sem} sem vendedor
            </span>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>Carregando...</div>
      ) : records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
          {selDate
            ? 'Nenhum prospect encontrado para esta data e filtros.'
            : 'Selecione uma data para ver os prospects.'}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          {records.map((rec, idx) => {
            const sc = STATUS_CONFIG[rec.status] || STATUS_CONFIG.sem_resposta;
            const cc = CRM_CONFIG[rec.crm]       || { label: rec.crm || '—', bg: 'var(--card2)', color: 'var(--muted)' };
            const isExp = expanded === rec.id;
            const curSeller = sellerMap[rec.id] || '';

            return (
              <div key={rec.id} style={{ borderBottom: idx < records.length - 1 ? '1px solid var(--border)' : 'none' }}>
                {/* Linha principal */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px minmax(0,2fr) minmax(0,1fr) minmax(0,1.8fr) minmax(0,1.5fr) auto',
                    gap: 12, alignItems: 'center', padding: '10px 16px', cursor: 'pointer',
                  }}
                  onClick={() => setExpanded(isExp ? null : rec.id)}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: sc.bg, color: sc.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {initials(rec.nome)}
                  </div>

                  {/* Nome + empresa */}
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{rec.nome}</div>
                    {rec.empresa && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{rec.empresa}</div>}
                    {rec.telefone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{rec.telefone}</div>}
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>
                      {sc.label}
                    </span>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: cc.bg, color: cc.color }}>
                      {cc.label}
                    </span>
                  </div>

                  {/* Resposta */}
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rec.resposta
                      ? `"${rec.resposta.slice(0, 55)}${rec.resposta.length > 55 ? '…' : ''}"`
                      : '—'}
                  </div>

                  {/* Vendedor — dropdown por linha */}
                  <div onClick={e => e.stopPropagation()}>
                    {rec.promoted_at ? (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {curSeller ? sellerName(curSeller) : '—'}
                      </span>
                    ) : sellers.length > 0 ? (
                      <select
                        value={curSeller}
                        onChange={e => assignOne(rec.id, e.target.value)}
                        style={{
                          fontSize: 11, padding: '3px 6px', borderRadius: 6,
                          border: curSeller ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: curSeller ? 'rgba(31,111,235,.08)' : 'var(--card)',
                          color: curSeller ? 'var(--accent)' : 'var(--muted)',
                          maxWidth: '100%',
                        }}
                      >
                        <option value="">— Vendedor —</option>
                        {sellers.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                    )}
                  </div>

                  {/* Ação */}
                  <div onClick={e => e.stopPropagation()}>
                    {rec.promoted_at ? (
                      <button
                        onClick={() => navigate(`/leads/${rec.lead_id}`)}
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius)',
                          border: '1px solid #1B6B3A', background: 'rgba(15,110,86,.12)',
                          color: '#0F6E56', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                        }}>
                        ✓ Lead #{rec.lead_id}
                      </button>
                    ) : canPromote ? (
                      <button
                        onClick={() => setConfirm(rec)}
                        style={{
                          fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius)',
                          border: '1px solid var(--accent)', background: 'var(--accent)',
                          color: '#fff', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                        }}>
                        + Promover
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Detalhe expandido */}
                {isExp && (rec.analise || rec.proximo_passo || rec.resposta) && (
                  <div style={{
                    padding: '6px 16px 14px 68px', fontSize: 12, color: 'var(--muted)',
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
                    borderTop: '1px solid var(--border)', background: 'var(--card2)',
                  }}>
                    {rec.resposta && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Resposta: </span>
                        {rec.resposta}
                      </div>
                    )}
                    {rec.analise && (
                      <div><span style={{ fontWeight: 600, color: 'var(--text)' }}>Análise: </span>{rec.analise}</div>
                    )}
                    {rec.proximo_passo && (
                      <div><span style={{ fontWeight: 600, color: 'var(--text)' }}>Próximo passo: </span>{rec.proximo_passo}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Nota de rodapé */}
      {records.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
          Clique em qualquer linha para ver detalhes.
          {canPromote ? ' Apenas admins podem promover prospects para o funil.' : ''}
        </div>
      )}

      {/* Modal de confirmação de promoção */}
      {confirmRec && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--card)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', padding: '28px',
            maxWidth: 440, width: '90%',
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>
              Promover para lead
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.6 }}>
              <strong>{confirmRec.nome}</strong>
              {confirmRec.empresa ? ` — ${confirmRec.empresa}` : ''}
              {' '}será adicionado ao funil de vendas na etapa <strong>Prospecção</strong>.
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--muted)' }}>
              Status atual:{' '}
              <strong style={{ color: STATUS_CONFIG[confirmRec.status]?.color }}>
                {STATUS_CONFIG[confirmRec.status]?.label || confirmRec.status}
              </strong>
            </p>
            {sellerMap[confirmRec.id] && (
              <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--muted)' }}>
                Vendedor designado:{' '}
                <strong style={{ color: 'var(--accent)' }}>{sellerName(sellerMap[confirmRec.id])}</strong>
              </p>
            )}
            {confirmRec.resposta && (
              <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                "{confirmRec.resposta.slice(0, 120)}{confirmRec.resposta.length > 120 ? '…' : ''}"
              </p>
            )}
            {!confirmRec.resposta && <div style={{ marginBottom: 20 }} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirm(null)}
                disabled={saving}
                style={{
                  flex: 1, padding: '9px', borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)', background: 'none',
                  color: 'var(--text)', cursor: 'pointer', fontSize: 13,
                }}>
                Cancelar
              </button>
              <button
                onClick={handlePromote}
                disabled={saving}
                style={{
                  flex: 2, padding: '9px', borderRadius: 'var(--radius)',
                  border: 'none', background: 'var(--accent)',
                  color: '#fff', cursor: saving ? 'wait' : 'pointer',
                  fontSize: 13, fontWeight: 600,
                }}>
                {saving ? 'Promovendo...' : '✓ Confirmar e abrir lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
