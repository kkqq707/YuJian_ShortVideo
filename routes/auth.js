const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/admin/login', authController.adminLogin);
router.post('/agent/login', authController.agentLogin);
router.post('/enterprise/login', authController.enterpriseLogin);

module.exports = router;
