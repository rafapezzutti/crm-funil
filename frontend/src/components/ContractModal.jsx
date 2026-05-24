/**
 * ContractModal
 * Modal para preencher dados e gerar o contrato .docx.
 * O tipo de contrato (Saúde / Spa) é selecionável no topo.
 */
import React, { useState } from 'react';
import api from '../api';
import styles from './Modal.module.css';

function hoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Tipo fixo quando o cliente vem de um CRM específico; selecionável se vier do funil
function defaultTipo(companySlug) {
  if (companySlug === 'crm-spas')  return 'spa';
  if (companySlug === 'crm-saude') return 'saude';
  return 'spa'; // padrão inicial quando há seletor
}
function tipoFixo(companySlug) {
  return companySlug === 'crm-spas' || companySlug === 'crm-saude';
}

export default function ContractModal({ client, companySlug, onClose }) {
  const [tipo, setTipo] = useState(() => defaultTipo(companySlug));
  const fixo = tipoFixo(companySlug);

  const [form, setForm] = useState({
    representante: client.contato || '',
    nacionalidade: 'brasileiro/a',
    estadoCivil:   '',
    profissao:     '',
    cpfRep:        '',
    rgRep:         '',
    cargo:         '',
    dataContrato:  hoje(),
    // Valores — editáveis, default do CRM
    valorMensal:   client.custo ? Number(client.custo).toFixed(2).replace('.', ',') : '',
    // Saúde
    modalidade:    'clinica',
    quantidade:    '1',
    precoUnitario: '59,90',
    // Spa
    qtdSpa:        '1',
    precoSpa:      '79,90',
  });

  const [loading,     setLoading]     = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [msg,         setMsg]         = useState('');
  const [isError,     setIsError]     = useState(false);

  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }
  function showMsg(text, err) { setMsg(text); setIsError(!!err); }

  // Quando troca modalidade, ajusta preço unitário padrão
  function changeModalidade(val) {
    set('modalidade', val);
    set('precoUnitario', val === 'autonomo' ? '45,90' : '59,90');
  }

  // ── Consulta CNPJ ────────────────────────────────────────────────────────
  async function consultarCnpj() {
    const cnpj = (client.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) { showMsg('CNPJ inválido ou não cadastrado no cliente.', true); return; }
    setCnpjLoading(true);
    showMsg('');
    try {
      const r = await fetch(`https://publica.cnpj.ws/cnpj/${cnpj}`);
      if (!r.ok) throw new Error('CNPJ não encontrado na Receita Federal.');
      const data = await r.json();
      const socio = data.qsa?.[0]?.nome_socio || data.qsa?.[0]?.nome_representante || '';
      if (socio) set('representante', socio);
      const nome = data.razao_social || '';
      const mun  = data.municipio || '';
      const uf   = data.uf || '';
      showMsg(`✅ CNPJ: ${nome} — ${mun}/${uf}${socio ? '. Representante: ' + socio : ' (sem QSA público)'}.`);
    } catch (e) {
      showMsg('Erro ao consultar CNPJ: ' + e.message, true);
    } finally {
      setCnpjLoading(false);
    }
  }

  // ── Gera e baixa o .docx ─────────────────────────────────────────────────
  async function gerar() {
    if (!form.representante) { showMsg('Informe o nome do representante legal.', true); return; }
    setLoading(true);
    showMsg('');
    try {
      const payload = {
        clientId:      client.id,
        tipo,                          // 'saude' | 'spa'
        representante: form.representante,
        nacionalidade: form.nacionalidade,
        estadoCivil:   form.estadoCivil,
        profissao:     form.profissao,
        cpfRep:        form.cpfRep,
        rgRep:         form.rgRep,
        cargo:         form.cargo,
        dataContrato:  form.dataContrato,
        valorMensal:   form.valorMensal.replace(',', '.'),
        // Saúde
        modalidade:    form.modalidade,
        quantidade:    parseInt(form.quantidade) || 1,
        precoUnitario: parseFloat(form.precoUnitario.replace(',', '.')) || 0,
        // Spa
        qtdSpa:        parseInt(form.qtdSpa) || 1,
        precoSpa:      parseFloat(form.precoSpa.replace(',', '.')) || 0,
      };

      const response = await api.post('/contracts/generate', payload, { responseType: 'blob' });
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
      showMsg(err.response?.data?.error || 'Erro ao gerar contrato.', true);
    } finally {
      setLoading(false);
    }
  }

  const isSaude = tipo === 'saude';
  const isSpa   = tipo === 'spa';

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: 600 }}>

        {/* Header */}
        <div className={styles.modalHeader}>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <h2>📄 Gerar Contrato</h2>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>{client.razao || client.contato}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding:'16px 24px', display:'flex', flexDirection:'column', gap:14, overflowY:'auto', maxHeight:'75vh' }}>

          {/* Seletor de tipo de contrato — só aparece quando o cliente é do funil */}
          {fixo ? (
            <div style={{ padding:'8px 12px', borderRadius:6, fontSize:12,
                          background:'var(--card)', border:'1px solid var(--border)', color:'var(--text-muted)' }}>
              Template: <strong>{isSpa ? 'P. Spa — Massagem Reserva' : 'P. Saúde — Clínicas e Consultórios'}</strong>
              &nbsp;(definido pelo CRM de origem)
            </div>
          ) : (
            <div className={styles.section}>
              <h3>Tipo de contrato</h3>
              <div style={{ display:'flex', gap:12 }}>
                <TipoBtn ativo={isSpa}   onClick={() => setTipo('spa')}
                  label="P. Spa — Massagem Reserva" />
                <TipoBtn ativo={isSaude} onClick={() => setTipo('saude')}
                  label="P. Saúde — Clínicas e Consultórios" />
              </div>
            </div>
          )}

          {/* Dados do contratante (leitura) */}
          <div className={styles.section}>
            <h3>Contratante</h3>
            <div className={styles.grid2}>
              <ReadField label="Razão Social" value={client.razao} />
              <ReadField label="CNPJ"         value={client.cnpj} />
              <ReadField label="Endereço"     value={client.endereco} />
            </div>
            {client.cnpj && (
              <button type="button" onClick={consultarCnpj} disabled={cnpjLoading}
                style={{ marginTop:8, padding:'5px 14px', fontSize:12, background:'var(--card)',
                         border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', color:'var(--accent)' }}>
                {cnpjLoading ? 'Consultando…' : '🔍 Consultar CNPJ (Receita Federal)'}
              </button>
            )}
          </div>

          {/* Representante */}
          <div className={styles.section}>
            <h3>Representante legal</h3>
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

          {/* Valores e vigência */}
          <div className={styles.section}>
            <h3>Valores e vigência</h3>
            <div className={styles.grid2}>
              <FormField
                label="Valor mensal (R$) — cláusula 4.2"
                value={form.valorMensal}
                onChange={v=>set('valorMensal',v)}
                placeholder="Ex: 79,90"
              />
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>Data de assinatura</span>
                <input
                  type="date" value={form.dataContrato}
                  onChange={e=>set('dataContrato',e.target.value)}
                  style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)',
                           background:'var(--card)', color:'var(--text)', fontSize:13 }}
                />
              </div>
            </div>
          </div>

          {/* Anexo I — Spa */}
          {isSpa && (
            <div className={styles.section}>
              <h3>Anexo I — P. Spa</h3>
              <div className={styles.grid2}>
                <FormField label="Preço por unidade (R$)" value={form.precoSpa}
                  onChange={v=>set('precoSpa',v)} placeholder="79,90" />
                <FormField label="Qtd. unidades"          value={form.qtdSpa}
                  onChange={v=>set('qtdSpa',v)}  placeholder="1" />
              </div>
              <TotalPreview
                qtd={parseInt(form.qtdSpa)||1}
                preco={parseFloat(form.precoSpa.replace(',','.'))||0}
              />
            </div>
          )}

          {/* Anexo I — Saúde */}
          {isSaude && (
            <div className={styles.section}>
              <h3>Anexo I — P. Saúde</h3>
              <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                <label style={{ fontSize:13, cursor:'pointer' }}>
                  <input type="radio" value="clinica" checked={form.modalidade==='clinica'}
                    onChange={()=>changeModalidade('clinica')} style={{ marginRight:6 }}/>
                  Clínica / Consultório
                </label>
                <label style={{ fontSize:13, cursor:'pointer' }}>
                  <input type="radio" value="autonomo" checked={form.modalidade==='autonomo'}
                    onChange={()=>changeModalidade('autonomo')} style={{ marginRight:6 }}/>
                  Profissional Autônomo
                </label>
              </div>
              <div className={styles.grid2}>
                <FormField label="Preço por unidade (R$)" value={form.precoUnitario}
                  onChange={v=>set('precoUnitario',v)}
                  placeholder={form.modalidade==='autonomo' ? '45,90' : '59,90'} />
                <FormField label="Quantidade"             value={form.quantidade}
                  onChange={v=>set('quantidade',v)} placeholder="1" />
              </div>
              <TotalPreview
                qtd={parseInt(form.quantidade)||1}
                preco={parseFloat(form.precoUnitario.replace(',','.'))||0}
              />
            </div>
          )}

          {/* Mensagem */}
          {msg && (
            <div style={{
              padding:'8px 12px', borderRadius:6, fontSize:12,
              background: isError ? '#fee2e2' : 'var(--card)',
              color:       isError ? '#b91c1c' : 'var(--text)',
              border:`1px solid ${isError ? '#fca5a5' : 'var(--border)'}`,
            }}>{msg}</div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.modalFooter} style={{ padding:'0 24px 20px', justifyContent:'flex-end', gap:10 }}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancelar</button>
          <button className={styles.saveBtn} onClick={gerar} disabled={loading} style={{ minWidth:160 }}>
            {loading ? 'Gerando…' : '⬇ Baixar Contrato'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────
function TipoBtn({ ativo, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      flex:1, padding:'8px 14px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight: ativo ? 600 : 400,
      background: ativo ? 'var(--accent)' : 'var(--card)',
      color:      ativo ? '#fff'          : 'var(--text)',
      border:     ativo ? '2px solid var(--accent)' : '1px solid var(--border)',
      transition: 'all .15s',
    }}>{label}</button>
  );
}

function TotalPreview({ qtd, preco }) {
  const total = (qtd * preco).toFixed(2).replace('.', ',');
  return (
    <div style={{ marginTop:6, fontSize:12, color:'var(--text-muted)' }}>
      Total mensal: <strong style={{ color:'var(--text)' }}>R$ {total}</strong>
    </div>
  );
}

function ReadField({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>{label}</span>
      <span style={{ fontSize:13, color:'var(--text)', background:'var(--bg)', border:'1px solid var(--border)',
                     borderRadius:6, padding:'5px 10px', opacity:0.7 }}>{value}</span>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>{label}</span>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)',
                 background:'var(--card)', color:'var(--text)', fontSize:13 }} />
    </div>
  );
}
