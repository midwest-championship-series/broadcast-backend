const { decodeToken } = require('../services/auth')

module.exports.authRequired = (req, res, next) => {
  if (!req.user) return res.status(401).send({ error: 'Unauthorized.' })
  next()
}

module.exports.attachUser = async (req, res, next) => {
  const { headers } = req
  if (headers.Authorization || headers.authorization) {
    try {
      const user = await decodeToken(
        headers.Authorization || headers.authorization,
      )
      req.user = user
      next()
      return
    } catch (ex) {
      return res.status(401).send({ error: ex.message })
    }
  } else return res.status(401).send({ error: 'Authorization not sent.' })
}
