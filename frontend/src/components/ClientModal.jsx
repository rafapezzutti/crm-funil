import React, { useState, useEffect, useRef } from 'react';
import styles from './Modal.module.css';

const STAGES  = [
  { key:'prosp',  label:'Prospectado' },
  { key:'neg',    label:'Em Negociação' },
  { key:'piloto', label:'Em Piloto' },
  { key:'prod',   label:'Em Produção' },
];
const SETORES = ['Varejo','Alimentação','Saúde','Educação','Serviços','Indústria','Tecnologia','Outros'];

const CNAE_SETOR = {
  '10':'Alimentação','11':'Alimentação','12':'Alimentação',
  '47':'Varejo','46':'Varejo','45':'Varejo',
  '56':'Alimentação',
  '62':'Tecnologia','63':'Tecnologia','61':'Tecnologia','95':'Tecnologia',
  '85':'Educação','72':'Educação',
  '86':'Saúde','87':'Saúde','88':'Saúde',
};

function cnpjDigits(v) { return (v || '').replace(/\D/g, ''); }

function formatarEndereco(d) {
  return [
    d.logradouro, d.numero, d.complemento, d.bairro,
    d.municipio && d.uf ? (d.municipio + '/' + d.uf) : d.municipio,
    d.cep ? d.cep.replace(/(\d{5})(\d{3})/, '$1-$2') : '',
  ].filter(Boolean).join(', ');
}

function toTitleCase(str) {
  var min = new Set(['de','da','do','das','dos','e','em','na','no','nas','nos','a','o','as','os','com','para','por','ltda','me','eireli','sa','epp']);
  return str.toLowerCase().split(' ').map(function(w, i) {
    return (i === 0 || !min.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  }).join(' ');
}

export default function ClientModal({ client, sdrs, sellers, onSave, onClose }) {
  var isEdit = !!client;
  var [form, setForm] = useState({
    stage:     (client && client._pendingStage) || (client && client.stage) || 'prosp',
    cnpj:      (client && client.cnpj)      || '',
    razao:     (client && client.razao)     || '',
    contato:   (client && client.contato)   || '',
    telefone:  (client && client.telefone)  || '',
    email:     (client && client.email)     || '',
    email_cob: (client && client.email_cob) || '',
    endereco:  (client && client.endereco)  || '',
    setor:     (client && client.setor)     || '',
    tvs:       (client && client.tvs)       || '',
    custo:     (client && client.custo)     || '',
    lead_resp: (client && client.lead_resp) || '',
    seller_id: (client && client.seller_id) || '',
    obs:       (client && client.obs)       || '',
  });
  var [saving,     setSaving]     = useState(false);
  var [cnpjStatus, setCnpjStatus] = useState(null);
  var [cnpjMsg,    setCnpjMsg]    = useState('');
  var fetchRef = useRef(null);

  var set    = function(k) { return function(e) { setForm(function(f) { var n = Object.assign({}, f); n[k] = e.target.value; return n; }); }; };
  var setVal = function(k, v) { setForm(function(f) { var n = Object.assign({}, f); n[k] = v; return n; }); };

  var needsCNPJ = form.stage === 'piloto' || form.stage === 'prod';

  useEffect(function() {
    var digits = cnpjDigits(form.cnpj);
    if (digits.length !== 14) {
      setCnpjStatus(null);
      setCnpjMsg('');
      return;
    }
    var ctrl = new AbortController();
    fetchRef.current = ctrl;
    setCnpjStatus('loading');
    setCnpjMsg('');

    fetch('https://publica.cnpj.ws/cnpj/' + digits, { signal: ctrl.signal })
      .then(function(r) {
        if (!r.ok) throw new Error('CNPJ não encontrado na Receita Federal.');
        return r.json();
      })
      .then(function(data) {
        if (data.razao_social) setVal('razao', toTitleCase(data.razao_social));
        var end = formatarEndereco(data);
        if (end) setVal('endereco', end);
        setForm(function(f) {
          var n = Object.assign({}, f);
          if (!n.email && data.email)         n.email    = data.email.toLowerCase();
          if (!n.telefone && data.ddd_telefone_1) {
            var d = (data.ddd_telefone_1 || '').replace(/\D/g, '');
            if (d.length >= 10) n.telefone = '(' + d.slice(0,2) + ') ' + d.slice(2, d.length === 11 ? 7 : 6) + '-' + d.slice(d.length === 11 ? 7 : 6);
          }
          var cnae = String(data.cnae_fiscal || '').slice(0, 2);
          if (!n.setor && CNAE_SETOR[cnae]) n.setor = CNAE_SETOR[cnae];
          return n;
        });
        setCnpjStatus('ok');
        setCnpjMsg('✅ ' + toTitleCase(data.razao_social || '') + (data.municipio ? ' — ' + data.municipio + '/' + data.uf : ''));
      })
      .catch(function(err) {
        if (err.name === 'AbortError') return;
        setCnpjStatus('error');
        setCnpjMsg(err.message || 'Erro ao consultar CNPJ.');
      });

    return function() { ctrl.abort(); };
  }, [form.cnpj]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (needsCNPJ && (!form.cnpj || !form.razao)) return;
    setSaving(true);
    var sdr    = sdrs.find(function(s) { return s.id === form.lead_resp; });
    var seller = sellers.find(function(s) { return s.id === form.seller_id; });
    await onSave(
      Object.assign({}, form, { _sdr_name: (sdr && sdr.name) || '', _seller_name: (seller && seller.name) || '' }),
      isEdit ? client.id : null
    );
    setSaving(false);
  }

  var cnpjIcon = cnpjStatus === 'loading' ? '⏳' : cnpjStatus === 'ok' ? '✅' : cnpjStatus === 'error' ? '❌' : '';

  return (
    React.createElement('div', { className: styles.overlay, onClick: function(e) { if (e.target === e.currentTarget) onClose(); } },
      React.createElement('div', { className: styles.modal },
        React.createElement('div', { className: styles.modalHeader },
          React.createElement('h2', null, isEdit ? 'Editar cliente' : 'Novo cliente'),
          React.createElement('button', { className: styles.closeBtn, onClick: onClose }, '✕')
        ),
        React.createElement('form', { onSubmit: handleSubmit, className: styles.form },
          React.createElement('div', { className: styles.row },
            React.createElement('label', null, 'Estágio',
              React.createElement('select', { value: form.stage, onChange: set('stage') },
                STAGES.map(function(s) { return React.createElement('option', { key: s.key, value: s.key }, s.label); })
              )
            ),
            React.createElement('label', null, 'Setor',
              React.createElement('select', { value: form.setor, onChange: set('setor') },
                React.createElement('option', { value: '' }, '—'),
                SETORES.map(function(s) { return React.createElement('option', { key: s }, s); })
              )
            )
          ),
          needsCNPJ && React.createElement('p', { className: styles.hint }, '⚠️ CNPJ e Razão Social obrigatórios neste estágio.'),
          React.createElement('div', { className: styles.row },
            React.createElement('label', null,
              'CNPJ ', needsCNPJ && React.createElement('span', { className: styles.req }, '*'),
              React.createElement('div', { style: { position:'relative', display:'flex', alignItems:'center' } },
                React.createElement('input', {
                  value: form.cnpj, onChange: set('cnpj'), required: needsCNPJ,
                  placeholder: '00.000.000/0000-00',
                  style: { flex: 1, paddingRight: cnpjIcon ? 28 : undefined }
                }),
                cnpjIcon && React.createElement('span', {
                  style: { position:'absolute', right:8, fontSize:14, pointerEvents:'none' }
                }, cnpjIcon)
              )
            ),
            React.createElement('label', null,
              'Razão Social ', needsCNPJ && React.createElement('span', { className: styles.req }, '*'),
              React.createElement('input', { value: form.razao, onChange: set('razao'), required: needsCNPJ })
            )
          ),
          cnpjMsg && React.createElement('p', {
            style: {
              margin:'-4px 0 4px', fontSize:11, padding:'5px 10px', borderRadius:5,
              background: cnpjStatus === 'error' ? '#fee2e2' : 'var(--card)',
              color:      cnpjStatus === 'error' ? '#b91c1c' : 'var(--text-muted)',
              border: '1px solid ' + (cnpjStatus === 'error' ? '#fca5a5' : 'var(--border)'),
            }
          }, cnpjMsg),
          React.createElement('div', { className: styles.row },
            React.createElement('label', null, 'Nome do contato', React.createElement('input', { value: form.contato, onChange: set('contato') })),
            React.createElement('label', null, 'Telefone', React.createElement('input', { value: form.telefone, onChange: set('telefone') }))
          ),
          React.createElement('div', { className: styles.row },
            React.createElement('label', null, 'E-mail', React.createElement('input', { type:'email', value: form.email, onChange: set('email') })),
            React.createElement('label', null, 'E-mail cobrança', React.createElement('input', { type:'email', value: form.email_cob, onChange: set('email_cob') }))
          ),
          React.createElement('label', null, 'Endereço', React.createElement('input', { value: form.endereco, onChange: set('endereco') })),
          React.createElement('div', { className: styles.row },
            React.createElement('label', null, 'Qtd TVs', React.createElement('input', { type:'number', min:'0', value: form.tvs, onChange: set('tvs') })),
            React.createElement('label', null, 'Custo mensal (R$)', React.createElement('input', { type:'number', min:'0', step:'0.01', value: form.custo, onChange: set('custo') }))
          ),
          React.createElement('div', { className: styles.row },
            React.createElement('label', null, 'SDR responsável',
              React.createElement('select', { value: form.lead_resp, onChange: set('lead_resp') },
                React.createElement('option', { value: '' }, '—'),
                sdrs.map(function(s) { return React.createElement('option', { key: s.id, value: s.id }, s.name); })
              )
            ),
            React.createElement('label', null, 'Vendedor',
              React.createElement('select', { value: form.seller_id, onChange: set('seller_id') },
                React.createElement('option', { value: '' }, '—'),
                sellers.map(function(s) { return React.createElement('option', { key: s.id, value: s.id }, s.name); })
              )
            )
          ),
          React.createElement('label', null, 'Observações', React.createElement('textarea', { rows: 3, value: form.obs, onChange: set('obs') })),
          React.createElement('div', { className: styles.modalFooter },
            React.createElement('button', { type:'button', className: styles.btnGhost, onClick: onClose }, 'Cancelar'),
            React.createElement('button', { type:'submit', className: styles.btnPrimary, disabled: saving }, saving ? 'Salvando…' : 'Salvar')
          )
        )
      )
    )
  );
}
