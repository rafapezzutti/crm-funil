/**
 * ContractModal — todos os campos do contratante são editáveis.
 * Pré-preenchidos com dados do CRM; consulta CNPJ enriquece via Receita Federal.
 */
import React, { useState } from 'react';
import api from '../api';
import styles from './Modal.module.css';

function hoje() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

function defaultTipo(slug) {
  if (slug === 'crm-spas')  return 'spa';
  if (slug === 'crm-saude') return 'saude';
  return 'spa';
}
function tipoFixo(slug) {
  return slug === 'crm-spas' || slug === 'crm-saude';
}

function toTitleCase(str) {
  if (!str) return '';
  var min = new Set(['de','da','do','das','dos','e','em','na','no','nas','nos','a','o','as','os','com','para','por','ltda','me','eireli','sa','epp','s/a']);
  return str.toLowerCase().split(' ').map(function(w, i) {
    return (i === 0 || !min.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  }).join(' ');
}

function formatarEndereco(d) {
  return [
    d.logradouro, d.numero, d.complemento, d.bairro,
    d.municipio && d.uf ? d.municipio + '/' + d.uf : d.municipio,
    d.cep ? d.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : '',
  ].filter(Boolean).join(', ');
}

export default function ContractModal({ client, companySlug, onClose }) {
  const [tipo, setTipo] = useState(function() { return defaultTipo(companySlug); });
  const fixo = tipoFixo(companySlug);

  const [form, setForm] = useState({
    // Contratante — editáveis, default do CRM
    razao:         client.razao    || '',
    cnpj:          client.cnpj     || '',
    endereco:      client.endereco || '',
    // Representante legal
    representante: client.contato  || '',
    nacionalidade: 'brasileiro/a',
    estadoCivil:   '',
    profissao:     '',
    cpfRep:        '',
    rgRep:         '',
    cargo:         '',
    // Vigência e valores
    dataContrato:  hoje(),
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

  function set(k, v) { setForm(function(f) { var n = Object.assign({}, f); n[k] = v; return n; }); }
  function showMsg(text, err) { setMsg(text); setIsError(!!err); }

  function changeModalidade(val) {
    set('modalidade', val);
    set('precoUnitario', val === 'autonomo' ? '45,90' : '59,90');
  }

  // ── Consulta CNPJ — usa o CNPJ do formulário (editável) ──────────────────
  async function consultarCnpj() {
    const digits = form.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) { showMsg('CNPJ deve ter 14 dígitos.', true); return; }
    setCnpjLoading(true);
    showMsg('');
    try {
      const r = await fetch('https://publica.cnpj.ws/cnpj/' + digits);
      if (!r.ok) throw new Error('CNPJ não encontrado na Receita Federal.');
      const data = await r.json();

      // Enriquece os campos editáveis do contratante
      setForm(function(f) {
        var n = Object.assign({}, f);
        if (data.razao_social) n.razao    = toTitleCase(data.razao_social);
        var end = formatarEndereco(data);
        if (end)               n.endereco = end;
        // Representante pelo primeiro sócio do QSA
        var socio = (data.qsa && data.qsa[0] && (data.qsa[0].nome_socio || data.qsa[0].nome_representante)) || '';
        if (socio)             n.representante = toTitleCase(socio);
        return n;
      });

      var socio = (data.qsa && data.qsa[0] && (data.qsa[0].nome_socio || data.qsa[0].nome_representante)) || '';
      showMsg(
        '✅ ' + toTitleCase(data.razao_social || '') +
        (data.municipio ? ' — ' + data.municipio + '/' + data.uf : '') +
        (socio ? ' | Representante: ' + toTitleCase(socio) : ' (sem QSA público)')
      );
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
      var payload = {
        clientId:      client.id,
        tipo:          tipo,
        // Contratante (valores do formulário, não do banco)
        razao:         form.razao,
        cnpj:          form.cnpj,
        endereco:      form.endereco,
        // Representante
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

      var response = await api.post('/contracts/generate', payload, { responseType: 'blob' });
      var url  = URL.createObjectURL(new Blob([response.data]));
      var slug = (form.razao || client.contato || 'Contrato')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = 'Contrato_' + slug + '.docx';
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      showMsg((err.response && err.response.data && err.response.data.error) || 'Erro ao gerar contrato.', true);
    } finally {
      setLoading(false);
    }
  }

  var isSaude = tipo === 'saude';
  var isSpa   = tipo === 'spa';

  return (
    <div className={styles.overlay} onClick={function(e) { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} style={{ maxWidth: 620 }}>

        <div className={styles.modalHeader}>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <h2>📄 Gerar Contrato</h2>
            <span style={{ fontSize:12, color:'var(--text-muted)' }}>{client.razao || client.contato}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={{ padding:'16px 24px', display:'flex', flexDirection:'column', gap:14, overflowY:'auto', maxHeight:'78vh' }}>

          {/* Tipo de contrato */}
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
                <TipoBtn ativo={isSpa}   onClick={function() { setTipo('spa');   }} label="P. Spa — Massagem Reserva" />
                <TipoBtn ativo={isSaude} onClick={function() { setTipo('saude'); }} label="P. Saúde — Clínicas e Consultórios" />
              </div>
            </div>
          )}

          {/* Dados do CONTRATANTE — todos editáveis */}
          <div className={styles.section}>
            <h3>Contratante</h3>
            <div className={styles.grid2}>
              <FormField label="Razão Social" value={form.razao}
                onChange={function(v) { set('razao', v); }} placeholder="Razão Social" />
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>CNPJ</span>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={form.cnpj} onChange={function(e) { set('cnpj', e.target.value); }}
                    placeholder="00.000.000/0000-00"
                    style={{ flex:1, padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)',
                             background:'var(--card)', color:'var(--text)', fontSize:13 }} />
                  <button type="button" onClick={consultarCnpj} disabled={cnpjLoading}
                    title="Consultar CNPJ na Receita Federal"
                    style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)',
                             background:'var(--card)', cursor:'pointer', fontSize:13, whiteSpace:'nowrap', color:'var(--accent)' }}>
                    {cnpjLoading ? '⏳' : '🔍'}
                  </button>
                </div>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <FormField label="Endereço" value={form.endereco}
                  onChange={function(v) { set('endereco', v); }} placeholder="Endereço completo, Cidade/UF, CEP" />
              </div>
            </div>
          </div>

          {/* Representante legal */}
          <div className={styles.section}>
            <h3>Representante legal</h3>
            <div className={styles.grid2}>
              <FormField label="Nome *"        value={form.representante}  onChange={function(v){set('representante',v);}} placeholder="Nome completo" />
              <FormField label="Cargo *"       value={form.cargo}          onChange={function(v){set('cargo',v);}}         placeholder="Ex: Sócio-Administrador" />
              <FormField label="Nacionalidade" value={form.nacionalidade}  onChange={function(v){set('nacionalidade',v);}} placeholder="brasileiro/a" />
              <FormField label="Estado civil"  value={form.estadoCivil}    onChange={function(v){set('estadoCivil',v);}}   placeholder="casado/a, solteiro/a…" />
              <FormField label="Profissão"     value={form.profissao}      onChange={function(v){set('profissao',v);}}     placeholder="Ex: empresário/a" />
              <FormField label="CPF"           value={form.cpfRep}         onChange={function(v){set('cpfRep',v);}}        placeholder="000.000.000-00" />
              <FormField label="RG"            value={form.rgRep}          onChange={function(v){set('rgRep',v);}}         placeholder="00.000.000-0 SSP/SP" />
            </div>
          </div>

          {/* Valores e vigência */}
          <div className={styles.section}>
            <h3>Valores e vigência</h3>
            <div className={styles.grid2}>
              <FormField label="Valor mensal (R$) — cláusula 4.2" value={form.valorMensal}
                onChange={function(v){set('valorMensal',v);}} placeholder="Ex: 79,90" />
              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>Data de assinatura</span>
                <input type="date" value={form.dataContrato}
                  onChange={function(e){set('dataContrato',e.target.value);}}
                  style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)',
                           background:'var(--card)', color:'var(--text)', fontSize:13 }} />
              </div>
            </div>
          </div>

          {/* Anexo I — Spa */}
          {isSpa && (
            <div className={styles.section}>
              <h3>Anexo I — P. Spa</h3>
              <div className={styles.grid2}>
                <FormField label="Preço por unidade (R$)" value={form.precoSpa}
                  onChange={function(v){set('precoSpa',v);}} placeholder="79,90" />
                <FormField label="Qtd. unidades" value={form.qtdSpa}
                  onChange={function(v){set('qtdSpa',v);}} placeholder="1" />
              </div>
              <TotalPreview qtd={parseInt(form.qtdSpa)||1} preco={parseFloat(form.precoSpa.replace(',','.'))||0} />
            </div>
          )}

          {/* Anexo I — Saúde */}
          {isSaude && (
            <div className={styles.section}>
              <h3>Anexo I — P. Saúde</h3>
              <div style={{ display:'flex', gap:16, marginBottom:10 }}>
                <label style={{ fontSize:13, cursor:'pointer' }}>
                  <input type="radio" value="clinica" checked={form.modalidade==='clinica'}
                    onChange={function(){changeModalidade('clinica');}} style={{ marginRight:6 }}/>
                  Clínica / Consultório
                </label>
                <label style={{ fontSize:13, cursor:'pointer' }}>
                  <input type="radio" value="autonomo" checked={form.modalidade==='autonomo'}
                    onChange={function(){changeModalidade('autonomo');}} style={{ marginRight:6 }}/>
                  Profissional Autônomo
                </label>
              </div>
              <div className={styles.grid2}>
                <FormField label="Preço por unidade (R$)" value={form.precoUnitario}
                  onChange={function(v){set('precoUnitario',v);}}
                  placeholder={form.modalidade==='autonomo' ? '45,90' : '59,90'} />
                <FormField label="Quantidade" value={form.quantidade}
                  onChange={function(v){set('quantidade',v);}} placeholder="1" />
              </div>
              <TotalPreview qtd={parseInt(form.quantidade)||1} preco={parseFloat(form.precoUnitario.replace(',','.'))||0} />
            </div>
          )}

          {/* Mensagem feedback */}
          {msg && (
            <div style={{
              padding:'8px 12px', borderRadius:6, fontSize:12,
              background: isError ? '#fee2e2' : 'var(--card)',
              color:       isError ? '#b91c1c' : 'var(--text)',
              border: '1px solid ' + (isError ? '#fca5a5' : 'var(--border)'),
            }}>{msg}</div>
          )}
        </div>

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

function TipoBtn({ ativo, onClick, label }) {
  return (
    <button onClick={onClick} style={{
      flex:1, padding:'8px 14px', borderRadius:8, cursor:'pointer', fontSize:13,
      fontWeight: ativo ? 600 : 400,
      background: ativo ? 'var(--accent)' : 'var(--card)',
      color:      ativo ? '#fff'          : 'var(--text)',
      border:     ativo ? '2px solid var(--accent)' : '1px solid var(--border)',
      transition: 'all .15s',
    }}>{label}</button>
  );
}

function TotalPreview({ qtd, preco }) {
  return (
    <div style={{ marginTop:6, fontSize:12, color:'var(--text-muted)' }}>
      Total mensal: <strong style={{ color:'var(--text)' }}>R$ {(qtd * preco).toFixed(2).replace('.', ',')}</strong>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>{label}</span>
      <input value={value} onChange={function(e){onChange(e.target.value);}} placeholder={placeholder}
        style={{ padding:'6px 10px', borderRadius:6, border:'1px solid var(--border)',
                 background:'var(--card)', color:'var(--text)', fontSize:13 }} />
    </div>
  );
}
