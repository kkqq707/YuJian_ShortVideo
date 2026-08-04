const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/agentController');

router.get('/', controller.list);
router.get('/:id', controller.detail);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.post('/:id/quota', controller.adjustQuota);
router.post('/:id/reset-password', controller.resetPassword);
router.post('/:id/toggle-status', controller.toggleStatus);

module.exports = router;
