export function notFound(req, res) {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
  })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = typeof err?.status === 'number' ? err.status : 500

  res.status(status).json({
    error: err?.message ?? 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' ? { stack: err?.stack } : {}),
  })
}
