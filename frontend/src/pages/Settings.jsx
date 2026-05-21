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
          <label className={styles.label}>Slug (identificador)
            <input value={company?.slug || ''} disabled />
          </label>
          <label className={styles.label}>ID
            <input value={company?.id || ''} disabled />
          </label>
          <button type="submit" disabled={saving || company?.role !== 'admin'} className={styles.btn}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          {company?.role !== 'admin' && (
            <p className={styles.hint}>Apenas administradores podem editar.</p>
          )}
        </form>
      </div>

      {/* ── Sync entre CRMs ── */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>🔄 Sincronização com outros CRMs</h2>
        {hasSync ? (
          <>
            <div className={styles.syncGrid}>
              {Object.entries(sources).map(([key, src]) => (
                <div key={key} className={`${styles.syncItem} ${src.configured ? styles.syncOn : styles.syncOff}`}>
                  <span className={styles.syncName}>
                    {key === 'esportes' ? '⚽ CRM Esportes' : key === 'spas' ? '💆 CRM Spas' : '🏥 CRM Saúde'}
                  </span>
                  <span className={styles.syncLabel}>
                    {src.configured ? '✓ Configurado' : '✗ Não configurado'}
                  </span>
                  {src.configured && (
                    <span className={styles.syncLast}>Último sync: {fmtDate(src.lastSync)}</span>
                  )}
                </div>
              ))}
            </div>
            <p className={styles.hint}>Sync automático a cada 6 horas. Use o botão para forçar agora.</p>
            <button
              className={styles.btnSync}
              onClick={handleSync}
              disabled={syncing || company?.role !== 'admin'}
            >
              {syncing ? '⏳ Sincronizando…' : '🔄 Sincronizar agora'}
            </button>
          </>
        ) : (
          <p className={styles.hint}>
            Nenhuma fonte configurada. Adicione <code>DATABASE_URL_ESPORTES</code>,{' '}
            <code>DATABASE_URL_SPAS</code> e/ou <code>DATABASE_URL_SAUDE</code> nas variáveis
            de ambiente do Render para ativar a sincronização.
          </p>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Sua conta</h2>
        <div className={styles.infoRow}><span>Nome</span><strong>{user?.name}</strong></div>
        <div className={styles.infoRow}><span>E-mail</span><strong>{user?.email}</strong></div>
        <div className={styles.infoRow}><span>Função</span><strong>{company?.role}</strong></div>
      </div>

      <Toast toasts={toasts} />
    </div>
  );
}
