const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/orderController');

router.get('/', controller.list);
router.get('/:id', controller.detail);

module.exports = router;
