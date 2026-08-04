const { ApiConfig } = require('../../models');

exports.getList = async (req, res) => {
  const configs = await ApiConfig.findAll({ order: [['id', 'ASC']] });
  const result = {};
  configs.forEach(item => {
    try {
      result[item.config_key] = JSON.parse(item.config_value);
    } catch (e) {
      result[item.config_key] = item.config_value;
    }
  });
  res.success(result);
};

exports.save = async (req, res) => {
  const { key, value, description } = req.body;
  if (!key) return res.fail('配置键不能为空');

  await ApiConfig.setConfig(key, value, description);
  res.success({ message: '保存成功' });
};

exports.batchSave = async (req, res) => {
  const configs = req.body;
  for (const key in configs) {
    await ApiConfig.setConfig(key, configs[key]);
  }
  res.success({ message: '批量保存成功' });
};
