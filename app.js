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

const pipelineAsyncService = require('./services/pipelineAsyncService');

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

// ─── Digital Human 完成驱动调度（Step6-E3A）─────────────────────────────
// 周期性扫描 status='digital_human' 的 PipelineTask 并驱动其完成。
// 使用原生 setInterval 最小调度，不引入 cron/bull/agenda/queue/worker 依赖。
const DH_POLLING_INTERVAL_MS = 15 * 1000;

// 防重入标记：上一轮扫描尚未完成时跳过本轮
let dhPollingInFlight = false;

function startDigitalHumanPolling() {
  setInterval(async () => {
    // 防重入：上一轮扫描尚未完成则跳过本轮
    if (dhPollingInFlight) {
      console.log(
        '[DigitalHumanPolling] SKIP | previous scan still in flight | ' +
        `time=${new Date().toISOString()}`
      );
      return;
    }

    dhPollingInFlight = true;
    try {
      await pipelineAsyncService.scanPendingDigitalHumanTasks();
    } catch (error) {
      // 单次扫描异常只记录日志，不导致 Node 进程退出
      console.error(
        `[DigitalHumanPolling] scan FAILED | error=${error.message} | ` +
        `time=${new Date().toISOString()}`
      );
    } finally {
      dhPollingInFlight = false;
    }
  }, DH_POLLING_INTERVAL_MS);

  console.log(
    `[DigitalHumanPolling] Scheduler started | intervalMs=${DH_POLLING_INTERVAL_MS}`
  );
}

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

  // 应用启动完成后，注册 Digital Human 完成驱动（不阻塞 HTTP 服务启动）
  startDigitalHumanPolling();
});

module.exports = app;
