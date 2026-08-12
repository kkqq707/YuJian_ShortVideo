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
const DramaProject = require('./DramaProject');
const DramaEpisode = require('./DramaEpisode');
const DramaScene = require('./DramaScene');
const DramaCharacter = require('./DramaCharacter');
const DramaShot = require('./DramaShot');
const PipelineTask = require('./PipelineTask');
const ScriptRecord = require('./ScriptRecord');

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

// ─── DramaPipeline 关联（Sprint 1） ────────────────────────────────

// Enterprise → DramaProject
Enterprise.hasMany(DramaProject, { foreignKey: 'enterprise_id' });
DramaProject.belongsTo(Enterprise, { foreignKey: 'enterprise_id' });

// DramaProject → DramaEpisode
DramaProject.hasMany(DramaEpisode, { foreignKey: 'project_id' });
DramaEpisode.belongsTo(DramaProject, { foreignKey: 'project_id' });

// DramaEpisode → DramaScene
DramaEpisode.hasMany(DramaScene, { foreignKey: 'episode_id' });
DramaScene.belongsTo(DramaEpisode, { foreignKey: 'episode_id' });

// DramaScene → DramaShot
DramaScene.hasMany(DramaShot, { foreignKey: 'scene_id' });
DramaShot.belongsTo(DramaScene, { foreignKey: 'scene_id' });

// DramaShot → GenerationTask（复用现有生成任务）
DramaShot.belongsTo(GenerationTask, {
  as: 'generationTask',
  foreignKey: 'task_id',
  constraints: false
});
GenerationTask.hasMany(DramaShot, {
  as: 'dramaShots',
  foreignKey: 'task_id',
  constraints: false
});

// DramaShot → Asset（输出结果）
DramaShot.belongsTo(Asset, {
  as: 'outputAsset',
  foreignKey: 'output_asset_id',
  constraints: false
});
Asset.hasMany(DramaShot, {
  as: 'dramaOutputShots',
  foreignKey: 'output_asset_id',
  constraints: false
});

// DramaShot 自引用（版本追溯）
DramaShot.belongsTo(DramaShot, {
  as: 'parentShot',
  foreignKey: 'parent_shot_id',
  constraints: false
});
DramaShot.hasMany(DramaShot, {
  as: 'childShots',
  foreignKey: 'parent_shot_id',
  constraints: false
});

// DramaCharacter → Asset（角色头像）
DramaCharacter.belongsTo(Asset, {
  as: 'avatarAsset',
  foreignKey: 'avatar_asset_id',
  constraints: false
});
Asset.hasMany(DramaCharacter, {
  as: 'dramaCharacters',
  foreignKey: 'avatar_asset_id',
  constraints: false
});

// DramaProject → DramaCharacter
DramaProject.hasMany(DramaCharacter, { foreignKey: 'project_id' });
DramaCharacter.belongsTo(DramaProject, { foreignKey: 'project_id' });

// ─── DigitalHuman Pipeline 关联（Phase 004-Step4-A1） ──────────────────

// PipelineTask → Enterprise
Enterprise.hasMany(PipelineTask, { foreignKey: 'enterprise_id' });
PipelineTask.belongsTo(Enterprise, { foreignKey: 'enterprise_id' });

// PipelineTask → GenerationTask（4个层任务关联）
PipelineTask.belongsTo(GenerationTask, {
  as: 'visionTask',
  foreignKey: 'vision_task_id',
  constraints: false
});
PipelineTask.belongsTo(GenerationTask, {
  as: 'scriptTask',
  foreignKey: 'script_task_id',
  constraints: false
});
PipelineTask.belongsTo(GenerationTask, {
  as: 'ttsTask',
  foreignKey: 'tts_task_id',
  constraints: false
});
PipelineTask.belongsTo(GenerationTask, {
  as: 'dhTask',
  foreignKey: 'dh_task_id',
  constraints: false
});

// PipelineTask → Asset（音频和视频）
PipelineTask.belongsTo(Asset, {
  as: 'audioAsset',
  foreignKey: 'audio_asset_id',
  constraints: false
});
PipelineTask.belongsTo(Asset, {
  as: 'outputAsset',
  foreignKey: 'output_asset_id',
  constraints: false
});

// PipelineTask → ScriptRecord
PipelineTask.belongsTo(ScriptRecord, {
  as: 'scriptRecord',
  foreignKey: 'script_record_id',
  constraints: false
});
ScriptRecord.belongsTo(PipelineTask, {
  foreignKey: 'pipeline_task_id',
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
  Asset,
  DramaProject,
  DramaEpisode,
  DramaScene,
  DramaCharacter,
  DramaShot,
  PipelineTask,
  ScriptRecord
};
