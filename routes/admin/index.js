const express = require('express');
const router = express.Router();
const { adminAuth } = require('../../middlewares/auth');

const dashboardRouter = require('./dashboard');
const agentRouter = require('./agent');
const enterpriseRouter = require('./enterprise');
const planRouter = require('./plan');
const orderRouter = require('./order');
const apiConfigRouter = require('./apiConfig');
const taskRouter = require('./task');
const operationLogRouter = require('./operationLog');

router.use(adminAuth);

router.use('/dashboard', dashboardRouter);
router.use('/agents', agentRouter);
router.use('/enterprises', enterpriseRouter);
router.use('/plans', planRouter);
router.use('/orders', orderRouter);
router.use('/api-configs', apiConfigRouter);
router.use('/tasks', taskRouter);
router.use('/operation-logs', operationLogRouter);

module.exports = router;
