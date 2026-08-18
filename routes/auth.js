const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { enterpriseAuth } = require('../middlewares/auth');

router.post('/admin/login', authController.adminLogin);
router.post('/agent/login', authController.agentLogin);
router.post('/enterprise/login', authController.enterpriseLogin);

// ─── Auth-Rebuild-003: 企业用户手机号认证 ─────────────────────
router.post('/enterprise/send-code', authController.sendCode);
router.post('/enterprise/login-by-code', authController.loginByCode);
// 首次设置密码：必须已登录（enterpriseAuth），不接受仅凭手机号改密
router.post('/enterprise/set-password', enterpriseAuth, authController.setPassword);
router.post('/enterprise/forgot-password', authController.forgotPassword);

module.exports = router;
