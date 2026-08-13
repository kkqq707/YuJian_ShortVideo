module.exports = (err, req, res, next) => {
  console.error('[ErrorHandler]', err.message || 'Unknown error');

  if (err.name === 'ValidationError') {
    return res.fail('参数验证失败', 400, err.errors);
  }

  if (err.name === 'UnauthorizedError') {
    return res.fail('登录已过期', 401);
  }

  // Step4-E2 任务3：生产环境统一返回服务器内部错误，避免泄漏内部细节
  // （SQL / Sequelize / stack / 内部错误 message）；开发环境保留详细错误便于调试。
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction
    ? '服务器内部错误'
    : (err.message || '服务器内部错误');

  res.fail(message, 500);
};
