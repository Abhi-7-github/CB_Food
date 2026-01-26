export function runInBackground(label, task) {
  const name = String(label || 'task')
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[bg] ${name} failed:`, err?.stack || err?.message || err)
      })
  })
}

// Schedules work to run only once the HTTP response has finished (or the connection is closed).
// This prevents slow tasks (SMTP, Cloudinary, heavy CPU) from blocking Render's HTTP/2 proxy.
export function runAfterResponse(res, label, task) {
  if (!res || typeof res.once !== 'function') {
    return runInBackground(label, task)
  }

  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    runInBackground(label, task)
  }

  res.once('finish', schedule)
  // If the client disconnects early, still run best-effort background work.
  res.once('close', schedule)
}
