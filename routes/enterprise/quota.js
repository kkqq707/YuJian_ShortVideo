const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/quotaController');

router.get('/balance', controller.balance);
router.get('/logs', controller.logs);
router.get('/plans', controller.plans);
router.post('/purchase', controller.purchase);

module.exports = router;
