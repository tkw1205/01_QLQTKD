function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV === 'development';

  // Log error
  if (err.status >= 500 || !err.status) {
    console.error('[ERROR]', {
      method: req.method,
      url: req.url,
      message: err.message,
      stack: isDev ? err.stack : undefined,
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  res.status(status).json({
    success: false,
    code: err.code || undefined,
    error: message,
    ...(isDev && status >= 500 ? { detail: err.message } : {}),
  });
}

function notFound(req, res) {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.url} not found` });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, notFound, asyncHandler };
