import React, { useState, useEffect } from 'react';
import styles from './Modal.module.css';

const STAGES  = [
  { key:'prosp',  label:'Prospectado' },
  { key:'neg',    label:'Em Negociação' },
  { key:'piloto', label:'Em Piloto' },
  { key:'prod',   label:'Em Produção' },
];
const SETORES = ['Varejo','Alimentação','Saúde','Educação','Serviços','Indústria','Tecnologia','Outros'];

export default function ClientModal({ client, sdrs, sellers, onSave, onClose }) {
  const isEdit = !!client;
  const [form, setForm] = useState({
    stage:     client?._pendingStage || client?.stage || 'prosp',
    cnpj:      client?.cnpj || '',
    razao:     client?.razao || '',
    contato:   client?.contato || '',
    telefone:  client?.telefone || '',
    email:     client?.email || '',
    email_cob: client?.email_cob || '',
    endereco:  client?.endereco || '',
    setor:     client?.setor || '',
    tvs:       client?.tvs || '',
    custo:     client?.custo || '',
    lead_resp: client?.lead_resp || '',
    seller_id: client?.seller_id || '',
    obs:       client?.obs || '',
  });
  const [saving, setSaving] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const needsCNPJ = form.stage === 'piloto' || form.stage === 'prod';

  async function handleSubmit(e) {
    e.preventDefault();
    if (needsCNPJ && (!form.cnpj || !form.razao)) return;
    setSaving(true);
    // Resolve names for local state update
    const sdr    = sdrs.find(s => s.id === form.lead_resp);
    const seller = sellers.find(s => s.id === form.seller_id);
    await onSave(
      { ...form, _sdr_name: sdr?.name || '', _seller_name: seller?.name || '' },
      isEdit ? client.id : null
    );
    setSaving(false);
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2>{isEdit ? 'Editar cliente' : 'Novo cliente'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.row}>
            <label>Estágio
              <select value={form.stage} onChange={set('stage')}>
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <label>Setor
              <select value={form.setor} onChange={set('setor')}>
                <option value="">—</option>
                {SETORES.map(s => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>

          {needsCNPJ && <p className={styles.hint}>⚠️ CNPJ e Razão Social obrigatórios neste estágio.</p>}

          <div className={styles.row}>
            <label>CNPJ {needsCNPJ && <span className={styles.req}>*</span>}
              <input value={form.cnpj} onChange={set('cnpj')} required={needsCNPJ} placeholder="00.000.000/0000-00" />
            </label>
            <label>Razão Social {needsCNPJ && <span className={styles.req}>*</span>}
              <input value={form.razao} onChange={set('razao')} required={needsCNPJ} />
            </label>
          </div>
          <div className={styles.row}>
            <label>Nome do contato
              <input value={form.contato} onChange={set('contato')} />
            </label>
            <label>Telefone
              <input value={form.telefone} onChange={set('telefone')} />
            </label>
          </div>
          <div className={styles.row}>
            <label>E-mail
              <input type="email" value={form.email} onChange={set('email')} />
            </label>
            <label>E-mail cobrança
              <input type="email" value={form.email_cob} onChange={set('email_cob')} />
            </label>
          </div>
          <label>Endereço
            <input value={form.endereco} onChange={set('endereco')} />
          </label>
          <div className={styles.row}>
            <label>Qtd TVs
              <input type="number" min="0" value={form.tvs} onChange={set('tvs')} />
            </label>
            <label>Custo mensal (R$)
              <input type="number" min="0" step="0.01" value={form.custo} onChange={set('custo')} />
            </label>
          </div>
          <div className={styles.row}>
            <label>SDR responsável
              <select value={form.lead_resp} onChange={set('lead_resp')}>
                <option value="">—</option>
                {sdrs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Vendedor
              <select value={form.seller_id} onChange={set('seller_id')}>
                <option value="">—</option>
                {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
          <label>Observações
            <textarea rows={3} value={form.obs} onChange={set('obs')} />
          </label>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnGhost} onClick={onClose}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
