const express = require('express');
const router = express.Router();
const controller = require('../../controllers/agent/planController');

router.get('/', controller.list);

module.exports = router;
