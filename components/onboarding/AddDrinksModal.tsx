'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { addMenuDrink } from '@/lib/firestore/menu'
import { OVERLAP_LABEL, detectOverlap, classicProduct } from '@/lib/onboarding'
import { CORE_RANGE, DEV_VARIANTS, DevVariant, MenuOverlap, matchesClassic } from '@/types'
import { VenueCtx, INK, SECONDARY, MUTED, input, kicker, Pill } from './shared'
import toast from 'react-hot-toast'

export default function AddDrinksModal({ ctx, onClose }: { ctx: VenueCtx; onClose: () => void }) {
  const [tab, setTab] = useState<'range' | 'new'>('range')
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [name, setName] = useState('')
  const [serve, setServe] = useState('')
  const [price, setPrice] = useState('')
  const [override, setOverride] = useState<{ overlap: MenuOverlap; classicName?: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const classics = ctx.products
    .filter((p) => p.isClassic && p.isActive !== false)
    .sort((a, b) => (matchesClassic(a.name) ?? a.name).localeCompare(matchesClassic(b.name) ?? b.name))
  const onMenu = (classicName: string, variant: DevVariant) =>
    ctx.drinks.some((d) => d.overlap === 'same' && d.classicName === classicName && d.format === variant && d.stage !== 'dropped')
  const nextOrder = () => Math.max(0, ...ctx.drinks.map((d) => d.order)) + 1
  const detected = override ?? detectOverlap(name)
  const chosen = Object.entries(picked).filter(([, on]) => on).map(([k]) => k)

  async function addRange() {
    if (!chosen.length) return toast.error('Tick at least one drink')
    setSaving(true)
    try {
      let order = nextOrder()
      for (const key of chosen) {
        const [classicName, variant] = key.split('§') as [string, DevVariant]
        const product = classicProduct(classicName, ctx.products)
        await addMenuDrink({
          venueId: ctx.venue.id,
          name: variant === 'syrup' ? `${classicName} (no spirit)` : classicName,
          order: order++,
          overlap: 'same',
          classicName,
          productId: product?.id,
          format: variant,
          serveMl: product?.recommendedServingG || undefined,
          firstLog: 'Added from our range',
        })
      }
      toast.success(`${chosen.length} added to ${ctx.venue.name}'s menu`)
      await ctx.reload()
      onClose()
    } catch (e) {
      console.error(e)
      toast.error('Could not add them — try again')
    } finally { setSaving(false) }
  }

  async function addNew() {
    if (!name.trim()) return toast.error('Give the cocktail a name')
    setSaving(true)
    try {
      const s = parseFloat(serve)
      const p = parseFloat(price)
      await addMenuDrink({
        venueId: ctx.venue.id,
        name: name.trim(),
        order: nextOrder(),
        overlap: detected.overlap,
        classicName: detected.classicName,
        productId: detected.overlap === 'same' ? classicProduct(detected.classicName, ctx.products)?.id : undefined,
        format: 'premix',
        serveMl: Number.isFinite(s) && s > 0 ? s : undefined,
        menuPrice: Number.isFinite(p) && p > 0 ? Math.round(p * 100) / 100 : undefined,
        firstLog: 'Added by hand',
      })
      toast.success(`${name.trim()} added`)
      await ctx.reload()
      onClose()
    } catch (e) {
      console.error(e)
      toast.error('Could not add it — try again')
    } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 70, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '640px', padding: '22px 24px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: INK }}>Add to {ctx.venue.name}&apos;s menu</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: '#d1d5db' }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', padding: '4px', borderRadius: '10px', width: 'fit-content', marginBottom: '14px' }}>
          {([['range', 'From our range'], ['new', 'A new cocktail']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none', background: tab === k ? '#fff' : 'transparent', color: tab === k ? INK : SECONDARY }}>{l}</button>
          ))}
        </div>

        {tab === 'range' ? (
          <>
            <p style={{ margin: '0 0 8px', fontSize: '12.5px', color: MUTED }}>Tick what goes on their menu, with or without spirit.</p>
            <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid #f3f4f6', borderRadius: '10px' }}>
              {classics.map((p) => {
                const cn = matchesClassic(p.name) ?? p.name
                const known = CORE_RANGE.some((c) => c.name === cn)
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: '1px solid #f9fafb' }}>
                    <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 600, color: INK }}>{cn}{!known && <span style={{ color: MUTED, fontWeight: 400 }}> · {p.name}</span>}</span>
                    {DEV_VARIANTS.map((vt) => {
                      const variant = vt.value as DevVariant
                      const key = `${cn}§${variant}`
                      const already = onMenu(cn, variant)
                      const on = !!picked[key]
                      return (
                        <button key={vt.value} disabled={already} onClick={() => setPicked({ ...picked, [key]: !on })} style={{
                          border: `1px solid ${on ? INK : '#e5e7eb'}`, background: already ? '#f0fdf4' : on ? INK : '#fff',
                          color: already ? '#166534' : on ? '#fff' : SECONDARY, borderRadius: '20px', padding: '3px 10px',
                          fontSize: '11.5px', fontWeight: 600, cursor: already ? 'default' : 'pointer', whiteSpace: 'nowrap',
                        }}>{already ? '✓ on menu' : `${on ? '✓' : '+'} ${vt.short}`}</button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={addRange} loading={saving} disabled={saving || !chosen.length}>Add {chosen.length || ''} to the menu</Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gap: '10px' }}>
              <label><span style={kicker}>Name, as on their menu</span>
                <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setOverride(null) }} placeholder="Crystal Coffee Negroni" style={input} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label><span style={kicker}>Serve (ml)</span><input value={serve} onChange={(e) => setServe(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="90" style={input} /></label>
                <label><span style={kicker}>Their menu price (£)</span><input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="14.00" style={input} /></label>
              </div>
              {name.trim() && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Pill bg={OVERLAP_LABEL[detected.overlap].bg} fg={OVERLAP_LABEL[detected.overlap].fg}>
                    {OVERLAP_LABEL[detected.overlap].label}{detected.classicName ? ` · ${detected.classicName}` : ''}
                  </Pill>
                  <select value={detected.overlap} onChange={(e) => setOverride({ overlap: e.target.value as MenuOverlap, classicName: e.target.value === 'none' ? undefined : detected.classicName })}
                    style={{ ...input, width: 'auto', padding: '5px 8px', fontSize: '12.5px' }}>
                    <option value="same">Same as our classic</option>
                    <option value="twist">Twist on our classic</option>
                    <option value="none">New — we make it</option>
                  </select>
                  {detected.overlap !== 'none' && (
                    <select value={detected.classicName ?? ''} onChange={(e) => setOverride({ overlap: detected.overlap, classicName: e.target.value || undefined })}
                      style={{ ...input, width: 'auto', padding: '5px 8px', fontSize: '12.5px' }}>
                      <option value="">Which classic?</option>
                      {CORE_RANGE.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={addNew} loading={saving} disabled={saving || !name.trim()}>Add to the menu</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
