const express = require('express');
const router = express.Router();
const controller = require('../../controllers/enterprise/workspaceController');

// Sprint 4.4: Asset Workspace & AI Generation Flow Upgrade
router.get('/assets', controller.listAssets);
router.get('/assets/:id/generations', controller.getAssetGenerations);

module.exports = router;
