const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/teamController');

router.get('/', controller.list);
router.post('/', controller.add);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/reset-password', controller.resetPassword);

module.exports = router;
