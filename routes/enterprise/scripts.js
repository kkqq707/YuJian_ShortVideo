const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/scriptController');

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.detail);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
