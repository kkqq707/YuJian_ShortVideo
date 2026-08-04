const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/taskController');

router.get('/', controller.list);
router.get('/:id', controller.getStatus);
router.post('/text2video', controller.text2Video);
router.post('/image2video', controller.image2Video);
router.post('/ref2video', controller.ref2Video);
router.post('/digital-human', controller.digitalHuman);

module.exports = router;
