const express = require('express');
const router = express.Router();
const controller = require('../../controllers/agent/orderController');

router.get('/', controller.list);

module.exports = router;
