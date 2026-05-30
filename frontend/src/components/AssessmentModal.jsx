/**
 * AssessmentModal — gerencia fichas de avaliação de um cliente.
 */
import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import styles from './Modal.module.css';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

const STATUS_LABEL = { pending:'⏳ Aguardando', completed:'✅ Preenchida' };
const STATUS_COLOR = { pending:'#92400e', completed:'#065f46' };
const STATUS_BG    = { pending:'#fef3c7', completed:'#d1fae5' };

export default function AssessmentModal({ client, onClose }) {
  const { user } = useAuth();
  const [forms,    setForms]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [emailId,  setEmailId]  = useState(null);  // id da ficha para enviar email
  const [emailTo,  setEmailTo]  = useState(client.email || '');
  const [sending,  setSending]  = useState(false);
  const [msg,      setMsg]      = useState('');
  const [isErr,    setIsErr]    = useState(false);
  const [viewData, setViewData] = useState(null);   // ficha para visualizar
  const [copied,   setCopied]   = useState(null);   // id copiado

  const APP_URL = window.location.origin;

  useEffect(function() { loadForms(); }, []);

  async function loadForms() {
    setLoading(true);
    try {
      var { data } = await api.get('/assessments/client/' + client.id);
      setForms(data);
    } catch(e) {
      showMsg('Erro ao carregar fichas.', true);
    } finally {
      setLoading(false);
    }
  }

  function showMsg(text, err) { setMsg(text); setIsErr(!!err); setTimeout(function() { setMsg(''); }, 5000); }

  async function createForm() {
    setCreating(true);
    try {
      var { data } = await api.post('/assessments', {
        clientId:   client.id,
        physioName: user?.name  || '',
        physioEmail:user?.email || '',
      });
      showMsg('✅ Ficha criada! Link: ' + data.link);
      loadForms();
    } catch(e) {
      showMsg(e.response?.data?.error || 'Erro ao criar ficha.', true);
    } finally {
      setCreating(false);
    }
  }

  async function sendEmail(id) {
    if (!emailTo) { showMsg('Informe o e-mail do destinatário.', true); return; }
    setSending(true);
    try {
      await api.post('/assessments/' + id + '/email', { to: emailTo, patientName: client.razao || client.contato });
      showMsg('✅ E-mail enviado para ' + emailTo);
      setEmailId(null);
    } catch(e) {
      showMsg(e.response?.data?.error || 'Erro ao enviar e-mail.', true);
    } finally {
      setSending(false);
    }
  }

  async function copyLink(form) {
    var link = APP_URL + '/avaliacao/' + form.token;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(form.id);
      setTimeout(function() { setCopied(null); }, 2000);
    } catch(e) {
      showMsg('Copie o link: ' + link);
    }
  }

  if (viewData) return (
    <div className={styles.overlay} onClick={function(e) { if(e.target===e.currentTarget) setViewData(null); }}>
      <div className={styles.modal} style={{ maxWidth:700 }}>
        <div className={styles.modalHeader}>
          <h2>📋 Ficha Preenchida — {viewData.patient_nome || client.razao || client.contato}</h2>
          <button className={styles.closeBtn} onClick={function() { setViewData(null); }}>✕</button>
        </div>
        <div style={{ padding:'16px 24px', overflowY:'auto', maxHeight:'70vh' }}>
          <pre style={{ fontSize:12, background:'var(--card)', padding:16, borderRadius:8, border:'1px solid var(--border)', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
            {JSON.stringify(viewData.form_data, null, 2)}
          </pre>
        </div>
        <div className={styles.modalFooter} style={{ padding:'0 24px 20px' }}>
          <button className={styles.btnPrimary} onClick={function() { window.print(); }}>🖨 Imprimir</button>
          <button className={styles.btnGhost} onClick={function() { setViewData(null); }}>Fechar</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.overlay} onClick={function(e) { if(e.target===e.currentTarget) onClose(); }}>
      <div className={styles.modal} style={{ maxWidth:640 }}>
        <div className={styles.modalHeader}>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <h2>📋 Fichas de Avaliação</h2>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>{client.razao || client.contato}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding:'16px 24px', display:'flex', flexDirection:'column', gap:14 }}>

          {/* Botão criar nova ficha */}
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <button onClick={createForm} disabled={creating}
              style={{ padding:'8px 18px', background:'var(--accent)', color:'white',
                       border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:13,
                       opacity: creating ? 0.7 : 1 }}>
              {creating ? '⏳ Criando…' : '＋ Nova Ficha de Avaliação'}
            </button>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>Gera um link único para o paciente preencher</span>
          </div>

          {/* Feedback */}
          {msg && (
            <div style={{ padding:'8px 12px', borderRadius:6, fontSize:12,
                          background: isErr ? '#fee2e2' : 'var(--card)',
                          color:       isErr ? '#b91c1c' : 'var(--text)',
                          border:'1px solid ' + (isErr ? '#fca5a5' : 'var(--border)') }}>
              {msg}
            </div>
          )}

          {/* Lista de fichas */}
          {loading ? (
            <p style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center' }}>Carregando…</p>
          ) : forms.length === 0 ? (
            <p style={{ fontSize:13, color:'var(--text-muted)', textAlign:'center', padding:'20px 0' }}>
              Nenhuma ficha criada ainda. Clique em "Nova Ficha" para começar.
            </p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {forms.map(function(f) {
                return (
                  <div key={f.id} style={{ background:'var(--card)', border:'1px solid var(--border)',
                      borderRadius:8, padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:12,
                            background: STATUS_BG[f.status], color: STATUS_COLOR[f.status] }}>
                          {STATUS_LABEL[f.status] || f.status}
                        </span>
                        <span style={{ fontSize:12, color:'var(--text-muted)' }}>Criada: {fmt(f.created_at)}</span>
                        {f.completed_at && <span style={{ fontSize:12, color:'var(--text-muted)' }}>Preenchida: {fmt(f.completed_at)}</span>}
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={function() { copyLink(f); }}
                          style={{ padding:'4px 10px', fontSize:11, borderRadius:6, border:'1px solid var(--border)',
                                   background:'var(--bg)', cursor:'pointer', color:'var(--accent)' }}>
                          {copied===f.id ? '✅ Copiado!' : '🔗 Link'}
                        </button>
                        {f.status==='pending' && (
                          <button onClick={function() { setEmailId(emailId===f.id ? null : f.id); }}
                            style={{ padding:'4px 10px', fontSize:11, borderRadius:6, border:'1px solid var(--border)',
                                     background: emailId===f.id ? 'var(--accent)' : 'var(--bg)',
                                     color: emailId===f.id ? 'white' : 'var(--text)', cursor:'pointer' }}>
                            ✉️ E-mail
                          </button>
                        )}
                        {f.status==='completed' && (
                          <button onClick={function() { setViewData(f); }}
                            style={{ padding:'4px 10px', fontSize:11, borderRadius:6, border:'1px solid var(--border)',
                                     background:'var(--bg)', cursor:'pointer', color:'var(--text)' }}>
                            👁 Ver
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Email panel */}
                    {emailId===f.id && (
                      <div style={{ display:'flex', gap:8, alignItems:'center', padding:'8px 10px',
                                    background:'var(--bg)', borderRadius:6, border:'1px solid var(--border)' }}>
                        <input value={emailTo} onChange={function(e){setEmailTo(e.target.value);}}
                          placeholder="E-mail do paciente" type="email"
                          style={{ flex:1, padding:'6px 10px', border:'1px solid var(--border)',
                                   borderRadius:6, background:'var(--card)', color:'var(--text)', fontSize:13 }} />
                        <button onClick={function(){sendEmail(f.id);}} disabled={sending}
                          style={{ padding:'6px 14px', background:'var(--accent)', color:'white',
                                   border:'none', borderRadius:6, cursor:'pointer', fontSize:13,
                                   opacity: sending ? 0.7 : 1, whiteSpace:'nowrap' }}>
                          {sending ? 'Enviando…' : '📤 Enviar'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.modalFooter} style={{ padding:'0 24px 20px' }}>
          <button className={styles.btnGhost} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
