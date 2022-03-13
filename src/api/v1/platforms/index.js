const router = require('express').Router()
const { pick } = require('underscore')
const { Platform } = require('../../../models/Platform')
const { Organization } = require('../../../models/Organization')
const Joi = require('joi')
Joi.objectId = require('joi-objectid')(Joi)

router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const platform = await Platform.findById(id)
    await platform.populate('organization')

    if (!platform) return res.status(404).send({ error: 'Platform not found.' })

    return res.status(200).send(platform)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

const platformSchema = Joi.object().keys({
  baseUrl: Joi.string().required().min(10),
  organization: Joi.objectId().required(),
  name: Joi.string().required().min(2),
  apiKey: Joi.string(),
})

router.post('/', async (req, res) => {
  const data = req.body

  try {
    const { error, value } = platformSchema.validate(data)
    if (error)
      return res.status(400).send({ error: 'Platform data not valid.' })

    const platform = new Platform(data)
    await platform.validate()

    const org = await Organization.findById(data.organization)
    if (!org) return res.status(404).send({ error: 'Organization not found.' })

    org.platforms.push(platform._id)

    await org.save()
    await platform.save()

    return res.status(201).send(platform)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

const modifySchema = Joi.object().keys({
  baseUrl: Joi.string().min(10),
  name: Joi.string().min(2),
  apiKey: Joi.string(),
})

router.patch('/:id', async (req, res) => {
  const data = req.body
  const { id } = req.params
  try {
    let { error, value } = modifySchema.validate(data)

    if (error) return res.status(400).send({ error: 'Invalid platform data.' })

    value = pick(value, (val, key, obj) => {
      return ['baseUrl', 'name', 'apiKey'].indexOf(key) > -1
    })

    const platform = await Platform.findOne({ _id: id })

    if (!platform)
      return res.status(400).send({ error: "Platform doesn't exist" })

    await platform.populate('organization')

    if (
      !platform.organization.members.find(
        (x) =>
          String(x.user) === String(req.user._id) &&
          (x.role === 'admin' || x.role === 'owner'),
      )
    )
      return res
        .status(403)
        .send({ error: "You don't have permission to modify this platform." })

    if (Object.keys(value).length === 0)
      return res
        .status(400)
        .send({ error: 'No valid update properties specified.' })

    Object.keys(value).forEach((key) => {
      platform[key] = value[key]
    })

    await platform.save()

    return res.status(200).send(platform)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'Failed to update platform.' })
  }
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params

  try {
    const platform = await Platform.findById(id)
    if (!platform) return res.status(404).send({ error: 'Platform not found.' })

    await platform.populate('organization')
    if (
      !platform.organization.members.find(
        (x) =>
          String(x.user) === String(req.user._id) &&
          (x.role === 'admin' || x.role === 'owner'),
      )
    )
      return res
        .status(403)
        .send({ error: "You don't have permission to delete this platform." })

    await platform.delete()
    const org = await Organization.findOne({ _id: platform.organization._id })
    if (org) {
      org.platforms = org.platforms.filter(
        (x) => String(x) !== String(platform._id),
      )
      await org.save()
    }

    return res.status(200).send({ message: 'Platform deleted.' })
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'Failed to delete platform.' })
  }
})

module.exports.default = router
