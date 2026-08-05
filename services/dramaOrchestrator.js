/**
 * DramaOrchestrator — 短剧流水线流程编排层
 *
 * Sprint 3: 流程骨架
 *
 * 职责：
 *   1. createDramaProject()    — 创建短剧项目（委托 Service）
 *   2. buildDramaStructure()   — 根据结构数据创建剧集→场景→镜头层级
 *   3. executePipeline()       — 完整流水线入口（暂不调用 AI）
 *
 * 设计原则：
 *   - Service 负责数据操作，Orchestrator 负责业务流程
 *   - 统一 throw Error，不吞异常
 *   - 多步原子操作使用 sequelize transaction
 *   - 不修改已有 Service
 *   - 不调用 AI / LLM / 视频生成
 *
 * Transaction 说明：
 *   buildDramaStructure 使用 transaction 原因：
 *   一次调用需创建 1 Episode + N Scene + M Shot，
 *   中途失败若没有回滚会产生孤立数据（如 Episode 已创建但 Scene 失败），
 *   因此整个层级创建视为单一原子操作。
 */

const sequelize = require('../config/database');
const dramaPipelineService = require('./dramaPipelineService');
const {
  DramaProject,
  DramaEpisode,
  DramaScene,
  DramaShot
} = require('../models');

class DramaOrchestrator {
  /**
   * 1. createDramaProject(input)
   *
   * 创建短剧项目 — 薄封装 Service，仅做字段映射。
   *
   * @param {Object} input
   * @param {number} input.enterpriseId  — 企业 ID
   * @param {string} input.title         — 项目标题
   * @param {string} [input.description] — 项目描述/梗概
   * @returns {Promise<DramaProject>}
   */
  async createDramaProject({ enterpriseId, title, description }) {
    if (!enterpriseId) throw new Error('enterpriseId is required');
    if (!title) throw new Error('title is required');

    return dramaPipelineService.createProject({
      enterprise_id: enterpriseId,
      title,
      description
    });
  }

  /**
   * 2. buildDramaStructure(projectId, structure)
   *
   * 根据已有结构数据创建短剧层级：
   *   Episode → Scene(s) → Shot(s)
   *
   * 使用 transaction 保证整个层级创建的原子性：
   *   若任一 Scene 或 Shot 创建失败，整个结构回滚。
   *
   * @param {number} projectId     — 项目 ID
   * @param {Object} structure     — 层级结构数据
   * @param {Object} structure.episode          — 剧集信息
   * @param {string} [structure.episode.title]  — 剧集标题
   * @param {number} [structure.episode.episode_number] — 剧集编号（默认 1）
   * @param {Array}  structure.scenes           — 场景数组
   * @param {string} [structure.scenes[].location]    — 场景地点
   * @param {string} [structure.scenes[].description] — 场景描述
   * @param {Array}  [structure.scenes[].shots]       — 镜头数组
   * @param {string} [structure.scenes[].shots[].description] — 镜头描述
   * @param {string} [structure.scenes[].shots[].prompt]      — AI 提示词
   * @param {number} [structure.scenes[].shots[].duration]    — 目标时长（秒）
   * @returns {Promise<Object>} 完整结构 { episode, scenes: [{ ...scene, shots }] }
   */
  async buildDramaStructure(projectId, structure) {
    // 输入校验（在 DB 查询前完成，避免无效查询）
    if (!projectId) throw new Error('projectId is required');
    if (!structure) throw new Error('structure is required');

    const { episode, scenes } = structure;
    if (!episode) throw new Error('structure.episode is required');
    if (!scenes || !Array.isArray(scenes)) {
      throw new Error('structure.scenes is required and must be an array');
    }

    // 验证父项目存在
    const project = await DramaProject.findByPk(projectId);
    if (!project) throw new Error(`DramaProject id=${projectId} not found`);

    const transaction = await sequelize.transaction();

    try {
      // ── Step 1: 创建 Episode ──────────────────────────────
      const createdEpisode = await DramaEpisode.create({
        project_id: projectId,
        episode_number: episode.episode_number || 1,
        title: episode.title || null,
        status: 'draft'
      }, { transaction });

      // ── Step 2: 创建 Scene → Shot 层级 ────────────────────
      const createdScenes = [];

      for (let i = 0; i < scenes.length; i++) {
        const sceneData = scenes[i];

        const createdScene = await DramaScene.create({
          episode_id: createdEpisode.id,
          scene_number: i + 1,
          location: sceneData.location || null,
          description: sceneData.description || null,
          status: 'draft'
        }, { transaction });

        const createdShots = [];

        if (sceneData.shots && Array.isArray(sceneData.shots)) {
          for (let j = 0; j < sceneData.shots.length; j++) {
            const shotData = sceneData.shots[j];

            const createdShot = await DramaShot.create({
              scene_id: createdScene.id,
              shot_number: j + 1,
              description: shotData.description || null,
              prompt: shotData.prompt || null,
              duration: shotData.duration || null,
              status: 'draft',
              version: 1
            }, { transaction });

            createdShots.push(createdShot);
          }
        }

        createdScenes.push({
          ...createdScene.toJSON(),
          shots: createdShots
        });
      }

      await transaction.commit();

      return {
        episode: createdEpisode,
        scenes: createdScenes
      };
    } catch (error) {
      await transaction.rollback();
      throw new Error(`Failed to build drama structure: ${error.message}`);
    }
  }

  /**
   * 3. executePipeline(input)
   *
   * 完整流水线入口：
   *   createProject → buildDramaStructure → getProjectDetail
   *
   * 暂不调用 AI / 视频生成，仅走通流程骨架。
   *
   * @param {Object} input
   * @param {number} input.enterpriseId  — 企业 ID
   * @param {string} input.title         — 项目标题
   * @param {string} [input.description] — 项目描述
   * @param {Object} [input.structure]   — 层级结构数据（同 buildDramaStructure）
   * @returns {Promise<DramaProject>}    完整项目嵌套结构
   */
  async executePipeline(input) {
    const { enterpriseId, title, description, structure } = input;

    if (!enterpriseId) throw new Error('enterpriseId is required');
    if (!title) throw new Error('title is required');

    // Step 1: 创建项目
    const project = await this.createDramaProject({ enterpriseId, title, description });

    // Step 2: 构建结构（如果提供了 structure）
    if (structure) {
      await this.buildDramaStructure(project.id, structure);
    }

    // Step 3: 返回完整项目详情
    return dramaPipelineService.getProjectDetail(project.id);
  }
}

module.exports = new DramaOrchestrator();
