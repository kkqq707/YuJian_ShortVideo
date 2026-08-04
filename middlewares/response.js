module.exports = (req, res, next) => {
  res.success = (data = null, message = 'success') => {
    res.json({
      code: 200,
      message,
      data
    });
  };

  res.fail = (message = 'error', code = 400, data = null) => {
    res.status(code).json({
      code,
      message,
      data
    });
  };

  next();
};
