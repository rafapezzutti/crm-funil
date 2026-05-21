import React, { useState, useEffect } from 'react';
import api from '../api';
import Toast from '../components/Toast';
import { useToast } from '../useToast';
import styles from './Team.module.css';

export default function Team() {
  const [sdrs,    setSdrs]    = useState([]);
  const [sellers, setSellers] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toasts, toast }     = useToast();

  useEffect(() => {
    Promise.all([
      api.get('/sdrs'),
      api.get('/sellers'),
      api.get('/company/members'),
    ]).then(([s, v, m]) => {
      setSdrs(s.data);
      setSellers(v.data);
      setMembers(m.data);
    }).finally(() => setLoading(false));
  }, []);

  async function addPerson(type, name, email) {
    try {
      const { data } = await api.post(`/${type}`, { name, email });
      type === 'sdrs' ? setSdrs(s => [...s, data]) : setSellers(s => [...s, data]);
      toast(`${type === 'sdrs' ? 'SDR' : 'Vendedor'} adicionado!`);
      return true;
    } catch (err) {
      toast(err.response?.data?.error || 'Erro.', 'error');
      return false;
    }
  }

  async function removePerson(type, id) {
    try {
      await api.delete(`/${type}/${id}`);
      type === 'sdrs' ? setSdrs(s => s.filter(x => x.id !== id)) : setSellers(s => s.filter(x => x.id !== id));
      toast('Removido.');
    } catch {
      toast('Erro ao remover.', 'error');
    }
  }

  if (loading) return <div className={styles.loading}>Carregando…</div>;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Equipe</h1>
      <div className={styles.grid}>
        <PersonSection title="SDRs" type="sdrs" list={sdrs} onAdd={addPerson} onRemove={removePerson} />
        <PersonSection title="Vendedores" type="sellers" list={sellers} onAdd={addPerson} onRemove={removePerson} />
        <MembersSection members={members} />
      </div>
      <Toast toasts={toasts} />
    </div>
  );
}

function PersonSection({ title, type, list, onAdd, onRemove }) {
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onAdd(type, name.trim(), email.trim() || null);
    if (ok) { setName(''); setEmail(''); }
    setSaving(false);
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <form className={styles.addForm} onSubmit={handleAdd}>
        <input placeholder="Nome *" value={name} onChange={e => setName(e.target.value)} required />
        <input placeholder="E-mail (opcional)" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <button type="submit" disabled={saving} className={styles.addBtn}>
          {saving ? '…' : '+ Adicionar'}
        </button>
      </form>
      <div className={styles.list}>
        {list.length === 0 && <p className={styles.empty}>Nenhum cadastrado.</p>}
        {list.map(p => (
          <div key={p.id} className={styles.personRow}>
            <div>
              <div className={styles.personName}>{p.name}</div>
              {p.email && <div className={styles.personEmail}>{p.email}</div>}
            </div>
            <button className={styles.removeBtn} onClick={() => onRemove(type, p.id)} title="Remover">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersSection({ members }) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>Usuários da empresa</h2>
      <div className={styles.list}>
        {members.map(m => (
          <div key={m.id} className={styles.personRow}>
            <div>
              <div className={styles.personName}>{m.name}</div>
              <div className={styles.personEmail}>{m.email}</div>
            </div>
            <span className={`${styles.roleTag} ${m.role === 'admin' ? styles.admin : ''}`}>{m.role}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
