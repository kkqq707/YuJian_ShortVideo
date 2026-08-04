module.exports = (err, req, res, next) => {
  console.error('[ErrorHandler]', err.message || 'Unknown error');

  if (err.name === 'ValidationError') {
    return res.fail('参数验证失败', 400, err.errors);
  }

  if (err.name === 'UnauthorizedError') {
    return res.fail('登录已过期', 401);
  }

  res.fail(err.message || '服务器内部错误', 500);
};
