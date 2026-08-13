const express = require('express');
const router = express.Router();
const { enterpriseAuth } = require('../../middlewares/auth');

const dashboardRouter = require('./dashboard');
const taskRouter = require('./task');
const assetRouter = require('./asset');
const teamRouter = require('./team');
const quotaRouter = require('./quota');
const settingRouter = require('./setting');
const videoGenerationRouter = require('./videoGeneration');
const workspaceRouter = require('./workspace');
const registryRouter = require('./registry');
const pipelineRouter = require('../pipeline');
const avatarRouter = require('./avatars');
const voiceRouter = require('./voices');
const scriptRouter = require('./scripts');

router.use(enterpriseAuth);

router.use('/dashboard', dashboardRouter);
router.use('/tasks', taskRouter);
router.use('/assets', assetRouter);
router.use('/team', teamRouter);
router.use('/quota', quotaRouter);
router.use('/settings', settingRouter);
router.use('/video-generation', videoGenerationRouter);
router.use('/workspace', workspaceRouter);
router.use('/registry', registryRouter);
router.use('/pipelines', pipelineRouter);
router.use('/avatars', avatarRouter);
router.use('/voices', voiceRouter);
router.use('/scripts', scriptRouter);

module.exports = router;
