const express = require('express');
const router = express.Router();
const controller = require('../../controllers/agent/enterpriseController');

router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/quota', controller.adjustQuota);
router.get('/quota-stats', controller.quotaStats);

module.exports = router;
