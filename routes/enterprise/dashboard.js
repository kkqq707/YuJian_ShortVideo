const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/dashboardController');

router.get('/overview', controller.overview);
router.get('/usage-trend', controller.usageTrend);
router.get('/recent-tasks', controller.recentTasks);

module.exports = router;
