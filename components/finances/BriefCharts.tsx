'use client'

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ReferenceLine, LabelList,
} from 'recharts'

/**
 * The charts behind the brief.
 *
 * They read the same computed statistics the brief is written from, so the
 * picture and the prose can never disagree. Sized and labelled to be screenshot
 * straight into an investor update — no interaction required to read them.
 */

export interface BriefStats {
  period: { label: string; priorLabel: string; partial: boolean; from: string; to: string }
  current: { revenue: number; litres: number; orders: number; byAccount: Record<string, { revenue: number; litres: number; orders: number }> }
  prior: { revenue: number; litres: number; orders: number; byAccount: Record<string, { revenue: number; litres: number; orders: number }> }
  monthlyRevenueHistory: Record<string, number>
  currentMonthKey: string
  biggestDrinkMovers: { drink: string; litres: number; litresPrior: number; delta: number }[]
}

const INK = '#111827'
const MUTED = '#d1d5db'
const UP = '#2a6049'
const DOWN = '#9c2a20'

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #f3f4f6', borderRadius: '12px', padding: '18px 20px 12px',
}
const title: React.CSSProperties = {
  fontSize: '13.5px', fontWeight: 700, color: '#111827', margin: '0 0 2px',
}
const sub: React.CSSProperties = {
  fontSize: '11.5px', color: '#9ca3af', margin: '0 0 14px',
}

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB')
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (k: string) => {
  const [y, m] = k.split('-')
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`
}

function Legend({ items }: { items: { label: string; fill?: string; outline?: boolean; dashed?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', margin: '0 0 12px' }}>
      {items.map((i) => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#4b5563' }}>
          {i.dashed ? (
            <span style={{ width: '16px', height: '0', borderTop: '2px dashed #9ca3af' }} />
          ) : (
            <span style={{
              width: '11px', height: '11px', borderRadius: '2px',
              background: i.outline ? '#fff' : i.fill,
              border: i.outline ? `1.5px dashed ${INK}` : 'none',
            }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  )
}

export default function BriefCharts({ stats }: { stats: BriefStats }) {
  // ── monthly revenue, most recent 14 ────────────────────────────────────────
  const months = Object.entries(stats.monthlyRevenueHistory)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([key, revenue]) => ({
      key, label: monthLabel(key), revenue,
      partial: key === stats.currentMonthKey,
    }))
  const best = months.reduce((m, x) => Math.max(m, x.revenue), 0)
  const average = months.length ? months.reduce((s, x) => s + x.revenue, 0) / months.length : 0

  // ── accounts, this period against the prior one ────────────────────────────
  const accountNames = [...new Set([
    ...Object.keys(stats.current.byAccount),
    ...Object.keys(stats.prior.byAccount),
  ])]
  const accounts = accountNames
    .map((name) => ({
      name,
      now: stats.current.byAccount[name]?.revenue ?? 0,
      before: stats.prior.byAccount[name]?.revenue ?? 0,
    }))
    .map((a) => ({ ...a, delta: a.now - a.before }))
    .sort((a, b) => b.now - a.now)

  // ── drink movers, biggest first ────────────────────────────────────────────
  const movers = [...stats.biggestDrinkMovers]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 10)
    .sort((a, b) => a.delta - b.delta)

  const revenueDelta = stats.prior.revenue > 0
    ? ((stats.current.revenue - stats.prior.revenue) / stats.prior.revenue) * 100
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* headline numbers, so a screenshot of the charts carries its own context */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1px',
        background: '#e5e7eb', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden',
      }}>
        {[
          { k: 'Revenue', v: gbp(stats.current.revenue), d: revenueDelta },
          { k: 'Litres', v: Math.round(stats.current.litres).toLocaleString('en-GB'), d: stats.prior.litres > 0 ? ((stats.current.litres - stats.prior.litres) / stats.prior.litres) * 100 : 0 },
          { k: 'Orders', v: String(stats.current.orders), d: stats.prior.orders > 0 ? ((stats.current.orders - stats.prior.orders) / stats.prior.orders) * 100 : 0 },
          { k: 'Average order', v: gbp(stats.current.orders ? stats.current.revenue / stats.current.orders : 0) },
          { k: 'Active accounts', v: String(Object.keys(stats.current.byAccount).length) },
        ].map((s) => (
          <div key={s.k} style={{ background: '#fff', padding: '12px 14px' }}>
            <p style={{ fontSize: '10px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.k}</p>
            <p style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: INK, fontVariantNumeric: 'tabular-nums' }}>{s.v}</p>
            {s.d !== undefined && (
              <p style={{ fontSize: '11.5px', margin: '2px 0 0', fontWeight: 600, color: s.d >= 0 ? UP : DOWN }}>
                {s.d >= 0 ? '+' : ''}{s.d.toFixed(0)}% vs {stats.period.priorLabel}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── monthly revenue ─────────────────────────────────────────────────── */}
      <div style={card}>
        <p style={title}>Revenue by month</p>
        <p style={sub}>Revenue billed each month, ex&nbsp;VAT.</p>
        <Legend items={[
          { label: 'Completed month', fill: INK },
          { label: `Best month (${gbp(best)})`, fill: UP },
          { label: 'Month still running', outline: true },
          { label: `${months.length}-month average (${gbp(average)})`, dashed: true },
        ]} />
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={months} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => '£' + (v / 1000).toFixed(0) + 'k'} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip formatter={(v) => gbp(num(v))} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <ReferenceLine y={average} stroke="#9ca3af" strokeDasharray="4 4" />
            <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
              {months.map((m) => (
                <Cell
                  key={m.key}
                  fill={m.partial ? '#fff' : m.revenue === best ? UP : INK}
                  stroke={m.partial ? INK : undefined}
                  strokeDasharray={m.partial ? '3 3' : undefined}
                />
              ))}
              <LabelList dataKey="revenue" position="top" formatter={(v) => (num(v) >= 1000 ? '£' + (num(v) / 1000).toFixed(0) + 'k' : '')} style={{ fontSize: 10, fill: '#9ca3af' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── accounts ────────────────────────────────────────────────────────── */}
      <div style={card}>
        <p style={title}>Revenue by account</p>
        <p style={sub}>Revenue per account, ex&nbsp;VAT.</p>
        <Legend items={[
          { label: stats.period.label, fill: INK },
          { label: stats.period.priorLabel, fill: MUTED },
        ]} />
        <ResponsiveContainer width="100%" height={Math.max(190, accounts.length * 38)}>
          <BarChart data={accounts} layout="vertical" margin={{ top: 4, right: 78, bottom: 4, left: 8 }} barGap={3}>
            <CartesianGrid horizontal={false} stroke="#f3f4f6" />
            <XAxis type="number" tickFormatter={(v) => '£' + (v / 1000).toFixed(0) + 'k'} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={132} tick={{ fontSize: 11.5, fill: '#374151' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => gbp(num(v))} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <Bar dataKey="before" fill={MUTED} radius={[0, 3, 3, 0]} name={stats.period.priorLabel}>
              <LabelList dataKey="before" position="right" formatter={(v) => (num(v) > 0 ? gbp(num(v)) : '')} style={{ fontSize: 10, fill: '#9ca3af' }} />
            </Bar>
            <Bar dataKey="now" fill={INK} radius={[0, 3, 3, 0]} name={stats.period.label}>
              <LabelList dataKey="now" position="right" formatter={(v) => (num(v) > 0 ? gbp(num(v)) : '')} style={{ fontSize: 10.5, fontWeight: 600, fill: '#374151' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── drink movers ────────────────────────────────────────────────────── */}
      {movers.length > 0 && (
        <div style={card}>
          <p style={title}>Which drinks moved</p>
          <p style={sub}>
            Change in litres ordered, {stats.period.label} against {stats.period.priorLabel}.
          </p>
          <Legend items={[
            { label: 'More ordered', fill: UP },
            { label: 'Less ordered', fill: DOWN },
          ]} />
          <ResponsiveContainer width="100%" height={Math.max(190, movers.length * 32)}>
            <BarChart data={movers} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }}>
              <CartesianGrid horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v) => v + 'L'} />
              <YAxis type="category" dataKey="drink" width={168} tick={{ fontSize: 11.5, fill: '#374151' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => num(v) + ' L'} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <ReferenceLine x={0} stroke="#9ca3af" />
              <Bar dataKey="delta" radius={3}>
                {movers.map((m) => <Cell key={m.drink} fill={m.delta >= 0 ? UP : DOWN} />)}
                <LabelList dataKey="delta" position="right" formatter={(v) => (num(v) > 0 ? '+' : '') + num(v) + 'L'} style={{ fontSize: 10.5, fill: '#6b7280' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
