function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      const details = error.details.map(d => d.message).join('; ');
      return res.status(400).json({ success: false, error: details });
    }
    req.body = value;
    next();
  };
}

module.exports = { validate };
