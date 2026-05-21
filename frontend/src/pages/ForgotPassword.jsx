import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import styles from './Auth.module.css';

export default function ForgotPassword() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      setError('Erro ao enviar e-mail. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.logo}>CRM Funil</h1>
        <h2 className={styles.title}>Recuperar senha</h2>
        {error && <p className={styles.error}>{error}</p>}
        {sent ? (
          <p className={styles.success}>Se o e-mail existir, você receberá um link de recuperação em breve.</p>
        ) : (
          <>
            <label className={styles.label}>E-mail
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </label>
            <button type="submit" className={styles.btn} disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar link'}
            </button>
          </>
        )}
        <p className={styles.links}><Link to="/login">← Voltar ao login</Link></p>
      </form>
    </div>
  );
}
