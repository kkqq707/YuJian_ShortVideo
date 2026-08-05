/**
 * DramaPipeline Service — 短剧流水线业务层
 *
 * Sprint 2: 基础 CRUD 业务能力
 *
 * 职责：
 *   1. 创建短剧项目（DramaProject）
 *   2. 创建剧集（DramaEpisode）
 *   3. 创建场景（DramaScene）
 *   4. 创建镜头（DramaShot）
 *   5. 查询完整项目结构（Project → Episode → Scene → Shot）
 *
 * 设计原则：
 *   - 统一 throw Error，不吞异常
 *   - 关键写入操作使用 sequelize transaction
 *   - 不调用 AI / 视频生成 / LLM
 *   - 不修改 GenerationTask / Asset / generationService
 */

const sequelize = require('../config/database');
const {
  DramaProject,
  DramaEpisode,
  DramaScene,
  DramaShot
} = require('../models');

class DramaPipelineService {
  /**
   * 创建短剧项目
   *
   * @param {Object} params
   * @param {number} params.enterprise_id  — 企业 ID
   * @param {string} params.title         — 项目标题
   * @param {string} [params.description] — 项目描述/梗概
   * @returns {Promise<DramaProject>}
   */
  async createProject({ enterprise_id, title, description }) {
    if (!enterprise_id) throw new Error('enterprise_id is required');
    if (!title) throw new Error('title is required');

    const transaction = await sequelize.transaction();

    try {
      const project = await DramaProject.create({
        enterprise_id,
        title,
        description: description || null,
        status: 'draft'
      }, { transaction });

      await transaction.commit();
      return project;
    } catch (error) {
      await transaction.rollback();
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  /**
   * 创建剧集
   *
   * @param {Object} params
   * @param {number} params.project_id     — 项目 ID
   * @param {number} params.episode_number — 剧集编号
   * @param {string} [params.title]        — 剧集标题
   * @returns {Promise<DramaEpisode>}
   */
  async createEpisode({ project_id, episode_number, title }) {
    if (!project_id) throw new Error('project_id is required');
    if (episode_number == null) throw new Error('episode_number is required');

    // 验证父项目存在
    const project = await DramaProject.findByPk(project_id);
    if (!project) throw new Error(`DramaProject id=${project_id} not found`);

    const episode = await DramaEpisode.create({
      project_id,
      episode_number,
      title: title || null,
      status: 'draft'
    });

    return episode;
  }

  /**
   * 创建场景
   *
   * @param {Object} params
   * @param {number} params.episode_id   — 剧集 ID
   * @param {number} params.scene_number — 场景编号
   * @param {string} [params.location]   — 场景地点
   * @param {string} [params.description] — 场景描述
   * @returns {Promise<DramaScene>}
   */
  async createScene({ episode_id, scene_number, location, description }) {
    if (!episode_id) throw new Error('episode_id is required');
    if (scene_number == null) throw new Error('scene_number is required');

    // 验证父剧集存在
    const episode = await DramaEpisode.findByPk(episode_id);
    if (!episode) throw new Error(`DramaEpisode id=${episode_id} not found`);

    const scene = await DramaScene.create({
      episode_id,
      scene_number,
      location: location || null,
      description: description || null,
      status: 'draft'
    });

    return scene;
  }

  /**
   * 创建镜头
   *
   * @param {Object} params
   * @param {number} params.scene_id     — 场景 ID
   * @param {number} params.shot_number  — 镜头编号
   * @param {string} [params.description] — 镜头描述
   * @param {string} [params.prompt]     — AI 生成提示词
   * @param {number} [params.duration]   — 目标时长（秒）
   * @returns {Promise<DramaShot>}
   */
  async createShot({ scene_id, shot_number, description, prompt, duration }) {
    if (!scene_id) throw new Error('scene_id is required');
    if (shot_number == null) throw new Error('shot_number is required');

    // 验证父场景存在
    const scene = await DramaScene.findByPk(scene_id);
    if (!scene) throw new Error(`DramaScene id=${scene_id} not found`);

    const shot = await DramaShot.create({
      scene_id,
      shot_number,
      description: description || null,
      prompt: prompt || null,
      duration: duration || null,
      status: 'draft',
      version: 1
    });

    return shot;
  }

  /**
   * 查询完整项目结构
   *
   * 返回嵌套结构：
   *   Project → Episodes → Scenes → Shots
   *
   * @param {number} project_id — 项目 ID
   * @returns {Promise<DramaProject|null>}
   */
  async getProjectDetail(project_id) {
    if (!project_id) throw new Error('project_id is required');

    const project = await DramaProject.findByPk(project_id, {
      include: [
        {
          model: DramaEpisode,
          include: [
            {
              model: DramaScene,
              include: [
                {
                  model: DramaShot
                }
              ]
            }
          ]
        }
      ]
    });

    if (!project) throw new Error(`DramaProject id=${project_id} not found`);

    return project;
  }
}

module.exports = new DramaPipelineService();
