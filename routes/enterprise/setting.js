const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/settingController');

router.get('/', controller.getSettings);
router.put('/brand', controller.updateBrand);

module.exports = router;
