const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/assetController');

router.get('/', controller.list);
router.get('/upload-signature', controller.uploadSignature);
router.get('/:id/history', controller.history);
router.get('/:id', controller.detail);
router.post('/', controller.addRecord);
router.delete('/:id', controller.remove);
router.post('/batch-delete', controller.batchRemove);

module.exports = router;
