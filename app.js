require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const responseMiddleware = require('./middlewares/response');
const errorHandler = require('./middlewares/errorHandler');
const { printEnvReport } = require('./config/env-check');

const authRoutes = require('./routes/auth');
const callbackRoutes = require('./routes/callback');
const adminRoutes = require('./routes/admin');
const agentRoutes = require('./routes/agent');
const enterpriseRoutes = require('./routes/enterprise');

const app = express();

// 中间件
app.use(cors());
// 捕获原始请求体用于 DashScope callback 签名验证
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(responseMiddleware);

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/callback', callbackRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/enterprise', enterpriseRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.success({ status: 'ok', uptime: process.uptime() });
});

// 错误处理
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║     煜见光影 SaaS 服务已启动              ║
║     端口: ${PORT}                           ║
║     环境: ${process.env.NODE_ENV || 'development'}                    ║
╚══════════════════════════════════════════╝
  `);
  printEnvReport();
});

module.exports = app;
