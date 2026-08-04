const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/dashboardController');

router.get('/overview', controller.overview);
router.get('/revenue-trend', controller.revenueTrend);
router.get('/user-growth', controller.userGrowth);
router.get('/task-stats', controller.taskStats);
router.get('/recent-logs', controller.recentLogs);
router.get('/system-status', controller.systemStatus);

module.exports = router;
