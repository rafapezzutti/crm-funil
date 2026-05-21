import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api';
import styles from './Auth.module.css';

export default function ResetPassword() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();
  const token     = params.get('token') || '';
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    if (password.length < 6)  { setError('Senha deve ter ao menos 6 caracteres.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao redefinir senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.logo}>CRM Funil</h1>
        <h2 className={styles.title}>Nova senha</h2>
        {error && <p className={styles.error}>{error}</p>}
        {done ? (
          <p className={styles.success}>Senha redefinida! Redirecionando para o login…</p>
        ) : (
          <>
            <label className={styles.label}>Nova senha
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
            </label>
            <label className={styles.label}>Confirmar senha
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            </label>
            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? 'Salvando…' : 'Redefinir senha'}
            </button>
          </>
        )}
        <p className={styles.links}><Link to="/login">← Voltar ao login</Link></p>
      </form>
    </div>
  );
}
