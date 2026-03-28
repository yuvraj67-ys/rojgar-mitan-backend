const checkAdminSecret = (req, res, next) => {
  const secret = req.headers['x-admin-secret'];
  
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: 'Forbidden: Invalid Admin Secret' });
  }
  
  next();
};

module.exports = { checkAdminSecret };
