const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/taskController');

router.get('/', controller.list);
router.get('/stats', controller.stats);
router.get('/:id', controller.detail);

module.exports = router;
