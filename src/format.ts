export function money(v: any, opts: { cents?: boolean; sign?: boolean } = {}): string {
  if (typeof v !== 'number' || !isFinite(v)) return v == null ? '—' : String(v)
  const abs = Math.abs(v)
  const s = abs.toLocaleString('en-US', {
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  })
  if (v < 0) return `(${s})`
  return opts.sign && v > 0 ? `+${s}` : s
}

export function signed(v: number, cents = false): string {
  if (!v) return '0'
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
  return (v > 0 ? '+' : '−') + s
}

export function val(v: any): string {
  if (typeof v === 'number') {
    if (Math.abs(v) < 1 && v !== 0 && !Number.isInteger(v)) return v.toString()
    return money(v, { cents: !Number.isInteger(v) })
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (v == null || v === '') return '—'
  return String(v)
}

export function date(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s.length === 10 ? s + 'T12:00:00Z' : s)
  if (isNaN(+d)) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function dateTime(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(+d)) return s
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
}

export function ago(s: string, now = Date.now()): string {
  const d = (now - +new Date(s)) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

export function pct(v: number, digits = 0): string {
  return (v * 100).toFixed(digits) + '%'
}

export function uid(prefix: string): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

export function initials(name: string): string {
  return name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}
