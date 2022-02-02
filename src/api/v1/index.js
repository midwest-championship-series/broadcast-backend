const { generateLoginObject, login } = require('../../services/auth')

const router = require('express').Router()

router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email) return res.status(400).send({ error: 'Email not provided. ' })

  if (!password)
    return res.status(400).send({ error: 'Password not provided.' })

  try {
    const user = await login(email, password)

    return res.status(200).send(generateLoginObject(user))
  } catch (err) {
    return res.status(err.status || 500).send({ error: err.message })
  }
})

router.use(
  '/servers',
  require('../../middleware/auth').attachUser,
  require('../../middleware/auth').authRequired,
  require('./servers').default,
)
router.use(
  '/invitations',
  require('../../middleware/auth').attachUser,
  require('../../middleware/auth').authRequired,
  require('./invitations').default,
)
router.use(
  '/organizations',
  require('../../middleware/auth').attachUser,
  require('../../middleware/auth').authRequired,
  require('./organizations').default,
)
router.use(
  '/platforms',
  require('../../middleware/auth').attachUser,
  require('../../middleware/auth').authRequired,
  require('./platforms').default,
)
router.use('/users', require('./users').default)

module.exports.default = router
