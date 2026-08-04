const express = require('express');
const router = express.Router();
const callbackController = require('../controllers/callbackController');
const callbackSignatureMiddleware = require('../middlewares/callbackSignature');

// DashScope 回调：签名验证 → Controller
router.post('/dashscope', callbackSignatureMiddleware, callbackController.dashscopeCallback);

// OSS 回调（暂无需签名验证）
router.post('/oss', callbackController.ossCallback);

module.exports = router;
