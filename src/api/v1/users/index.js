const router = require('express').Router()
const { User } = require('../../../models/User')
const { generateLoginObject } = require('../../../services/auth')
const { compare } = require('bcryptjs')
const { pick } = require('underscore')
const Joi = require('joi')

router.get(
  '/',
  require('../../../middleware/auth').attachUser,
  require('../../../middleware/auth').authRequired,
  async (req, res) => {
    return res.status(200).send(req.user.toPublic())
  },
)

const userDataSchema = Joi.object().keys({
  email: Joi.string().email().required(),
  firstname: Joi.string().required(),
  lastname: Joi.string().required(),
  password: Joi.string().min(8).required(),
})

router.post('/', async (req, res) => {
  const data = req.body

  try {
    const { error, value } = userDataSchema.validate(data)
    if (error) return res.status(400).send({ error: 'User data not valid.' })

    const user = new User(data)
    await user.validate()
    await user.save()

    return res.status(200).send(generateLoginObject(user))
  } catch (err) {
    if (err.message.includes('E11000')) {
      return res.status(400).send({ error: 'User already exists.' })
    }
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

const modifySchema = Joi.object().keys({
  firstname: Joi.string(),
  lastname: Joi.string(),
  password: Joi.object().keys({
    old: Joi.string().min(8).required(),
    new: Joi.string().min(8).required(),
  }),
})

router.patch(
  '/',
  require('../../../middleware/auth').attachUser,
  require('../../../middleware/auth').authRequired,
  async (req, res) => {
    const data = req.body
    const id = req.user._id
    try {
      let { value } = modifySchema.validate(data)
      value = pick(value, (val, key, obj) => {
        return ['firstname', 'lastname', 'password'].indexOf(key) > -1
      })

      const user = await User.findOne({ _id: id })

      if (!user) return res.status(404).send({ error: "User doesn't exist." })

      if (value.password) {
        if (!value.password.new)
          return res.status(400).send({ error: 'New password not specified.' })

        if (!(await compare(value.password.old, user.password)))
          return res.status(401).send({ error: "Old password doesn't match." })

        value.password = value.password.new
      }

      if (Object.keys(value).length === 0)
        return res
          .status(400)
          .send({ error: 'No valid update properties specified.' })

      Object.keys(value).forEach((key) => {
        user[key] = value[key]
      })

      await user.save()
      return res.status(200).send(generateLoginObject(user))
    } catch (err) {
      return res.status(500).send({ error: 'Failed to update user.' })
    }
  },
)

router.delete(
  '/',
  require('../../../middleware/auth').attachUser,
  require('../../../middleware/auth').authRequired,
  async (req, res) => {
    const user = req.user

    try {
      await user.delete()
      return res.status(200).send({ message: 'User removed.' })
    } catch (err) {
      return res.status(500).send({ error: 'Failed to delete user.' })
    }
  },
)

module.exports.default = router
