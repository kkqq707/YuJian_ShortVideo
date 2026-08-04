const { Plan } = require('../../models');

exports.list = async (req, res) => {
  const list = await Plan.findAll({
    where: { status: 1 },
    order: [['sort', 'ASC']]
  });
  res.success(list);
};
