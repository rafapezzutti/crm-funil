/**
 * ContractModal
 * Preenche os dados extras necessários para gerar o contrato .docx preenchido.
 * Campos automáticos: razão social, CNPJ, endereço, valor mensal (do cliente)
 * Campos manuais: representante, CPF, RG, cargo, data, quantidade
 * Bônus: botão "Consultar CNPJ" → busca dados na API pública e pré-preenche campos
 */
import React, { useState } from 'react';
import api from '../api';
import styles from './Modal.module.css';

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function ContractModal({ client, companySlug, onClose }) {
  const isSaude = companySlug === 'crm-saude' || client.setor === 'Saúde';
  const isSpa   = companySlug === 'crm-spas';

  const [form, setForm] = useState({
    representante: client.contato || '',
    nacionalidade: 'brasileiro/a',
    estadoCivil:   '',
    profissao:     '',
    cpfRep:        '',
    rgRep:         '',
    cargo:         '',
    dataContrato:  hoje(),
    modalidade:    'clinica',   // só para saúde
    quantidade:    '1',
  });
  const [loading,     setLoading]     = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [error,       setError]       = useState('');

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  // ── Consulta CNPJ na API pública ──────────────────────────────────────────
  async function consultarCnpj() {
    const cnpj = (client.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) {
      setError('CNPJ inválido ou não cadastrado no cliente.');
      return;
    }
    setCnpjLoading(true);
    setError('');
    try {
      const r = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`);
      if (!r.ok) throw new Error('CNPJ não encontrado na Receita Federal.');
      const data = await r.json();

      // Tenta preencher representante pelo primeiro sócio (QSA)
      const socio = data.qsa?.[0]?.nome_socio || data.qsa?.[0]?.nome_representante || '';

      setForm(f => ({
        ...f,
        representante: socio || f.representante,
      }));

      // Mostra dados encontrados
      const nome = data.razao_social || '';
      const uf   = data.uf  || '';
      const mun  = data.municipio || '';
      if (nome) setError(`✅ CNPJ encontrado: ${nome} — ${mun}/${uf}. Representante preenchido automaticamente${socio ? `: ${socio}` : ' (não consta QSA público)'}.`);
    } catch (e) {
      setError(`Erro ao consultar CNPJ: ${e.message}`);
    } finally {
      setCnpjLoading(false);
    }
  }

  // ── Gera e baixa o .docx ──────────────────────────────────────────────────
  async function gerar() {
    if (!form.representante) { setError('Informe o nome do representante legal.'); return; }
    setLoading(true);
    setError('');
    try {
      const payload = {
        clientId:      client.id,
        representante: form.representante,
        nacionalidade: form.nacionalidade,
        estadoCivil:   form.estadoCivil,
        profissao:     form.profissao,
        cpfRep:        form.cpfRep,
        rgRep:         form.rgRep,
        cargo:         form.cargo,
        dataContrato:  form.dataContrato,
        modalidade:    form.modalidade,
        quantidade:    parseInt(form.quantidade) || 1,
      };

      const response = await api.post('/contracts/generate', payload, {
        responseType: 'blob',
      });

      // Baixa o arquivo
      const url  = URL.createObjectURL(new Blob([response.data]));
      const slug = (client.razao || client.contato || 'Contrato')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Contrato_${slug}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao gerar contrato.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: 580 }}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <h2>📄 Gerar Contrato</h2>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>
              {client.razao || client.contato}
              {isSpa   ? ' — P. Spa'   : ''}
              {isSaude ? ' — P. Saúde' : ''}
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding:'16px 24px', display:'flex', flexDirection:'column', gap:14 }}>

          {/* Dados pré-preenchidos (somente leitura) */}
          <div className={styles.section}>
            <h3>Dados do contratante</h3>
            <div className={styles.grid2}>
              <ReadField label="Razão Social"  value={client.razao} />
              <ReadField label="CNPJ"          value={client.cnpj} />
              <ReadField label="Endereço"      value={client.endereco} />
              <ReadField label="Valor mensal"  value={client.custo ? `R$ ${Number(client.custo).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : ''} />
            </div>
            {client.cnpj && (
              <button
                type="button"
                onClick={consultarCnpj}
                disabled={cnpjLoading}
                style={{
                  marginTop:8, padding:'5px 14px', fontSize:12,
                  background:'var(--card)', border:'1px solid var(--border)',
                  borderRadius:6, cursor:'pointer', color:'var(--accent)',
                }}
              >
                {cnpjLoading ? 'Consultando…' : '🔍 Consultar CNPJ (Receita Federal)'}
              </button>
            )}
          </div>

          {/* Dados do representante */}
          <div className={styles.section}>
            <h3>Representante legal do contratante</h3>
            <div className={styles.grid2}>
              <FormField label="Nome *"        value={form.representante}  onChange={v=>set('representante',v)} placeholder="Nome completo" />
              <FormField label="Cargo *"       value={form.cargo}          onChange={v=>set('cargo',v)}         placeholder="Ex: Sócio-Administrador" />
              <FormField label="Nacionalidade" value={form.nacionalidade}  onChange={v=>set('nacionalidade',v)} placeholder="brasileiro/a" />
              <FormField label="Estado civil"  value={form.estadoCivil}    onChange={v=>set('estadoCivil',v)}   placeholder="casado/a, solteiro/a…" />
              <FormField label="Profissão"     value={form.profissao}      onChange={v=>set('profissao',v)}     placeholder="Ex: empresário/a" />
              <FormField label="CPF"           value={form.cpfRep}         onChange={v=>set('cpfRep',v)}        placeholder="000.000.000-00" />
              <FormField label="RG"            value={form.rgRep}          onChange={v=>set('rgRep',v)}         placeholder="00.000.000-0 SSP/SP" />
            </div>
          </div>

          {/* Contrato */}
          <div className={styles.section}>
            <h3>Detalhes do contrato</h3>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <span className={styles.fLabel}>Data de assinatura</span>
                <input
                  type="date"
                  value={form.dataContrato}
                  onChange={e=>set('dataContrato',e.target.value)}
                  style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)',
                           background:'var(--card)', color:'var(--text)', fontSize:13 }}
                />
              </div>

              {/* Quantidade (spa e saúde) */}
              {(isSpa || isSaude) && (
                <div className={styles.field}>
                  <span className={styles.fLabel}>Quantidade de unidades</span>
                  <input
                    type="number" min={1}
                    value={form.quantidade}
                    onChange={e=>set('quantidade',e.target.value)}
                    style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)',
                             background:'var(--card)', color:'var(--text)', fontSize:13, width:80 }}
                  />
                </div>
              )}

              {/* Modalidade (apenas saúde) */}
              {isSaude && (
                <div className={styles.field} style={{ gridColumn:'span 2' }}>
                  <span className={styles.fLabel}>Modalidade (Anexo I)</span>
                  <div style={{ display:'flex', gap:16, marginTop:4 }}>
                    <label style={{ fontSize:13, cursor:'pointer' }}>
                      <input type="radio" value="clinica"  checked={form.modalidade==='clinica'}  onChange={()=>set('modalidade','clinica')}  style={{ marginRight:6 }}/>
                      Clínica / Consultório — R$ 59,90/unid.
                    </label>
                    <label style={{ fontSize:13, cursor:'pointer' }}>
                      <input type="radio" value="autonomo" checked={form.modalidade==='autonomo'} onChange={()=>set('modalidade','autonomo')} style={{ marginRight:6 }}/>
                      Profissional Autônomo — R$ 45,90/prof.
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Erro / feedback */}
          {error && (
            <div style={{
              padding:'8px 12px', borderRadius:6, fontSize:12,
              background: error.startsWith('✅') ? 'var(--card)' : '#fee2e2',
              color:       error.startsWith('✅') ? 'var(--text)' : '#b91c1c',
              border:`1px solid ${error.startsWith('✅') ? 'var(--border)' : '#fca5a5'}`,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter} style={{ padding:'0 24px 20px', justifyContent:'flex-end', gap:10 }}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
          <button
            className={styles.saveBtn}
            onClick={gerar}
            disabled={loading}
            style={{ minWidth:140 }}
          >
            {loading ? 'Gerando…' : '⬇ Baixar Contrato'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Campos auxiliares ─────────────────────────────────────────────────────────
function ReadField({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>{label}</span>
      <span style={{ fontSize:13, color:'var(--text)', background:'var(--bg)',
                     border:'1px solid var(--border)', borderRadius:6,
                     padding:'5px 10px', opacity:0.7 }}>{value}</span>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding:'6px 10px', borderRadius:6,
          border:'1px solid var(--border)',
          background:'var(--card)', color:'var(--text)', fontSize:13,
        }}
      />
    </div>
  );
}
