const clients = new Set()

function writeEvent(res, event, data) {
  if (event) res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data ?? null)}\n\n`)
}

export function addPublicSseClient(req, res) {
  if (res.headersSent) return

  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  clients.add(res)

  // Tell the browser how long to wait before retrying a dropped connection.
  res.write('retry: 5000\n\n')
  // Initial comment line helps some proxies establish streaming early.
  res.write(`: connected ${new Date().toISOString()}\n\n`)

  writeEvent(res, 'hello', { ok: true, now: new Date().toISOString() })

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      // handled by close
    }
  }, 25000)

  req.on('close', () => {
    clearInterval(keepAlive)
    clients.delete(res)
  })
}

export function broadcastPublicEvent(event, data) {
  for (const res of clients) {
    try {
      writeEvent(res, event, data)
    } catch {
      clients.delete(res)
    }
  }
}
