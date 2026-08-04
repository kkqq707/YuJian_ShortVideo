const { Enterprise } = require('../../models');

exports.getSettings = async (req, res) => {
  const enterprise = await Enterprise.findByPk(req.user.enterpriseId, {
    attributes: ['id', 'company_name', 'brand_name', 'brand_logo', 'quota_balance', 'plan_id', 'expire_at']
  });
  res.success(enterprise);
};

exports.updateBrand = async (req, res) => {
  const enterprise = await Enterprise.findByPk(req.user.enterpriseId);
  const { brand_name, brand_logo } = req.body;
  await enterprise.update({ brand_name, brand_logo });
  res.success({ message: '更新成功' });
};
