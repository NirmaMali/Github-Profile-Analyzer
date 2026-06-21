require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const profileRoutes = require('./routes/profileRoutes');
const { testConnection } = require('./config/db');

const app = express();
app.set('trust proxy', 1);

// Middleware stack in this order:
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Health check (before rate limiter)
app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.json({ status: 'ok', timestamp: new Date().toISOString(), dbConnected });
});

// Apply rate limiter only to /api routes
app.use('/api', rateLimiter);

// Mount routes
app.use('/api/profiles', profileRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = { app, server };
