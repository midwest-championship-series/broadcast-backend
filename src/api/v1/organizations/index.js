const router = require('express').Router()
const Joi = require('joi')
Joi.objectId = require('joi-objectid')(Joi)
const { pick } = require('underscore')
const { SchemaTypes, Types } = require('mongoose')
const { Invitation } = require('../../../models/Invitation')
const { Platform } = require('../../../models/Platform')
const { Organization } = require('../../../models/Organization')
const { Server } = require('../../../models/Server')
const { getEC2Instances } = require('../../../services/aws')

router.get('/:id/invitations', async (req, res) => {
  const { id } = req.params
  try {
    const org = await Organization.findById(id)
    if (!org) {
      return res.status(404).send({ error: 'Organization not found.' })
    }

    if (
      !org.members.find(
        (x) =>
          (x.role === 'admin' || x.role === 'owner') &&
          String(x.user) === String(req.user._id),
      )
    ) {
      return res.status(403).send({
        error:
          "You don't have permission to get invitations in this organization.",
      })
    }
    let invites = await Invitation.find({
      organization: new Types.ObjectId(id),
    })

    invites = await Promise.all(
      invites.map(async (val, _) => {
        await val.populate('from', '-password -updatedAt')
        await val.populate('organization')
        return val
      }),
    )

    return res.status(200).send(invites)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

router.get('/:id/platforms', async (req, res) => {
  const { id } = req.params
  try {
    const org = await Organization.findById(id)
    if (!org) {
      return res.status(404).send({ error: 'Organization not found.' })
    }

    if (!org.members.find((x) => String(x.user) === String(req.user._id)))
      return res.status(403).send({
        error: "You aren't a member of this organization.",
      })

    const platforms = await Platform.find({
      organization: new Types.ObjectId(id),
    })

    return res.status(200).send(platforms)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

router.get(
  '/:id/servers',
  require('connect-timeout')('10s'),
  async (req, res) => {
    const { id } = req.params
    const { populate } = req.query

    try {
      const org = await Organization.findById(id)
      if (!org) {
        return res.status(404).send({ error: 'Organization not found.' })
      }

      if (!org.members.find((x) => String(x.user) === String(req.user._id))) {
        return res.status(403).send({
          error: "You aren't a member of this organization.",
        })
      }
      let servers = await Server.find({
        organization_id: new Types.ObjectId(id),
      })

      if (populate === 'true') {
        const instance_ids = []
        for (let i = 0; i < servers.length; i++) {
          instance_ids.push(servers[i].instance_id)
        }

        const instances = []
        try {
          instances.push(...(await getEC2Instances(instance_ids)))
        } catch (err) {}

        servers = await Promise.all(
          servers.map(async (val) => {
            let instance = instances.find(
              (x) => x.InstanceId === val.instance_id,
            )
            return { ...val, instance }
          }),
        )
      }

      return res.status(200).send(servers)
    } catch (err) {
      console.log(err)
      return res.status(500).send({ error: 'An unknown error occurred.' })
    }
  },
)

router.get('/', async (req, res) => {
  try {
    // MODIFY
    const orgs = await Organization.find({
      'members.user': req.user._id,
    }).populate('members.user', '-password -updatedAt')
    return res.status(200).send(orgs)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

router.get('/:id', require('connect-timeout')('10s'), async (req, res) => {
  const { id } = req.params
  const { servers, invitations, platforms, members } = req.query
  try {
    const orgQuery = Organization.findById(id).lean()

    if (members) orgQuery.populate('members.user', '-password -updatedAt')

    const org = await orgQuery

    if (!org) {
      return res.status(404).send({ error: 'Organization not found.' })
    }

    if (!org.members.find((x) => String(x.user._id) === String(req.user._id))) {
      return res.status(403).send({
        error: "You aren't a member of this organization.",
      })
    }

    if (invitations) {
      org.invitations = await Promise.all(
        (
          await Invitation.find({
            organization: org._id,
          })
        ).map(async (val, _) => {
          await val.populate('from', '-password -updatedAt')
          return val
        }),
      )
    }

    if (platforms) {
      org.platforms = await Platform.find({
        organization: new Types.ObjectId(id),
      })
    }

    if (servers) {
      org.servers = await Server.find({
        organization_id: new Types.ObjectId(id),
      }).lean()

      const instance_ids = []
      for (let i = 0; i < org.servers.length; i++) {
        instance_ids.push(org.servers[i].instance_id)
      }

      const instances = []
      if (instance_ids.length > 0) {
        instances.push(...(await getEC2Instances(instance_ids)))
      }

      org.servers = await Promise.all(
        org.servers.map(async (val) => {
          let instance = instances.find((x) => x.InstanceId === val.instance_id)
          return { ...val, instance }
        }),
      )
    }

    if (!res.headersSent) return res.status(200).send(org)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

const orgSchema = Joi.object().keys({
  name: Joi.string().required(),
  color: Joi.string().pattern(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i),
  description: Joi.string(),
})

router.post('/', async (req, res) => {
  const data = req.body

  try {
    const { error, value } = orgSchema.validate(data)
    if (error)
      return res.status(400).send({ error: 'Organization data not valid.' })

    const org = new Organization(data)

    // Set current user as owner
    org.members = []
    org.members.push({
      user: req.user._id,
      role: 'owner',
    })

    await org.validate()
    await org.save()

    return res.status(201).send(org)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

const modifySchema = Joi.object().keys({
  name: Joi.string().min(2),
  description: Joi.string(),
  color: Joi.string().pattern(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i),
})

router.patch('/:id', async (req, res) => {
  const data = req.body
  const { id } = req.params
  try {
    let { error, value } = modifySchema.validate(data)

    if (error)
      return res.status(400).send({ error: 'Invalid organization data.' })

    value = pick(value, (val, key, obj) => {
      return ['name', 'description'].indexOf(key) > -1
    })

    const org = await Organization.findOne({ _id: id })

    if (!org)
      return res.status(404).send({ error: "Organization doesn't exist." })

    if (
      !org.members.find(
        (x) =>
          String(x.user) === String(req.user._id) &&
          (x.role === 'admin' || x.role === 'owner'),
      )
    )
      return res.status(403).send({
        error: "You don't have permission to modify this organization.",
      })

    if (Object.keys(value).length === 0)
      return res
        .status(400)
        .send({ error: 'No valid update properties specified.' })

    Object.keys(value).forEach((key) => {
      org[key] = value[key]
    })

    await org.save()
    return res.status(200).send(org)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'Failed to update organization.' })
  }
})

router.delete('/:id', async (req, res) => {
  const { id } = req.query

  try {
    if (!req.user.organizations.find((x) => String(x) === id))
      return res.status(404).send({ error: 'Organization not found.' })

    const org = await Organization.findById(id).populate('members.user')
    if (
      !org.members.find(
        (x) =>
          String(x.user._id) === String(req.user._id) && x.role === 'owner',
      )
    )
      return res.status(403).send({
        error: "You don't have permission to delete this organization.",
      })

    const server = await Server.findOne({
      organization_id: new SchemaTypes.ObjectId(org._id),
    })
    if (server)
      return res
        .status(409)
        .send({ error: 'A server still exists in this organization.' })

    await org.delete()

    return res.status(200).send({ message: 'Organization removed.' })
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'Failed to delete organization.' })
  }
})

router.delete('/:id/members/:user_id', async (req, res) => {
  const { id, user_id } = req.params

  try {
    const org = await Organization.findById(id).populate('members.user')
    if (
      !org.members.find(
        (x) =>
          String(x.user._id) === String(req.user._id) && x.role === 'owner',
      )
    )
      return res.status(403).send({
        error:
          "You don't have permission to remove users from this organization.",
      })

    // Remove
    org.members = org.members.filter(
      (x) => String(x.user._id) !== String(user_id),
    )
    await org.save()

    return res.status(200).send({ message: 'User removed from organization.' })
  } catch (err) {
    console.log(err)
    return res
      .status(500)
      .send({ error: 'Failed to remove user from organization.' })
  }
})

module.exports.default = router
