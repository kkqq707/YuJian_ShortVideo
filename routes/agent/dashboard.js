const express = require('express');
const router = express.Router();
const controller = require('../../controllers/agent/dashboardController');

router.get('/overview', controller.overview);
router.get('/enterprise-growth', controller.enterpriseGrowth);
router.get('/quota-usage', controller.quotaUsage);

module.exports = router;
