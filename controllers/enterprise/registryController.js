/**
 * Registry Controller — AI Model Registry API 控制器
 *
 * Phase 2-C-2-1: AI Model Registry API 端点
 */

const registryService = require('../../services/registryService');

/**
 * GET /api/enterprise/registry/templates
 *
 * 返回所有可用 template，包含关联的 model 完整信息
 */
exports.templates = async (req, res) => {
  try {
    const templates = registryService.getAllTemplates();
    res.success(templates);
  } catch (err) {
    console.error('[RegistryController] templates error:', err);
    res.fail('获取模板列表失败', 500);
  }
};

/**
 * GET /api/enterprise/registry/models?capability=xxx
 *
 * 返回对应能力的模型列表；不传 capability 返回全部模型
 */
exports.models = async (req, res) => {
  try {
    const { capability } = req.query;
    const models = registryService.getModels(capability || null);
    res.success(models);
  } catch (err) {
    console.error('[RegistryController] models error:', err);
    res.fail('获取模型列表失败', 500);
  }
};

/**
 * GET /api/enterprise/registry/capabilities
 *
 * 返回 registry 中的所有 capability 及其基本信息
 */
exports.capabilities = async (req, res) => {
  try {
    const capabilities = registryService.getAllCapabilities();
    res.success(capabilities);
  } catch (err) {
    console.error('[RegistryController] capabilities error:', err);
    res.fail('获取能力列表失败', 500);
  }
};
