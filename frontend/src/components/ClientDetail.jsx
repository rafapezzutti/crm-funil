import React from 'react';
import styles from './Modal.module.css';

const STAGE_LABELS = { prosp:'Prospectado', neg:'Em Negociação', piloto:'Em Piloto', prod:'Em Produção' };

export default function ClientDetail({ client: c, onClose, onEdit, onDelete }) {
  function Field({ label, value }) {
    if (!value) return null;
    return (
      <div className={styles.field}>
        <span className={styles.fLabel}>{label}</span>
        <span className={styles.fValue}>{value}</span>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
            <h2>{c.razao || c.contato || '—'}</h2>
            <span className={styles.stageBadge}>{STAGE_LABELS[c.stage]}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding:'20px 24px', display:'flex', flexDirection:'column', gap:'16px' }}>
          <div className={styles.section}>
            <h3>Informações gerais</h3>
            <div className={styles.grid2}>
              <Field label="CNPJ"         value={c.cnpj} />
              <Field label="Razão Social"  value={c.razao} />
              <Field label="Contato"       value={c.contato} />
              <Field label="Telefone"      value={c.telefone} />
              <Field label="E-mail"        value={c.email} />
              <Field label="E-mail cobrança" value={c.email_cob} />
              <Field label="Endereço"      value={c.endereco} />
              <Field label="Setor"         value={c.setor} />
            </div>
          </div>
          <div className={styles.section}>
            <h3>Contrato</h3>
            <div className={styles.grid2}>
              <Field label="Qtd TVs"       value={c.tvs} />
              <Field label="Custo mensal"  value={c.custo ? `R$ ${Number(c.custo).toLocaleString('pt-BR', { minimumFractionDigits:2 })}` : null} />
              <Field label="SDR"           value={c.sdr_name} />
              <Field label="Vendedor"      value={c.seller_name} />
            </div>
          </div>
          {c.obs && (
            <div className={styles.section}>
              <h3>Observações</h3>
              <p style={{ fontSize:'13px', lineHeight:'1.6', color:'var(--text)' }}>{c.obs}</p>
            </div>
          )}
          {c.attachments?.length > 0 && (
            <div className={styles.section}>
              <h3>Anexos ({c.attachments.length})</h3>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                {c.attachments.map((a, i) => (
                  <a
                    key={i}
                    href={`data:${a.type};base64,${a.data}`}
                    download={a.name}
                    style={{ fontSize:'12px', background:'var(--card)', border:'1px solid var(--border)',
                      borderRadius:'6px', padding:'4px 10px', color:'var(--accent)', textDecoration:'none' }}
                  >
                    📎 {a.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.modalFooter} style={{ padding:'0 24px 20px' }}>
          <button className={styles.dangerBtn} onClick={onDelete}>Excluir</button>
          <button className={styles.editBtn}   onClick={onEdit}>Editar</button>
        </div>
      </div>
    </div>
  );
}
