// Optional shared event store for multi-user collaboration on Vercel.
// Enabled when an Upstash Redis / Vercel KV REST endpoint is configured
// (KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
// Without it, the app runs fully in the browser (localStorage + cross-tab sync).

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'wp:okafor-lindqvist-2025:events'

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  if (!r.ok) throw new Error(`redis ${r.status}`)
  return (await r.json()).result
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  if (!URL_ || !TOKEN) return res.status(200).json({ enabled: false })
  try {
    if (req.method === 'GET') {
      const raw = (await redis(['LRANGE', KEY, '0', '-1'])) || []
      return res.status(200).json({ enabled: true, events: raw.map(s => JSON.parse(s)) })
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const list = (body && body.events) || []
      if (list.length) await redis(['RPUSH', KEY, ...list.map(e => JSON.stringify(e))])
      return res.status(200).json({ enabled: true, added: list.length })
    }
    if (req.method === 'DELETE') {
      await redis(['DEL', KEY])
      return res.status(200).json({ enabled: true, reset: true })
    }
    return res.status(405).end()
  } catch (e) {
    return res.status(500).json({ enabled: true, error: String(e) })
  }
}
