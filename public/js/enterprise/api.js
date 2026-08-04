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

  // ─── Expose to Global ─────────────────────────────────────
  var YJ = window.YJ || {};
  YJ.api = {
    Asset: AssetAPI,
    Generation: GenerationAPI,
    Workspace: WorkspaceAPI
  };
  window.YJ = YJ;

  // Also expose as standalone for convenience
  window.EnterpriseAPI = {
    Asset: AssetAPI,
    Generation: GenerationAPI,
    Workspace: WorkspaceAPI
  };

  console.log('[Enterprise/API] API layer initialized');
})();
