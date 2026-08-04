const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/apiConfigController');

router.get('/', controller.getList);
router.post('/save', controller.save);
router.post('/batch-save', controller.batchSave);

module.exports = router;
