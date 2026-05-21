import React, { useState, useEffect } from 'react';
import api from '../api';
import styles from './Dashboard.module.css';

const STAGES = [
  { key:'prosp',  label:'Prospectados',  color:'#8892C8' },
  { key:'neg',    label:'Em Negociação', color:'#7B5EFF' },
  { key:'piloto', label:'Em Piloto',     color:'#FFB74D' },
  { key:'prod',   label:'Em Produção',   color:'#00DFC4' },
];

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/clients')
      .then(r => setClients(r.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.loading}>Carregando…</div>;

  const total = clients.length;
  const byStage  = s => clients.filter(c => c.stage === s);
  const prodList = byStage('prod');

  // MRR
  const mrr = prodList.reduce((s, c) => s + (Number(c.custo) || 0), 0);
  // TVs
  const tvs = prodList.reduce((s, c) => s + (Number(c.tvs) || 0), 0);

  // Setor distribution
  const setorMap = {};
  clients.forEach(c => { if (c.setor) setorMap[c.setor] = (setorMap[c.setor] || 0) + 1; });
  const setores = Object.entries(setorMap).sort((a,b) => b[1]-a[1]);

  // SDR ranking
  const sdrMap = {};
  clients.forEach(c => { if (c.sdr_name) sdrMap[c.sdr_name] = (sdrMap[c.sdr_name] || 0) + 1; });
  const sdrRank = Object.entries(sdrMap).sort((a,b) => b[1]-a[1]);

  // Seller ranking (prod only)
  const sellerMap = {};
  prodList.forEach(c => { if (c.seller_name) sellerMap[c.seller_name] = (sellerMap[c.seller_name] || 0) + 1; });
  const sellerRank = Object.entries(sellerMap).sort((a,b) => b[1]-a[1]);

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Dashboard</h1>

      {/* ── KPI cards ── */}
      <div className={styles.kpiGrid}>
        <KpiCard label="Total de clientes" value={total} />
        <KpiCard label="Em Produção"        value={prodList.length} accent />
        <KpiCard label="MRR"                value={`R$ ${mrr.toLocaleString('pt-BR',{minimumFractionDigits:0})}`} />
        <KpiCard label="TVs ativas"         value={tvs} />
      </div>

      <div className={styles.chartsRow}>
        {/* Funnel */}
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Funil de vendas</h2>
          <Funnel stages={STAGES} byStage={byStage} total={total} />
        </div>

        {/* Setor donut */}
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Clientes por setor</h2>
          <DonutChart data={setores} />
        </div>
      </div>

      <div className={styles.chartsRow}>
        {/* SDR bar */}
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Leads por SDR</h2>
          <BarChart data={sdrRank} color="#7B5EFF" />
        </div>
        {/* Seller bar */}
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Clientes em produção por Vendedor</h2>
          <BarChart data={sellerRank} color="#00DFC4" />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }) {
  return (
    <div className={`${styles.kpi} ${accent ? styles.kpiAccent : ''}`}>
      <div className={styles.kpiVal}>{value}</div>
      <div className={styles.kpiLabel}>{label}</div>
    </div>
  );
}

function Funnel({ stages, byStage, total }) {
  if (!total) return <p className={styles.empty}>Sem dados</p>;
  return (
    <div className={styles.funnel}>
      {stages.map((s, i) => {
        const cnt = byStage(s.key).length;
        const w = total > 0 ? Math.max(20, Math.round((cnt / total) * 100)) : 20;
        return (
          <div key={s.key} className={styles.funnelRow} style={{ '--w': `${100 - i * 10}%` }}>
            <div className={styles.funnelBar} style={{ background: s.color, width:`${w}%`, minWidth:'24px' }}>
              {cnt > 0 && <span>{cnt}</span>}
            </div>
            <span className={styles.funnelLabel}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const PIE_COLORS = ['#00DFC4','#7B5EFF','#FFB74D','#FF5370','#29B6F6','#66BB6A','#FFA726','#AB47BC'];

function DonutChart({ data }) {
  if (!data.length) return <p className={styles.empty}>Sem dados</p>;
  const total = data.reduce((s, [,v]) => s + v, 0);
  const r = 60, cx = 80, cy = 80, stroke = 28;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const slices = data.slice(0, 8).map(([label, val], i) => {
    const pct = val / total;
    const dash = pct * circ;
    const s = { label, val, pct, dash, offset, color: PIE_COLORS[i % PIE_COLORS.length] };
    offset += dash;
    return s;
  });
  return (
    <div className={styles.donutWrap}>
      <svg width="160" height="160" viewBox="0 0 160 160">
        {slices.map((s, i) => (
          <circle key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.offset + circ / 4}
            style={{ transition:'stroke-dasharray .4s' }}
          />
        ))}
        <text x={cx} y={cy-6} textAnchor="middle" fill="#E8EAF6" fontSize="22" fontWeight="700">{total}</text>
        <text x={cx} y={cy+14} textAnchor="middle" fill="#8892C8" fontSize="11">total</text>
      </svg>
      <div className={styles.legend}>
        {slices.map((s, i) => (
          <div key={i} className={styles.legendItem}>
            <span className={styles.dot} style={{ background: s.color }} />
            <span>{s.label} ({s.val})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data, color }) {
  if (!data.length) return <p className={styles.empty}>Sem dados</p>;
  const max = data[0][1];
  return (
    <div className={styles.barChart}>
      {data.slice(0, 8).map(([label, val]) => (
        <div key={label} className={styles.barRow}>
          <span className={styles.barLabel}>{label}</span>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width:`${(val/max)*100}%`, background: color }} />
          </div>
          <span className={styles.barVal}>{val}</span>
        </div>
      ))}
    </div>
  );
}
