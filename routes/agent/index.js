const express = require('express');
const router = express.Router();
const { agentAuth } = require('../../middlewares/auth');

const dashboardRouter = require('./dashboard');
const enterpriseRouter = require('./enterprise');
const planRouter = require('./plan');
const orderRouter = require('./order');
const profileRouter = require('./profile');

router.use(agentAuth);

router.use('/dashboard', dashboardRouter);
router.use('/enterprises', enterpriseRouter);
router.use('/plans', planRouter);
router.use('/orders', orderRouter);
router.use('/profile', profileRouter);

module.exports = router;
