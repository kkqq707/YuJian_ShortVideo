/**
 * YuJian Enterprise — Model Data Loader
 *
 * Phase 2-C-2-3-A: 统一 AI Model 数据链路
 *
 * 职责：
 *   1. 从 Registry API 获取 template / model / capability 数据
 *   2. 填充 YJ.state.aiModels 统一状态
 *   3. 提供会话级缓存（TTL 30分钟）
 *   4. 错误处理与降级
 *
 * 依赖：state.js, api.js（必须在此之前加载）
 *
 * 使用方式：
 *   // 等待数据就绪
 *   await YJ.modules.modelData.ensureLoaded();
 *
 *   // 或直接通过 state 查询
 *   var model = YJ.state.getModelByTemplateId('image_to_video');
 *   var isReady = YJ.state.isAiModelsReady();
 */

(function () {
  'use strict';

  var state = (window.YJ && window.YJ.state) || {};
  var api = (window.YJ && window.YJ.api) || {};

  // ─── Constants ──────────────────────────────────────────────
  var CACHE_TTL = 30 * 60 * 1000; // 30 分钟缓存有效期
  var MAX_RETRIES = 2;            // 最大重试次数
  var RETRY_DELAY = 2000;         // 重试基础延迟 (ms)

  // ─── Cache Helpers ──────────────────────────────────────────

  /** 检查缓存是否仍然有效 */
  function isCacheValid() {
    var am = state.aiModels;
    if (!am || !am.lastFetchTime) return false;
    return (Date.now() - am.lastFetchTime) < CACHE_TTL;
  }

  /** 检查数据是否已成功加载 */
  function isLoaded() {
    return !!(state.aiModels && state.aiModels.isLoaded);
  }

  // ─── Core Loader ────────────────────────────────────────────

  /**
   * 加载 AI Model 数据到 YJ.state.aiModels
   *
   * @param {Object} [opts]
   * @param {boolean} [opts.forceRefresh] — 强制跳过缓存重新获取
   * @param {boolean} [opts.background]   — 后台刷新：不触发 loading 状态变更
   * @returns {Promise<Object>} aiModels state
   */
  async function loadAiModels(opts) {
    opts = opts || {};
    var forceRefresh = opts.forceRefresh;
    var background = opts.background;

    // 缓存命中 → 直接返回
    if (!forceRefresh && isCacheValid() && isLoaded()) {
      console.log('[ModelData] Using cached AI model data');
      return state.aiModels;
    }

    // 防止重复并发请求
    if (state.aiModels && state.aiModels.isLoading) {
      console.log('[ModelData] Load already in progress, waiting...');
      // 轮询等待最多 10 秒
      return waitForLoad(10000);
    }

    // 标记加载中
    if (state.setAiModelsLoading) {
      state.setAiModelsLoading(true);
    }
    if (state.aiModels) {
      state.aiModels.error = null;
    }

    var retries = 0;
    var lastError = null;

    while (retries <= MAX_RETRIES) {
      try {
        var registryAPI = (api.Registry) || (window.EnterpriseAPI && window.EnterpriseAPI.Registry);

        if (!registryAPI) {
          throw new Error('Registry API not available — ensure api.js is loaded before model-data.js');
        }

        // 并行获取 templates 和 capabilities
        var results = await Promise.all([
          registryAPI.getTemplates().catch(function (err) {
            console.warn('[ModelData] Templates fetch failed:', err);
            return null;
          }),
          registryAPI.getCapabilities().catch(function (err) {
            console.warn('[ModelData] Capabilities fetch failed:', err);
            return null;
          })
        ]);

        var templates = results[0];
        var capabilities = results[1];

        // 检查数据完整性
        if (!templates || !templates.length) {
          console.warn('[ModelData] Templates data empty — registry may not be initialized');
        }

        // 填充状态
        if (state.setAiModelsData) {
          state.setAiModelsData(
            templates || [],
            capabilities || []
          );
        } else {
          // Fallback: 直接写入（当 state.js accessor 不可用时）
          buildAndSetDirect(templates || [], capabilities || []);
        }

        if (state.aiModels) {
          state.aiModels.isLoading = false;
          state.aiModels.error = null;
        }

        var modelCount = Object.keys(state.aiModels.models || {}).length;
        var templateCount = (state.aiModels.templates || []).length;
        var capCount = (state.aiModels.capabilities || []).length;
        console.log(
          '[ModelData] AI models loaded:',
          modelCount, 'models,',
          templateCount, 'templates,',
          capCount, 'capabilities',
          (retries > 0 ? '(retry ' + retries + ')' : '')
        );

        return state.aiModels;

      } catch (err) {
        lastError = err;
        retries++;

        if (retries <= MAX_RETRIES) {
          var delay = RETRY_DELAY * retries;
          console.warn(
            '[ModelData] Load attempt ' + retries + ' failed:',
            (err && err.message) || err,
            '— retrying in ' + delay + 'ms'
          );
          await sleep(delay);
        }
      }
    }

    // 所有重试都失败
    console.error('[ModelData] All retries exhausted:', lastError);

    if (state.aiModels) {
      state.aiModels.isLoading = false;
    }

    if (state.setAiModelsError) {
      state.setAiModelsError(
        (lastError && lastError.message) || 'Failed to load AI model data'
      );
    } else if (state.aiModels) {
      state.aiModels.error = (lastError && lastError.message) || 'Failed to load AI model data';
    }

    throw lastError;
  }

  // ─── Fallback: 直接构建状态（当 accessor 不可用时）─────────────

  function buildAndSetDirect(templates, capabilities) {
    if (!state.aiModels) return;

    var models = {};
    var templateToModel = {};
    var capabilityToModels = {};
    var modelToTemplate = {};

    for (var i = 0; i < templates.length; i++) {
      var t = templates[i];
      if (t.templateId && t.defaultModelId) {
        templateToModel[t.templateId] = t.defaultModelId;
      }
      if (t.model && t.model.id) {
        var m = t.model;
        models[m.id] = m;
        if (t.templateId) {
          modelToTemplate[m.id] = t.templateId;
        }
        if (m.capability) {
          if (!capabilityToModels[m.capability]) {
            capabilityToModels[m.capability] = [];
          }
          if (capabilityToModels[m.capability].indexOf(m.id) === -1) {
            capabilityToModels[m.capability].push(m.id);
          }
        }
      }
    }

    state.aiModels.templates = templates;
    state.aiModels.models = models;
    state.aiModels.capabilities = capabilities;
    state.aiModels.templateToModel = templateToModel;
    state.aiModels.capabilityToModels = capabilityToModels;
    state.aiModels.modelToTemplate = modelToTemplate;
    state.aiModels.isLoaded = true;
    state.aiModels.lastFetchTime = Date.now();
    state.aiModels.error = null;
    state.aiModels.isLoading = false;
  }

  // ─── Wait for concurrent load ───────────────────────────────

  function waitForLoad(timeoutMs) {
    return new Promise(function (resolve, reject) {
      var startTime = Date.now();
      var interval = setInterval(function () {
        if (isLoaded()) {
          clearInterval(interval);
          resolve(state.aiModels);
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          reject(new Error('Timeout waiting for AI model data load'));
        }
      }, 100);
    });
  }

  // ─── Utility ─────────────────────────────────────────────────

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // ─── Public API: Ensure Loaded ──────────────────────────────

  /**
   * 确保 AI model 数据已加载（供 UI 模块在需要时调用）
   *
   * 支持四种场景：
   *   1. 已加载 → 立即返回
   *   2. 缓存有效 → 立即返回
   *   3. 缓存过期 → 后台刷新，先返回旧数据
   *   4. 从未加载 → 阻塞等待加载完成
   *
   * @returns {Promise<Object>} aiModels state
   */
  async function ensureLoaded() {
    // 场景 1: 已加载
    if (isLoaded()) {
      // 场景 3: 缓存过期，后台静默刷新
      if (!isCacheValid() && !(state.aiModels && state.aiModels.isLoading)) {
        console.log('[ModelData] Cache expired, refreshing in background...');
        loadAiModels({ forceRefresh: true, background: true }).catch(function (err) {
          console.warn('[ModelData] Background refresh failed:', (err && err.message) || err);
        });
      }
      return state.aiModels;
    }

    // 场景 4: 从未加载
    return loadAiModels();
  }

  /**
   * 刷新数据（强制重新获取）
   * @returns {Promise<Object>} aiModels state
   */
  function refresh() {
    return loadAiModels({ forceRefresh: true });
  }

  // ─── Digital Human Capability Accessors (Phase 2-C-2-4-B-2-B-1) ──

  /**
   * 获取 digital_human capability 对应的模型列表
   *
   * 数据流: Registry API → aiModels.capabilityToModels['digital_human'] → models[]
   * 禁止硬编码 modelId（如 'wanx-digital-human'），始终通过 capability 动态查找
   *
   * @returns {Object[]} 数字人模型配置数组（浅拷贝），未加载返回空数组
   */
  function getDigitalHumanModels() {
    if (!state.getModelsByCapability) {
      console.warn('[ModelData] getDigitalHumanModels: state.getModelsByCapability not available');
      return [];
    }
    return state.getModelsByCapability('digital_human');
  }

  /**
   * 获取主数字人模型配置（取 digital_human capability 下第一个模型）
   *
   * @returns {Object|null} 模型配置对象（浅拷贝），未找到返回 null
   */
  function getPrimaryDigitalHumanModel() {
    var models = getDigitalHumanModels();
    return (models && models.length > 0) ? models[0] : null;
  }

  /**
   * 获取 digital_human template 配置
   *
   * 从 aiModels.templates 中查找 templateId === 'digital_human' 的模板
   *
   * @returns {Object|null} 模板配置对象（浅拷贝），未找到返回 null
   */
  function getDigitalHumanTemplate() {
    if (!state.aiModels || !state.aiModels.templates) return null;
    var templates = state.aiModels.templates;
    for (var i = 0; i < templates.length; i++) {
      if (templates[i].templateId === 'digital_human') {
        return Object.assign({}, templates[i]);
      }
    }
    return null;
  }

  /**
   * 检查 digital_human capability 模型数据是否已就绪
   *
   * @returns {boolean}
   */
  function isDigitalHumanReady() {
    if (!isLoaded()) return false;
    var models = getDigitalHumanModels();
    return models && models.length > 0;
  }

  // ─── Expose to Global ───────────────────────────────────────

  var YJ = window.YJ || {};
  if (!YJ.modules) YJ.modules = {};
  YJ.modules.modelData = {
    load: loadAiModels,
    ensureLoaded: ensureLoaded,
    refresh: refresh,
    isCacheValid: isCacheValid,
    isLoaded: isLoaded,
    // Phase 2-C-2-4-B-2-B-1: Digital Human capability accessors
    getDigitalHumanModels: getDigitalHumanModels,
    getPrimaryDigitalHumanModel: getPrimaryDigitalHumanModel,
    getDigitalHumanTemplate: getDigitalHumanTemplate,
    isDigitalHumanReady: isDigitalHumanReady
  };
  window.YJ = YJ;

  // ─── Auto-load on script init ───────────────────────────────

  loadAiModels().catch(function (err) {
    // Auto-load 失败不阻塞页面，UI 模块后续可通过 ensureLoaded() 重试
    console.warn('[ModelData] Initial auto-load failed — UI modules can retry via ensureLoaded():',
      (err && err.message) || err);
  });

  console.log('[ModelData] Module initialized (Phase 2-C-2-3-A, Phase 2-C-2-4-B-2-B-1: digitalHuman capability accessors)');
})();
