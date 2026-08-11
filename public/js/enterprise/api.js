/**
 * YuJian Enterprise — API Layer
 *
 * Sprint 4.5: 统一封装 Asset / Generation / Workspace API
 * 禁止业务模块直接 fetch，所有 API 调用通过此层
 *
 * 使用方式：
 *   EnterpriseAPI.Asset.getAssets({ page: 1, type: 'image' })
 *   EnterpriseAPI.Generation.createTask({ sourceAssetId, prompt, templateId })
 *   EnterpriseAPI.Workspace.getStats()
 */

(function () {
  'use strict';

  var state = (window.YJ && window.YJ.state) || {};
  var utils = (window.YJ && window.YJ.utils) || {};
  var safeFetch = utils.safeFetch || window.safeFetch;

  // ─── Asset API ────────────────────────────────────────────
  var AssetAPI = {
    /**
     * 获取资产列表
     * @param {Object} params - { page, pageSize, type, keyword, sort, status }
     * @returns {Promise<{items: Array, total: number, pageSize: number}>}
     */
    getAssets: function (params) {
      params = params || {};
      var query = '?page=' + (params.page || 1) + '&pageSize=' + (params.pageSize || 20);
      if (params.type) query += '&type=' + encodeURIComponent(params.type);
      if (params.keyword) query += '&keyword=' + encodeURIComponent(params.keyword);
      if (params.sort) query += '&sort=' + encodeURIComponent(params.sort);
      if (params.status) query += '&status=' + encodeURIComponent(params.status);
      return safeFetch('/enterprise/assets' + query);
    },

    /**
     * 获取单个资产详情
     * @param {string|number} assetId
     * @returns {Promise<Object>}
     */
    getAssetDetail: function (assetId) {
      return safeFetch('/enterprise/assets/' + assetId);
    },

    /**
     * Sprint 5.7: 获取视频播放签名 URL
     * @param {string|number} assetId
     * @returns {Promise<{url: string, expires: number}>}
     */
    getPlayUrl: function (assetId) {
      return safeFetch('/enterprise/assets/' + assetId + '/play-url');
    },

    /**
     * 删除资产
     * @param {string|number} assetId
     * @returns {Promise<Object>}
     */
    deleteAsset: function (assetId) {
      return YuJianAPI.request('/enterprise/assets/' + assetId, { method: 'DELETE' });
    },

    /**
     * 获取资产创作历史
     * @param {string|number} assetId
     * @returns {Promise<Object>}
     */
    getAssetHistory: function (assetId) {
      return safeFetch('/enterprise/assets/' + assetId + '/history');
    },

    /**
     * 获取资产生成记录（Workspace 接口）
     * @param {string|number} assetId
     * @returns {Promise<Object>}
     */
    getAssetGenerations: function (assetId) {
      return safeFetch('/enterprise/workspace/assets/' + assetId + '/generations');
    },

    /**
     * 获取 OSS 上传签名
     * @param {string} type - 文件类型
     * @returns {Promise<Object>}
     */
    getUploadSignature: function (type) {
      return YuJianAPI.get('/enterprise/assets/upload-signature?type=' + type);
    },

    /**
     * 创建资产记录
     * @param {Object} data - { name, url, type, size, mime_type }
     * @returns {Promise<Object>}
     */
    createAsset: function (data) {
      return YuJianAPI.post('/enterprise/assets', data);
    }
  };

  // ─── Generation API ───────────────────────────────────────
  var GenerationAPI = {
    /**
     * 创建生成任务
     * @param {Object} taskInput - { sourceAssetId, prompt, templateId, model, duration }
     * @returns {Promise<Object>}
     */
    createTask: function (taskInput) {
      return YuJianVideoTask.createImageToVideoTask(taskInput);
    },

    /**
     * 获取任务详情
     * @param {string|number} taskId
     * @returns {Promise<Object>}
     */
    getTask: function (taskId) {
      return YuJianAPI.get('/enterprise/video-generation/tasks/' + taskId);
    },

    /**
     * 获取任务列表
     * @param {Object} params - { page, pageSize }
     * @returns {Promise<Object>}
     */
    getTasks: function (params) {
      params = params || {};
      return YuJianAPI.get('/enterprise/video-generation/tasks?page=' + (params.page || 1) + '&pageSize=' + (params.pageSize || 12));
    },

    /**
     * 轮询任务状态
     * @param {string|number} taskId
     * @param {Object} callbacks - { onUpdate, onSuccess, onFailed, onTimeout, onError }
     */
    pollTask: function (taskId, callbacks) {
      YuJianVideoTask.pollTaskStatus(taskId, callbacks);
    },

    /**
     * 删除任务
     * @param {string|number} taskId
     * @returns {Promise<Object>}
     */
    deleteTask: function (taskId) {
      return YuJianAPI.request('/enterprise/video-generation/tasks/' + taskId, { method: 'DELETE' });
    },

    // ── Phase 2-C-1-A: Unified Creation Methods ──────────────
    // 统一各创作类型的 API 入口，暂建立接口结构，后续接入后端

    /**
     * 图生视频任务
     * Phase 2-C-1-C: 统一参数通过 params 传入
     * @param {Object} taskInput - {
     *   sourceAssetId, prompt, imageUrl, duration, templateId,
     *   params: { aspectRatio, motionStrength, cameraMovement, quality }
     * }
     * @returns {Promise<Object>}
     */
    createImageToVideoTask: function (taskInput) {
      // 当前委托给现有实现，后续统一到此方法
      if (typeof YuJianVideoTask !== 'undefined' && YuJianVideoTask.createImageToVideoTask) {
        return YuJianVideoTask.createImageToVideoTask(taskInput);
      }
      // Fallback: 直接调用后端
      return YuJianAPI.post('/enterprise/video-generation/image-to-video', taskInput);
    },

    /**
     * 文生视频任务
     * @param {Object} taskInput - { prompt, duration, style, ... }
     * @returns {Promise<Object>}
     */
    createTextToVideoTask: function (taskInput) {
      // Phase UI-AICreation-07-B: 迁移到新架构 endpoint
      // modelId → model 字段转换（参照 createRefToVideoTask）
      var body = {
        prompt: taskInput.prompt || '',
        duration: taskInput.duration || 5,
        params: taskInput.params || {}
      };

      // Phase UI-AICreation-07-B: 传递 negativePrompt
      if (taskInput.negativePrompt) {
        body.negativePrompt = taskInput.negativePrompt;
      }

      if (taskInput.modelId && YJ.state && YJ.state.aiModels && YJ.state.aiModels.models) {
        var modelConfig = YJ.state.aiModels.models[taskInput.modelId];
        if (modelConfig && modelConfig.apiModelName) {
          body.model = modelConfig.apiModelName;
        }
      }

      return YuJianAPI.post('/enterprise/video-generation/text-to-video', body);
    },

    /**
     * 图片生成任务
     * @param {Object} taskInput - { prompt, style, ratio, modelId, templateId }
     * @returns {Promise<Object>}
     */
    createImageGenerationTask: function (taskInput) {
      // TODO: Phase 2-C-1-B 接入后端图片生成接口
      return YuJianAPI.post('/enterprise/video-generation/text-to-image', taskInput);
    },

    /**
     * 参考生视频任务 (Phase 2-C-2-4-C-3-1)
     * @param {Object} taskInput - {
     *   prompt, duration, referenceSubjects, referenceImages,
     *   params: { aspectRatio, motionStrength, cameraMovement, quality }
     * }
     * @returns {Promise<Object>}
     */
    createRefToVideoTask: function (taskInput) {
      // Phase 2-C-2-4-C-3-3-B: Contract Adapter — 内部语义 → 后端契约
      var body = {
        images: taskInput.referenceImages || [],
        prompt: taskInput.prompt || '',
        duration: taskInput.duration || 5
      };

      // Registry-driven model resolution: modelId → apiModelName
      if (taskInput.modelId && YJ.state && YJ.state.aiModels && YJ.state.aiModels.models) {
        var modelConfig = YJ.state.aiModels.models[taskInput.modelId];
        if (modelConfig && modelConfig.apiModelName) {
          body.model = modelConfig.apiModelName;
        }
      }

      return YuJianAPI.post('/enterprise/tasks/ref2video', body);
    },

    /**
     * 数字人任务
     * @param {Object} taskInput - { script, voice, avatarId, ... }
     * @returns {Promise<Object>}
     */
    createDigitalHumanTask: function (taskInput) {
      // Phase 2-C-2-4-B-4-C-5: 字段名适配 (imageUrl→image_url, script→text) + 路径修正
      var body = {
        image_url: taskInput.imageUrl || null,
        text: taskInput.script || '',
        voice: taskInput.voice || 'zhiyan_emo'
      };
      return YuJianAPI.post('/enterprise/tasks/digital-human', body);
    }
  };

  // ─── Workspace API ────────────────────────────────────────
  var WorkspaceAPI = {
    /**
     * 获取工作区统计
     * @returns {Promise<Object>}
     */
    getStats: function () {
      return safeFetch('/enterprise/workspace/assets?page=1&pageSize=1');
    },

    /**
     * 获取资产生成统计
     * @param {string|number} assetId
     * @returns {Promise<Object>}
     */
    getAssetStats: function (assetId) {
      return safeFetch('/enterprise/workspace/assets/' + assetId + '/generations');
    }
  };

  // ─── Registry API (Phase 2-C-2-3-A) ───────────────────────
  var RegistryAPI = {
    /**
     * 获取所有 template 列表（含关联 model 完整信息）
     * @returns {Promise<Array>}
     */
    getTemplates: function () {
      return safeFetch('/enterprise/registry/templates');
    },

    /**
     * 获取模型列表
     * @param {string} [capability] — 能力类型，可选；不传返回全部模型
     * @returns {Promise<Array>}
     */
    getModels: function (capability) {
      var query = capability ? '?capability=' + encodeURIComponent(capability) : '';
      return safeFetch('/enterprise/registry/models' + query);
    },

    /**
     * 获取所有 capability 列表
     * @returns {Promise<Array>}
     */
    getCapabilities: function () {
      return safeFetch('/enterprise/registry/capabilities');
    }
  };

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  YJ.api = {
    Asset: AssetAPI,
    Generation: GenerationAPI,
    Workspace: WorkspaceAPI,
    Registry: RegistryAPI
  };
  window.YJ = YJ;

  // Also expose as standalone for convenience
  window.EnterpriseAPI = {
    Asset: AssetAPI,
    Generation: GenerationAPI,
    Workspace: WorkspaceAPI,
    Registry: RegistryAPI
  };

  console.log('[Enterprise/API] API layer initialized (Phase 2-C-1-A: unified creation methods, Phase 2-C-1-C: image2video params, Phase 2-C-2-3-A: registry API)');
})();
