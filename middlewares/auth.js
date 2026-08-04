const jwt = require('jsonwebtoken');

exports.auth = (roles = []) => {
  return (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.fail('请先登录', 401);
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      if (roles.length && !roles.includes(decoded.userType)) {
        return res.fail('无权限访问', 403);
      }

      req.user = decoded;
      next();
    } catch (error) {
      return res.fail('登录已过期，请重新登录', 401);
    }
  };
};

exports.adminAuth = exports.auth(['admin']);
exports.agentAuth = exports.auth(['agent']);
exports.enterpriseAuth = exports.auth(['enterprise']);
