const sequelize = require('../config/database');
const Admin = require('./Admin');
const Agent = require('./Agent');
const Enterprise = require('./Enterprise');
const EnterpriseUser = require('./EnterpriseUser');
const Plan = require('./Plan');
const Order = require('./Order');
const QuotaLog = require('./QuotaLog');
const ApiConfig = require('./ApiConfig');
const OperationLog = require('./OperationLog');
const GenerationTask = require('./GenerationTask');
const Asset = require('./Asset');

// 关联关系
Agent.hasMany(Enterprise, { foreignKey: 'agent_id' });
Enterprise.belongsTo(Agent, { foreignKey: 'agent_id' });

Enterprise.hasMany(EnterpriseUser, { foreignKey: 'enterprise_id' });
EnterpriseUser.belongsTo(Enterprise, { foreignKey: 'enterprise_id' });

Enterprise.hasMany(GenerationTask, { foreignKey: 'enterprise_id' });
GenerationTask.belongsTo(Enterprise, { foreignKey: 'enterprise_id' });

Enterprise.hasMany(Asset, { foreignKey: 'enterprise_id' });
Asset.belongsTo(Enterprise, { foreignKey: 'enterprise_id' });

Order.belongsTo(Plan, { foreignKey: 'plan_id' });

// GenerationTask ↔ Asset 双向关联（Sprint 2.5）
GenerationTask.belongsTo(Asset, {
  as: 'sourceAsset',
  foreignKey: 'source_asset_id',
  constraints: false      // 允许 Asset 不存在时也能创建任务
});
GenerationTask.belongsTo(Asset, {
  as: 'outputAsset',
  foreignKey: 'output_asset_id',
  constraints: false
});
Asset.hasMany(GenerationTask, {
  as: 'sourceGenerationTasks',
  foreignKey: 'source_asset_id',
  constraints: false
});
Asset.hasMany(GenerationTask, {
  as: 'outputGenerationTasks',
  foreignKey: 'output_asset_id',
  constraints: false
});

module.exports = {
  sequelize,
  Admin,
  Agent,
  Enterprise,
  EnterpriseUser,
  Plan,
  Order,
  QuotaLog,
  ApiConfig,
  OperationLog,
  GenerationTask,
  Asset
};
