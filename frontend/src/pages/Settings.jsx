import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';
import Toast from '../components/Toast';
import { useToast } from '../useToast';
import styles from './Settings.module.css';

export default function Settings() {
  const { company, user } = useAuth();
  const [name, setName]   = useState(company?.name || '');
  const [saving, setSaving] = useState(false);
  const { toasts, toast }   = useToast();

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
