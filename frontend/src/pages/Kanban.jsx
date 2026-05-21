import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import ClientModal from '../components/ClientModal';
import ClientDetail from '../components/ClientDetail';
import Toast from '../components/Toast';
import { useToast } from '../useToast';
import * as XLSX from 'xlsx';
import styles from './Kanban.module.css';

const STAGES = [
  { key: 'prosp',  label: 'Prospectados' },
  { key: 'neg',    label: 'Em Negociação' },
  { key: 'piloto', label: 'Em Piloto' },
  { key: 'prod',   label: 'Em Produção'  },
];

const SETORES = ['Varejo','Alimentação','Saúde','Educação','Serviços','Indústria','Tecnologia','Outros'];

export default function Kanban() {
  const [clients, setClients]       = useState([]);
  const [sdrs, setSdrs]             = useState([]);
  const [sellers, setSellers]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterSetor, setFilterSetor] = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [detailClient, setDetailClient] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [confirmDel, setConfirmDel] = useState(null); // 'single' | 'batch'
  const [deleteId, setDeleteId]     = useState(null);
  const { toasts, toast }           = useToast();
  const xlsxRef = useRef();

  const load = useCallback(async () => {
    try {
      const [cl, sd, se] = await Promise.all([
        api.get('/clients'),
        api.get('/sdrs'),
        api.get('/sellers'),
      ]);
      setClients(cl.data);
      setSdrs(sd.data);
      setSellers(se.data);
    } catch {
      toast('Erro ao carregar dados.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filtering ───────────────────────────────────
  const visible = clients.filter(c => {
    if (filterSetor && c.setor !== filterSetor) return false;
    if (search) {
      const lq = search.toLowerCase();
      return [c.razao, c.cnpj, c.contato, c.email, c.sdr_name, c.seller_name, c.obs]
        .some(v => v && v.toLowerCase().includes(lq));
    }
    return true;
  });

  const byStage = s => visible.filter(c => c.stage === s);

  // ── CRUD ────────────────────────────────────────
  async function saveClient(data, id) {
    try {
      if (id) {
        const { data: updated } = await api.put(`/clients/${id}`, data);
        setClients(cs => cs.map(c => c.id === id ? { ...updated, sdr_name: data._sdr_name, seller_name: data._seller_name } : c));
        toast('Cliente atualizado!');
      } else {
        const { data: created } = await api.post('/clients', data);
        setClients(cs => [{ ...created, sdr_name: data._sdr_name, seller_name: data._seller_name, attachments: [] }, ...cs]);
        toast('Cliente criado!');
      }
      setModalOpen(false);
      setEditClient(null);
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao salvar.', 'error');
    }
  }

  async function deleteClient(id) {
    try {
      await api.delete(`/clients/${id}`);
      setClients(cs => cs.filter(c => c.id !== id));
      toast('Cliente removido.');
    } catch {
      toast('Erro ao remover.', 'error');
    }
    setConfirmDel(null);
    setDeleteId(null);
    if (detailClient?.id === id) setDetailClient(null);
  }

  async function deleteBatch() {
    const ids = [...selectedIds];
    try {
      await api.delete('/clients/batch', { data: { ids } });
      setClients(cs => cs.filter(c => !ids.includes(c.id)));
      setSelectedIds(new Set());
      toast(`${ids.length} cliente(s) removido(s).`);
    } catch {
      toast('Erro ao remover clientes.', 'error');
    }
    setConfirmDel(null);
  }

  async function moveStage(client, newStage) {
    if (newStage === 'piloto' || newStage === 'prod') {
      if (!client.cnpj || !client.razao) {
        setEditClient({ ...client, _pendingStage: newStage });
        setModalOpen(true);
        return;
      }
    }
    try {
      const payload = { ...client, stage: newStage, attachments: client.attachments || [] };
      const { data: updated } = await api.put(`/clients/${client.id}`, payload);
      setClients(cs => cs.map(c => c.id === client.id ? { ...updated, sdr_name: client.sdr_name, seller_name: client.seller_name, attachments: client.attachments } : c));
      toast('Estágio atualizado.');
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao mover.', 'error');
    }
  }

  // ── XLSX import ─────────────────────────────────
  async function handleXlsx(e) {
    const file = e.target.files[0];
    if (!file) return;
    xlsxRef.current.value = '';
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    try {
      const { data } = await api.post('/clients/import', { rows });
      toast(`Importados: ${data.added} | Duplicados: ${data.dups}`);
      load();
    } catch {
      toast('Erro na importação.', 'error');
    }
  }

  // ── Checkbox (prosp only) ───────────────────────
  function toggleSelect(id) {
    setSelectedIds(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function selectAll() {
    const ids = byStage('prosp').map(c => c.id);
    setSelectedIds(new Set(ids));
  }

  if (loading) return <div className={styles.loading}>Carregando…</div>;

  return (
    <div className={styles.page}>
      {/* ── Header bar ── */}
      <div className={styles.header}>
        <input
          className={styles.search}
          placeholder="Buscar…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={filterSetor} onChange={e => setFilterSetor(e.target.value)} className={styles.filter}>
          <option value="">Todos os setores</option>
          {SETORES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className={styles.headerActions}>
          <button className={styles.btnImport} onClick={() => xlsxRef.current.click()}>
            📥 Importar XLSX
          </button>
          <button className={styles.btnAdd} onClick={() => { setEditClient(null); setModalOpen(true); }}>
            + Novo cliente
          </button>
        </div>
        <input ref={xlsxRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={handleXlsx} />
      </div>

      {/* ── Kanban ── */}
      <div className={styles.board}>
        {STAGES.map(st => {
          const cols = byStage(st.key);
          const isProsp = st.key === 'prosp';
          const selCount = isProsp ? [...selectedIds].filter(id => cols.some(c => c.id === id)).length : 0;
          return (
            <div key={st.key} className={styles.column}>
              <div className={styles.colHeader}>
                <span className={styles.colTitle}>{st.label}</span>
                <span className={styles.colCount}>{cols.length}</span>
              </div>

              {/* batch bar */}
              {isProsp && selCount > 0 && (
                <div className={styles.batchBar}>
                  <span>{selCount} selecionado(s)</span>
                  <button onClick={() => { setConfirmDel('batch'); }}>🗑 Excluir</button>
                  <button onClick={() => setSelectedIds(new Set())}>✕</button>
                </div>
              )}
              {isProsp && cols.length > 0 && (
                <button className={styles.selAll} onClick={selectAll}>Selecionar todos</button>
              )}

              <div className={styles.cards}>
                {cols.map(c => (
                  <Card
                    key={c.id}
                    client={c}
                    stage={st.key}
                    stages={STAGES}
                    isProsp={isProsp}
                    selected={selectedIds.has(c.id)}
                    onToggle={() => toggleSelect(c.id)}
                    onClick={() => setDetailClient(c)}
                    onEdit={() => { setEditClient(c); setModalOpen(true); }}
                    onDelete={() => { setDeleteId(c.id); setConfirmDel('single'); }}
                    onMove={newStage => moveStage(c, newStage)}
                  />
                ))}
                {cols.length === 0 && <div className={styles.empty}>—</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modals ── */}
      {modalOpen && (
        <ClientModal
          client={editClient}
          sdrs={sdrs}
          sellers={sellers}
          onSave={saveClient}
          onClose={() => { setModalOpen(false); setEditClient(null); }}
        />
      )}
      {detailClient && (
        <ClientDetail
          client={detailClient}
          onClose={() => setDetailClient(null)}
          onEdit={() => { setEditClient(detailClient); setDetailClient(null); setModalOpen(true); }}
          onDelete={() => { setDeleteId(detailClient.id); setConfirmDel('single'); }}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          msg={confirmDel === 'batch'
            ? `Excluir ${selectedIds.size} cliente(s) selecionado(s)?`
            : 'Excluir este cliente?'}
          onConfirm={() => confirmDel === 'batch' ? deleteBatch() : deleteClient(deleteId)}
          onCancel={() => { setConfirmDel(null); setDeleteId(null); }}
        />
      )}
      <Toast toasts={toasts} />
    </div>
  );
}

// ── Card component ──────────────────────────────
function Card({ client: c, stage, stages, isProsp, selected, onToggle, onClick, onEdit, onDelete, onMove }) {
  const prev = stages[stages.findIndex(s => s.key === stage) - 1];
  const next = stages[stages.findIndex(s => s.key === stage) + 1];
  return (
    <div className={`${styles.card} ${selected ? styles.selected : ''}`}>
      {isProsp && (
        <input
          type="checkbox"
          className={styles.check}
          checked={selected}
          onChange={onToggle}
          onClick={e => e.stopPropagation()}
        />
      )}
      <div className={styles.cardBody} onClick={onClick}>
        <div className={styles.cardName}>{c.razao || c.contato || '—'}</div>
        {c.contato && c.razao && <div className={styles.cardSub}>{c.contato}</div>}
        {c.setor   && <span className={styles.badge}>{c.setor}</span>}
        {c.tvs     && <div className={styles.cardInfo}>📺 {c.tvs} TVs</div>}
        {c.seller_name && <div className={styles.cardInfo}>🏷 {c.seller_name}</div>}
      </div>
      <div className={styles.cardActions}>
        {prev && <button title={`← ${prev.label}`} onClick={e => { e.stopPropagation(); onMove(prev.key); }}>◀</button>}
        <button title="Editar" onClick={e => { e.stopPropagation(); onEdit(); }}>✏️</button>
        <button title="Excluir" onClick={e => { e.stopPropagation(); onDelete(); }}>🗑</button>
        {next && <button title={`→ ${next.label}`} onClick={e => { e.stopPropagation(); onMove(next.key); }}>▶</button>}
      </div>
    </div>
  );
}

// ── Confirm modal ───────────────────────────────
function ConfirmModal({ msg, onConfirm, onCancel }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.confirmBox}>
        <p>{msg}</p>
        <div className={styles.confirmBtns}>
          <button className={styles.btnDanger} onClick={onConfirm}>Excluir</button>
          <button className={styles.btnGhost} onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
