const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/registryController');

router.get('/templates', controller.templates);
router.get('/models', controller.models);
router.get('/capabilities', controller.capabilities);

module.exports = router;
