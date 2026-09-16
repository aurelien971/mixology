'use client'

import Link from 'next/link'
import { format, differenceInCalendarDays, startOfDay } from 'date-fns'
import Button from '@/components/ui/Button'
import { stageInfo } from '@/lib/onboarding'
import { MENU_STAGES, TASTING_STAGES, TASTING_VERDICTS, DEV_VARIANTS } from '@/types'
import { VenueCtx, INK, SECONDARY, MUTED, card, kicker, input, Pill } from './shared'

export default function TastingsSection({ ctx, onBook }: { ctx: VenueCtx; onBook: () => void }) {
  const { venue: v } = ctx
  const days = v.tastingDate ? differenceInCalendarDays(new Date(v.tastingDate + 'T12:00:00'), startOfDay(new Date())) : null
  const venueTastings = ctx.tastings
    .filter((t) => t.accountId === v.accountId)
    .sort((a, b) => (b.scheduledAt ?? b.createdAt).getTime() - (a.scheduledAt ?? a.createdAt).getTime())
  const open = ctx.drinks.filter((d) => d.stage !== 'signed_off' && d.stage !== 'dropped')

  return (
    <div style={{ display: 'grid', gap: '14px' }}>
      <div style={{ ...card, display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <p style={{ ...kicker, margin: 0 }}>Tasting</p>
          <p style={{ margin: '2px 0 4px', fontSize: '26px', fontWeight: 700, color: days === null ? MUTED : days < 0 ? MUTED : days <= 5 ? '#b91c1c' : INK }}>
            {days === null ? 'No date' : days > 0 ? `${days} days` : days === 0 ? 'Today' : 'Done'}
          </p>
          <input type="date" value={v.tastingDate ?? ''}
            onChange={(e) => ctx.patchVenue({ tastingDate: e.target.value || undefined }, undefined, e.target.value ? `Tasting date → ${format(new Date(e.target.value + 'T12:00:00'), 'EEE d MMM')}` : 'Tasting date cleared')}
            style={{ ...input, width: '160px', padding: '5px 8px', fontFamily: 'monospace', fontSize: '12.5px' }} />
        </div>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: INK }}>{ctx.readiness.signed} of {ctx.readiness.active} drinks signed off</p>
          <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: SECONDARY }}>
            {open.length ? `${open.length} still to taste or sign off before the date` : 'Everything on the menu is signed off.'}
          </p>
        </div>
        <Button onClick={onBook}>Book a tasting</Button>
      </div>

      {open.length > 0 && (
        <div style={card}>
          <p style={kicker}>Still to sign off</p>
          {MENU_STAGES.filter((s) => s.value !== 'signed_off' && s.value !== 'dropped').map((s) => {
            const list = open.filter((d) => d.stage === s.value)
            if (!list.length) return null
            return (
              <div key={s.value} style={{ display: 'flex', gap: '10px', alignItems: 'baseline', padding: '8px 0', borderTop: '1px solid #f9fafb', flexWrap: 'wrap' }}>
                <span style={{ width: '130px', flex: 'none' }}><Pill bg={s.bg} fg={s.fg}>{s.label} · {list.length}</Pill></span>
                <span style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                  {list.map((d) => (
                    <button key={d.id} onClick={() => ctx.openDrink(d.id)} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: '20px', padding: '3px 10px', fontSize: '12.5px', color: INK, cursor: 'pointer' }}>
                      {d.name}{d.feedback ? ' 💬' : ''}
                    </button>
                  ))}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div style={card}>
        <p style={kicker}>{venueTastings.length} tasting{venueTastings.length === 1 ? '' : 's'} logged</p>
        {venueTastings.length === 0 && <p style={{ margin: 0, fontSize: '13px', color: MUTED }}>None yet. Book one and it shows here and on the Tastings calendar, with their menu ready to pour.</p>}
        {venueTastings.map((t) => {
          const sc = TASTING_STAGES.find((s) => s.value === t.stage) ?? TASTING_STAGES[0]
          return (
            <div key={t.id} style={{ padding: '12px 0', borderTop: '1px solid #f9fafb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14.5px', fontWeight: 700, color: INK }}>{t.scheduledAt ? format(t.scheduledAt, 'EEE d MMM yyyy') : 'No date yet'}</span>
                <Pill bg={sc.bg} fg={sc.fg}>{sc.label}</Pill>
                {t.owner && <span style={{ fontSize: '12px', color: MUTED }}>{t.owner}</span>}
                <Link href="/tastings" style={{ marginLeft: 'auto', fontSize: '12.5px', color: '#1d4ed8' }}>Record verdicts on Tastings →</Link>
              </div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
                {t.items.map((it, i) => {
                  const vc = TASTING_VERDICTS.find((x) => x.value === it.verdict) ?? TASTING_VERDICTS[0]
                  return (
                    <span key={i} style={{ fontSize: '11.5px', padding: '3px 9px', borderRadius: '20px', fontWeight: 600, background: it.verdict === 'pending' ? '#f9fafb' : vc.bg, color: it.verdict === 'pending' ? SECONDARY : vc.fg }}>
                      {it.productName} · {DEV_VARIANTS.find((x) => x.value === it.variant)?.short}{it.verdict !== 'pending' ? ` · ${vc.label}` : ''}
                    </span>
                  )
                })}
              </div>
              {t.notes && <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: SECONDARY, whiteSpace: 'pre-wrap' }}>{t.notes}</p>}
            </div>
          )
        })}
      </div>
      <p style={{ margin: 0, fontSize: '11.5px', color: MUTED }}>
        After a tasting, move each drink on its own step — {stageInfo('tasting').label} → {stageInfo('approved').label} → {stageInfo('signed_off').label} — or mark {stageInfo('changes').label}.
      </p>
    </div>
  )
}
