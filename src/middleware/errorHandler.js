function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);

  const isDev = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(isDev && { stack: err.stack })
  });
}

module.exports = errorHandler;
