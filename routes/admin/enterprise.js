const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/enterpriseController');

router.get('/', controller.list);
router.get('/:id', controller.detail);
router.post('/', controller.create);
router.post('/:id/quota', controller.adjustQuota);
router.post('/:id/toggle-status', controller.toggleStatus);

module.exports = router;
