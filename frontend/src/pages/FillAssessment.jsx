/**
 * FillAssessment — página pública para o paciente preencher a ficha.
 * Rota: /avaliacao/:token  (sem autenticação)
 */
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API = (import.meta.env.VITE_API_URL || 'https://crm-funil-api.onrender.com') + '/api';

// ── helpers ──────────────────────────────────────────────────────────────────
function Radio({ name, value, label, checked, onChange }) {
  return (
    <label style={{ display:'inline-flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:13, marginRight:16, marginBottom:4 }}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange}
        style={{ accentColor:'#1a5cd4', width:14, height:14 }} />
      {label}
    </label>
  );
}
function Check({ name, label, checked, onChange }) {
  return (
    <label style={{ display:'inline-flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:13, marginRight:14, marginBottom:4 }}>
      <input type="checkbox" name={name} checked={checked} onChange={onChange}
        style={{ accentColor:'#1a5cd4', width:14, height:14 }} />
      {label}
    </label>
  );
}
function Field({ label, value, onChange, full, rows, placeholder }) {
  const s = { width:'100%', padding:'5px 8px', border:'1px solid #ccc', borderRadius:4, fontSize:13,
               fontFamily:'Arial,sans-serif', boxSizing:'border-box', background:'#fff' };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2, flex: full ? '1 1 100%' : '1 1 45%', minWidth: full ? '100%' : 120 }}>
      {label && <span style={{ fontSize:11, fontWeight:600, color:'#555' }}>{label}</span>}
      {rows
        ? <textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder||''} style={{...s,resize:'vertical'}} />
        : <input    value={value} onChange={onChange} placeholder={placeholder||''} style={s} />}
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ background:'#1a5cd4', color:'white', fontWeight:700, fontSize:13,
                    padding:'4px 10px', marginBottom:6, borderRadius:4 }}>{title}</div>
      <div style={{ padding:'0 4px' }}>{children}</div>
    </div>
  );
}
function SubSection({ title, children }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ background:'#e8eef8', fontWeight:700, fontSize:12,
                    padding:'3px 8px', marginBottom:5, border:'1px solid #c5d3e8' }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ children, gap }) {
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap: gap||8, marginBottom:6 }}>
      {children}
    </div>
  );
}
function TableRow({ cells }) {
  return (
    <tr>
      {cells.map((c,i) => (
        <td key={i} style={{ border:'1px solid #ccc', padding:'4px 8px', fontSize:12, verticalAlign:'top' }}>{c}</td>
      ))}
    </tr>
  );
}

// ── Form state inicial ───────────────────────────────────────────────────────
function initForm(clientName) {
  return {
    nome: clientName||'', idade:'', leito:'', sexo:'', raca:'', ocupacao:'',
    procedencia:'', dataAvaliacao:'', dih:'',
    diagnosticoCli:'', queixas:'', hda:'', hdp:'',
    ant_diabetes:'nao', ant_has:'nao', ant_tabagismo:'nao', ant_etilismo:'nao', ant_cardio:'nao',
    fc:'', spo2:'', fr:'', temp:'', pa:'',
    consciencia:'consciente-orientado', emocional:'calmo',
    // Respiratório
    desconforto:'nao', desconfortoQuais:'',
    viaAerea:'natural', ventilacao:[], ventInterface:'',
    ritmo:[], padrao:[], expansibilidade:'normal', expansSimetria:'',
    tosse:[], secrecao:'',
    ausculta_pulm:'', ausculta_card:'',
    abdome:'normal',
    // Neuromusculoesquelético
    movVoluntario:'', movInvoluntario:'', plegia:'', paresia:'',
    forcaMuscular:'normal', forcaDesc:'',
    tonus:'normal', reflexos:'normal', reflexosObs:'',
    amplArticular:'normal', amplDesc:'', desvioPostural:'',
    deambulacao:'livre', marcha:'',
    equilibrio:'normal', equilibrioObs:'',
    pele:'',
    edema:'nao', edemaLocal:'', edemaTipo:'', edemaGrau:'',
    avp:'nao', avpLocal:'',
    avc:'nao', avcLocal:'',
    sondaVesical:'nao',
    observacoes:'', diagnosticoFisio:'',
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function FillAssessment() {
  const { token } = useParams();
  const [meta,    setMeta]    = useState(null);
  const [form,    setForm]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [done,    setDone]    = useState(false);
  const [error,   setError]   = useState('');

  useEffect(function() {
    fetch(API + '/assessments/public/' + token)
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d }; }); })
      .then(function({ ok, d }) {
        if (!ok) { setError(d.error || 'Erro ao carregar ficha.'); setLoading(false); return; }
        setMeta(d);
        setForm(d.formData ? Object.assign(initForm(d.clientName), d.formData) : initForm(d.clientName));
        setLoading(false);
      })
      .catch(function() { setError('Erro de conexão.'); setLoading(false); });
  }, [token]);

  function set(k) { return function(e) { setForm(function(f) { var n=Object.assign({},f); n[k]=e.target.value; return n; }); }; }
  function setV(k,v) { setForm(function(f) { var n=Object.assign({},f); n[k]=v; return n; }); }
  function toggleArr(k, v) {
    setForm(function(f) {
      var n=Object.assign({},f);
      var arr=[...( n[k]||[])];
      var i=arr.indexOf(v);
      if(i>=0) arr.splice(i,1); else arr.push(v);
      n[k]=arr; return n;
    });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      var r = await fetch(API + '/assessments/public/' + token, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ formData: form }),
      });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDone(true);
    } catch(err) {
      setError(err.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  // ── Telas de estado ──────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Arial,sans-serif', background:'#f0f4fb' }}>
      <div style={{ textAlign:'center', color:'#1a5cd4' }}>
        <div style={{ fontSize:32, marginBottom:12 }}>⏳</div>
        <p>Carregando ficha de avaliação…</p>
      </div>
    </div>
  );
  if (error) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Arial,sans-serif', background:'#f0f4fb' }}>
      <div style={{ textAlign:'center', background:'white', borderRadius:12, padding:40, maxWidth:400, boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize:40, marginBottom:16 }}>⚠️</div>
        <p style={{ color:'#b91c1c', fontWeight:600 }}>{error}</p>
        <p style={{ color:'#888', fontSize:13 }}>Caso precise de ajuda, entre em contato com a clínica.</p>
      </div>
    </div>
  );
  if (done) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontFamily:'Arial,sans-serif', background:'#f0f4fb' }}>
      <div style={{ textAlign:'center', background:'white', borderRadius:12, padding:40, maxWidth:400, boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
        <h2 style={{ color:'#1a5cd4' }}>Ficha enviada com sucesso!</h2>
        <p style={{ color:'#555' }}>Obrigado, <strong>{form.nome}</strong>. Suas informações foram registradas e serão revisadas pelo fisioterapeuta.</p>
      </div>
    </div>
  );

  // ── Formulário principal ─────────────────────────────────────────────────
  var f = form;
  var arr = function(k) { return f[k]||[]; };

  return (
    <div style={{ fontFamily:'Arial,sans-serif', background:'#f0f4fb', minHeight:'100vh', padding:'20px 10px' }}>
      <div style={{ maxWidth:800, margin:'0 auto', background:'white', borderRadius:12,
                    boxShadow:'0 4px 24px rgba(0,0,0,0.10)', overflow:'hidden' }}>

        {/* Cabeçalho */}
        <div style={{ background:'linear-gradient(135deg,#1a5cd4,#00d4d4)', color:'white', padding:'24px 28px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:8 }}>
            <img src="/logo-psolucoes.svg" alt="P. Soluções" style={{ height:44, filter:'brightness(0) invert(1)' }} />
          </div>
          <h1 style={{ margin:0, fontSize:20, fontWeight:700 }}>Ficha de Avaliação Fisioterapêutica</h1>
          {meta.physioName && <p style={{ margin:'4px 0 0', opacity:0.85, fontSize:13 }}>Fisioterapeuta: {meta.physioName}</p>}
          {meta.companyName && <p style={{ margin:'2px 0 0', opacity:0.7, fontSize:12 }}>{meta.companyName}</p>}
        </div>

        <form onSubmit={submit} style={{ padding:'24px 28px' }}>
          {/* IDENTIFICAÇÃO */}
          <Section title="Identificação do Paciente">
            <Row>
              <Field label="Nome completo" value={f.nome}        onChange={set('nome')}        full placeholder="Nome do paciente" />
            </Row>
            <Row>
              <Field label="Idade"           value={f.idade}      onChange={set('idade')}      placeholder="Ex: 45" />
              <Field label="Leito"           value={f.leito}      onChange={set('leito')}      placeholder="Ex: 12A" />
              <Field label="Sexo"            value={f.sexo}       onChange={set('sexo')}       placeholder="M / F" />
              <Field label="Raça"            value={f.raca}       onChange={set('raca')}       placeholder="Ex: Branca" />
            </Row>
            <Row>
              <Field label="Ocupação"        value={f.ocupacao}   onChange={set('ocupacao')}   placeholder="Ex: Professor" />
              <Field label="Local de Procedência" value={f.procedencia} onChange={set('procedencia')} placeholder="Cidade/UF" />
              <Field label="Data da Avaliação" value={f.dataAvaliacao} onChange={set('dataAvaliacao')} placeholder="DD/MM/AAAA" />
              <Field label="DIH"             value={f.dih}        onChange={set('dih')}        placeholder="Data" />
            </Row>
          </Section>

          {/* DIAGNÓSTICO / QUEIXAS */}
          <Section title="Diagnóstico e Queixas">
            <Field label="Diagnóstico Clínico" value={f.diagnosticoCli} onChange={set('diagnosticoCli')} rows={2} full />
            <div style={{ height:6 }} />
            <Field label="Queixas Principais" value={f.queixas} onChange={set('queixas')} rows={2} full />
            <div style={{ height:6 }} />
            <Field label="HDA — História da Doença Atual" value={f.hda} onChange={set('hda')} rows={3} full />
            <div style={{ height:6 }} />
            <Field label="HDP — História da Doença Pregressa" value={f.hdp} onChange={set('hdp')} rows={2} full />
          </Section>

          {/* ANTECEDENTES */}
          <Section title="Antecedentes">
            <Row>
              {[['Diabetes','ant_diabetes'],['HAS','ant_has'],['Tabagismo','ant_tabagismo'],
                ['Etilismo','ant_etilismo'],['Cardiopatias','ant_cardio']].map(function([lbl,k]) {
                return (
                  <div key={k} style={{ display:'flex', alignItems:'center', gap:10, border:'1px solid #ddd', borderRadius:6, padding:'6px 12px', fontSize:13 }}>
                    <strong>{lbl}:</strong>
                    <Radio name={k} value="sim" label="Sim" checked={f[k]==='sim'} onChange={set(k)} />
                    <Radio name={k} value="nao" label="Não" checked={f[k]==='nao'} onChange={set(k)} />
                  </div>
                );
              })}
            </Row>
          </Section>

          {/* SINAIS VITAIS */}
          <Section title="Sinais Vitais">
            <Row>
              {[['FC (bpm)','fc'],['SpO2 (%)','spo2'],['FR (irpm)','fr'],['Temperatura (°C)','temp'],['PA (mmHg)','pa']].map(function([lbl,k]) {
                return <Field key={k} label={lbl} value={f[k]} onChange={set(k)} placeholder="" />;
              })}
            </Row>
          </Section>

          {/* NÍVEL DE CONSCIÊNCIA */}
          <Section title="Nível de Consciência">
            <Row>
              {['consciente-orientado','consciente com momentos de desorientação','desorientado','sonolento','torporoso','inconsciente'].map(function(v) {
                return <Radio key={v} name="consciencia" value={v} label={v.charAt(0).toUpperCase()+v.slice(1)} checked={f.consciencia===v} onChange={set('consciencia')} />;
              })}
            </Row>
          </Section>

          {/* ESTADO EMOCIONAL */}
          <Section title="Estado Emocional">
            <Row>
              {['calmo','agitado','depressivo','ansioso','agressivo'].map(function(v) {
                return <Radio key={v} name="emocional" value={v} label={v.charAt(0).toUpperCase()+v.slice(1)} checked={f.emocional===v} onChange={set('emocional')} />;
              })}
            </Row>
          </Section>

          {/* SISTEMA RESPIRATÓRIO */}
          <Section title="Sistema Respiratório">
            <SubSection title="Sinais de Desconforto Respiratório">
              <Row>
                <Radio name="desconforto" value="sim" label="Sim" checked={f.desconforto==='sim'} onChange={set('desconforto')} />
                <Radio name="desconforto" value="nao" label="Não" checked={f.desconforto==='nao'} onChange={set('desconforto')} />
                {f.desconforto==='sim' && <Field label="Quais:" value={f.desconfortoQuais} onChange={set('desconfortoQuais')} full />}
              </Row>
            </SubSection>
            <SubSection title="Tipo de Via Aérea">
              <Row>
                {['Natural','Traqueostomia','TOT'].map(function(v) {
                  return <Radio key={v} name="viaAerea" value={v.toLowerCase()} label={v} checked={f.viaAerea===v.toLowerCase()} onChange={set('viaAerea')} />;
                })}
              </Row>
            </SubSection>
            <SubSection title="Ventilação">
              <Row>
                {['VE','VE com suporte de O2'].map(function(v) {
                  return <Check key={v} name="vent" label={v} checked={arr('ventilacao').includes(v)} onChange={function(){toggleArr('ventilacao',v);}} />;
                })}
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
                  <span>Interface:</span>
                  <input value={f.ventInterface} onChange={set('ventInterface')} style={{ width:120, padding:'3px 6px', border:'1px solid #ccc', borderRadius:4, fontSize:13 }} />
                </div>
              </Row>
            </SubSection>
            <SubSection title="Ritmo e Frequência Respiratória">
              <Row>
                {['regular','irregular','eupnéia','taquipnéia','bradipnéia'].map(function(v) {
                  return <Check key={v} label={v.charAt(0).toUpperCase()+v.slice(1)} checked={arr('ritmo').includes(v)} onChange={function(){toggleArr('ritmo',v);}} />;
                })}
              </Row>
            </SubSection>
            <SubSection title="Padrão Muscular Ventilatório">
              <Row>
                {['diafragmático','costo-diafragmático','costal','acessório','paradoxal'].map(function(v) {
                  return <Check key={v} label={v.charAt(0).toUpperCase()+v.slice(1)} checked={arr('padrao').includes(v)} onChange={function(){toggleArr('padrao',v);}} />;
                })}
              </Row>
            </SubSection>
            <SubSection title="Expansibilidade Torácica">
              <Row>
                <Radio name="expans" value="normal"    label="Normal"     checked={f.expansibilidade==='normal'}    onChange={set('expansibilidade')} />
                <Radio name="expans" value="diminuida" label="Diminuída"  checked={f.expansibilidade==='diminuida'} onChange={set('expansibilidade')} />
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
                  <Radio name="expans" value="assimetrica" label="Assimétrica:" checked={f.expansibilidade==='assimetrica'} onChange={set('expansibilidade')} />
                  {f.expansibilidade==='assimetrica' && <input value={f.expansSimetria} onChange={set('expansSimetria')} style={{ width:120, padding:'3px 6px', border:'1px solid #ccc', borderRadius:4, fontSize:13 }} />}
                </div>
              </Row>
            </SubSection>
            <SubSection title="Tosse">
              <Row>
                {['ausente','periódica','frequente','seca','produtiva','eficaz','parcialmente eficaz','ineficaz'].map(function(v) {
                  return <Check key={v} label={v.charAt(0).toUpperCase()+v.slice(1)} checked={arr('tosse').includes(v)} onChange={function(){toggleArr('tosse',v);}} />;
                })}
              </Row>
            </SubSection>
            <Field label="Aspecto da secreção" value={f.secrecao} onChange={set('secrecao')} full />
          </Section>

          {/* AUSCULTA + ABDOME */}
          <Section title="Ausculta e Abdome">
            <Field label="Ausculta Pulmonar"  value={f.ausculta_pulm}  onChange={set('ausculta_pulm')}  rows={2} full />
            <div style={{ height:6 }} />
            <Field label="Ausculta Cardíaca"  value={f.ausculta_card}  onChange={set('ausculta_card')}  rows={1} full />
            <div style={{ height:6 }} />
            <div style={{ fontSize:12, fontWeight:600, marginBottom:4 }}>Abdome</div>
            <Row>
              {['normal','rígido','flácido','distendido','doloroso'].map(function(v) {
                return <Radio key={v} name="abdome" value={v} label={v.charAt(0).toUpperCase()+v.slice(1)} checked={f.abdome===v} onChange={set('abdome')} />;
              })}
            </Row>
          </Section>

          {/* SISTEMA NEUROMUSCULOESQUELÉTICO */}
          <Section title="Sistema Neuromusculoesquelético">
            <SubSection title="Movimento">
              <Row>
                <Field label="Mov. Voluntário"  value={f.movVoluntario}  onChange={set('movVoluntario')}  />
                <Field label="Mov. Involuntário" value={f.movInvoluntario} onChange={set('movInvoluntario')} />
                <Field label="Plegia"  value={f.plegia}  onChange={set('plegia')}  />
                <Field label="Paresia" value={f.paresia} onChange={set('paresia')} />
              </Row>
            </SubSection>
            <SubSection title="Força Muscular">
              <Row>
                <Radio name="forca" value="normal"    label="Normal"    checked={f.forcaMuscular==='normal'}    onChange={set('forcaMuscular')} />
                <Radio name="forca" value="diminuida" label="Diminuída" checked={f.forcaMuscular==='diminuida'} onChange={set('forcaMuscular')} />
                {f.forcaMuscular==='diminuida' && <Field value={f.forcaDesc} onChange={set('forcaDesc')} placeholder="Descrever" />}
              </Row>
            </SubSection>
            <SubSection title="Tônus">
              <Row>
                {[['normal','Normal'],['hipotonico','Hipotônico'],['hipertonico','Hipertônico'],['clonus','Clônus']].map(function([v,l]) {
                  return <Radio key={v} name="tonus" value={v} label={l} checked={f.tonus===v} onChange={set('tonus')} />;
                })}
              </Row>
            </SubSection>
            <SubSection title="Reflexos">
              <Row>
                {[['normal','Normal'],['hiperreflexia','Hiperreflexia'],['hiporreflexia','Hiporreflexia']].map(function([v,l]) {
                  return <Radio key={v} name="reflexos" value={v} label={l} checked={f.reflexos===v} onChange={set('reflexos')} />;
                })}
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
                  <Radio name="reflexos" value="ausencia" label="Ausência:" checked={f.reflexos==='ausencia'} onChange={set('reflexos')} />
                  {f.reflexos==='ausencia' && <input value={f.reflexosObs} onChange={set('reflexosObs')} style={{ width:120, padding:'3px 6px', border:'1px solid #ccc', borderRadius:4, fontSize:13 }} />}
                </div>
              </Row>
            </SubSection>
            <SubSection title="Amplitude Articular">
              <Row>
                {[['normal','Normal'],['diminuida','Diminuída'],['luxacao','Luxação'],['rigidez','Rigidez'],['fratura','Fratura']].map(function([v,l]) {
                  return <Radio key={v} name="ampla" value={v} label={l} checked={f.amplArticular===v} onChange={set('amplArticular')} />;
                })}
              </Row>
              {['diminuida','luxacao','rigidez'].includes(f.amplArticular) &&
                <Field value={f.amplDesc} onChange={set('amplDesc')} placeholder="Descrever" full />}
            </SubSection>
            <Field label="Desvios Posturais" value={f.desvioPosural||f.desvioPostural} onChange={set('desvioPostural')} full />
            <div style={{ height:6 }} />
            <SubSection title="Deambulação">
              <Row>
                {[['livre','Livre'],['bengala','Bengala'],['andador','Andador'],['cadeira','Cadeira de Rodas'],['restrito','Restrito ao Leito']].map(function([v,l]) {
                  return <Radio key={v} name="deambulacao" value={v} label={l} checked={f.deambulacao===v} onChange={set('deambulacao')} />;
                })}
              </Row>
            </SubSection>
            <Field label="Marcha" value={f.marcha} onChange={set('marcha')} full />
            <div style={{ height:6 }} />
            <SubSection title="Equilíbrio / Coordenação">
              <Row>
                <Radio name="equilibrio" value="normal"  label="Normal"  checked={f.equilibrio==='normal'}  onChange={set('equilibrio')} />
                <Radio name="equilibrio" value="anormal" label="Anormal" checked={f.equilibrio==='anormal'} onChange={set('equilibrio')} />
                {f.equilibrio==='anormal' && <Field value={f.equilibrioObs} onChange={set('equilibrioObs')} placeholder="Descrever" />}
              </Row>
            </SubSection>
            <Field label="Pele" value={f.pele} onChange={set('pele')} full />
            <div style={{ height:6 }} />
            <SubSection title="Edema">
              <Row>
                <Radio name="edema" value="sim" label="Sim" checked={f.edema==='sim'} onChange={set('edema')} />
                <Radio name="edema" value="nao" label="Não" checked={f.edema==='nao'} onChange={set('edema')} />
              </Row>
              {f.edema==='sim' && (
                <Row>
                  <Field label="Local"  value={f.edemaLocal} onChange={set('edemaLocal')} />
                  <Field label="Tipo"   value={f.edemaTipo}  onChange={set('edemaTipo')}  />
                  <Field label="Grau"   value={f.edemaGrau}  onChange={set('edemaGrau')}  />
                </Row>
              )}
            </SubSection>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:8 }}>
              <tbody>
                <tr>
                  <td style={{ border:'1px solid #ccc', padding:'6px 10px', width:'33%' }}>
                    <div style={{ fontWeight:700, marginBottom:4 }}>AVP</div>
                    <Row>
                      <Radio name="avp" value="sim" label="Sim" checked={f.avp==='sim'} onChange={set('avp')} />
                      <Radio name="avp" value="nao" label="Não" checked={f.avp==='nao'} onChange={set('avp')} />
                    </Row>
                    {f.avp==='sim' && <div style={{ marginTop:4 }}><span style={{ fontSize:11 }}>Local: </span><input value={f.avpLocal} onChange={set('avpLocal')} style={{ width:'70%', padding:'2px 5px', border:'1px solid #ccc', borderRadius:3, fontSize:12 }} /></div>}
                  </td>
                  <td style={{ border:'1px solid #ccc', padding:'6px 10px', width:'33%' }}>
                    <div style={{ fontWeight:700, marginBottom:4 }}>AVC</div>
                    <Row>
                      <Radio name="avc" value="sim" label="Sim" checked={f.avc==='sim'} onChange={set('avc')} />
                      <Radio name="avc" value="nao" label="Não" checked={f.avc==='nao'} onChange={set('avc')} />
                    </Row>
                    {f.avc==='sim' && <div style={{ marginTop:4 }}><span style={{ fontSize:11 }}>Local: </span><input value={f.avcLocal} onChange={set('avcLocal')} style={{ width:'70%', padding:'2px 5px', border:'1px solid #ccc', borderRadius:3, fontSize:12 }} /></div>}
                  </td>
                  <td style={{ border:'1px solid #ccc', padding:'6px 10px', width:'33%' }}>
                    <div style={{ fontWeight:700, marginBottom:4 }}>Sonda Vesical</div>
                    <Row>
                      <Radio name="sonda" value="sim" label="Sim" checked={f.sondaVesical==='sim'} onChange={set('sondaVesical')} />
                      <Radio name="sonda" value="nao" label="Não" checked={f.sondaVesical==='nao'} onChange={set('sondaVesical')} />
                    </Row>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* CONCLUSÃO */}
          <Section title="Conclusão">
            <Field label="Observações" value={f.observacoes} onChange={set('observacoes')} rows={3} full />
            <div style={{ height:6 }} />
            <Field label="Diagnóstico Fisioterapêutico" value={f.diagnosticoFisio} onChange={set('diagnosticoFisio')} rows={3} full />
          </Section>

          {/* RODAPÉ */}
          <div style={{ marginTop:20, textAlign:'center', borderTop:'1px solid #eee', paddingTop:16 }}>
            <div style={{ display:'inline-block', width:220, borderTop:'2px solid #333', paddingTop:6, fontSize:12, color:'#555' }}>
              {meta.physioName || 'Fisioterapeuta'}
            </div>
          </div>

          {error && <div style={{ background:'#fee2e2', color:'#b91c1c', border:'1px solid #fca5a5', borderRadius:6, padding:'8px 14px', marginTop:12, fontSize:13 }}>{error}</div>}

          <div style={{ display:'flex', justifyContent:'center', marginTop:24 }}>
            <button type="submit" disabled={saving} style={{
              padding:'12px 48px', background:'linear-gradient(135deg,#1a5cd4,#00d4d4)', color:'white',
              border:'none', borderRadius:8, fontSize:15, fontWeight:600, cursor:'pointer',
              opacity: saving ? 0.7 : 1, boxShadow:'0 4px 14px rgba(26,92,212,0.3)',
            }}>
              {saving ? 'Enviando…' : '✅ Enviar Ficha de Avaliação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
