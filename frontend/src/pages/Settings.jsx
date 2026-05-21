import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import Toast from '../components/Toast';
import { useToast } from '../useToast';
import styles from './Settings.module.css';

export default function Settings() {
  const { company, user } = useAuth();
  const [name, setName]         = useState(company?.name || '');
  const [saving, setSaving]     = useState(false);
  const [syncing, setSyncing]   = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const { toasts, toast }           = useToast();

  useEffect(() => {
    api.get('/sync/status')
      .then(({ data }) => setSyncStatus(data))
      .catch(() => {});
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/company', { name });
      toast('Empresa atualizada!');
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const { data } = await api.post('/sync/run');
      const total = data.results?.reduce((s, r) => s + (r.imported || 0), 0) || 0;
      toast(`Sync concluído! ${total} novos registros importados.`);
      // Refresh status
      const st = await api.get('/sync/status');
      setSyncStatus(st.data);
    } catch (err) {
      toast(err.response?.data?.error || 'Erro no sync.', 'error');
    } finally {
      setSyncing(false);
    }
  }

  function fmtDate(iso) {
    if (!iso) return 'Nunca';
    return new Date(iso).toLocaleString('pt-BR');
  }

  const sources = syncStatus?.sources || {};
  const hasSync = Object.values(sources).some(s => s.configured);

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Configurações da empresa</h1>

      <div className={styles.card}>
        <form onSubmit={handleSave} className={styles.form}>
          <label className={styles.label}>Nome da empresa
            <input value={name} onChange={e => setName(e.target.value)} required />
          </label>
          <label className={styles.label}>S