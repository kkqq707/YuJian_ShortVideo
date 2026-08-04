const express = require('express');
const router = express.Router();
const controller = require('../../controllers/agent/profileController');

router.get('/', controller.getProfile);
router.put('/', controller.updateProfile);
router.post('/change-password', controller.changePassword);

module.exports = router;
