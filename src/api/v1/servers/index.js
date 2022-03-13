const { Types } = require('mongoose')
const { Organization } = require('../../../models/Organization')
const { Server } = require('../../../models/Server')
const {
  deployEC2Instance,
  startEC2Instance,
  stopEC2Instance,
  rebootEC2Instance,
  terminateEC2Instance,
  deleteRecord,
} = require('../../../services/aws')

const router = require('express').Router()

router.post('/:org_id', async (req, res) => {
  try {
    const org = await Organization.findById(req.params.org_id)
    if (!org) return res.status(404).send({ error: 'Organization not found.' })

    if (
      !org.members.find(
        (x) =>
          (x.role === 'admin' || x.role === 'owner') &&
          String(x.user) === String(req.user._id),
      )
    )
      return res.status(403).send({
        error:
          "You don't have permission to deploy servers in this organization.",
      })

    const server = new Server()
    server.organization_id = new Types.ObjectId(org._id)
    const instance = await deployEC2Instance(server._id)
    server.instance_id = instance.Instances[0].InstanceId

    await server.save()
    return res.status(201).send(server)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'Failed to deploy instance.' })
  }
})

// Start, stop, restart
router.post('/:id/:command', async (req, res) => {
  console.log(`server id: ${req.params.id} command="${req.params.command}"`)
  try {
    const server = await Server.findById(req.params.id)
    if (!server) return res.status(404).send({ error: 'Server not found.' })

    const org = await Organization.findById(server.organization_id)
    if (!org)
      return res
        .status(404)
        .send({ error: 'Organization attached to server not found.' })

    if (
      !org.members.find(
        (x) =>
          (x.role === 'admin' || x.role === 'owner') &&
          String(x.user) === String(req.user._id),
      )
    )
      return res.status(403).send({
        error:
          "You don't have permission to send commands to servers in this organization.",
      })

    try {
      const { command } = req.params
      if (command === 'start') {
        const response = await startEC2Instance(server.instance_id)
        return res.status(200).send(response)
      } else if (command === 'restart') {
        const response = await rebootEC2Instance(server.instance_id)
        return res.status(200).send(response)
      } else if (command === 'stop') {
        const response = await stopEC2Instance(server.instance_id)
        return res.status(200).send(response)
      }
    } catch (err) {
      return res.status(500).send({ error: err.message })
    }
  } catch (err) {
    return res.status(500).send({ error: 'Unknown error occurred.' })
  }
})

router.get('/:id', async (req, res) => {
  const { populate } = req.query

  try {
    const server = await Server.findById(req.params.id)
    if (!server) return res.status(404).send({ error: 'Server not found.' })

    const org = await Organization.findById(server.organization_id)
    if (!org)
      return res
        .status(404)
        .send({ error: 'Organization attached to server not found.' })

    if (!org.members.find((x) => String(x.user) === String(req.user._id)))
      return res.status(403).send({
        error: "You don't have permission to get servers in this organization.",
      })

    return res
      .status(200)
      .send(populate === 'true' ? await server.withInstance() : server)
  } catch (err) {
    return res.status(500).send({ error: 'Unknown error occurred.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
    if (!server) return res.status(404).send({ error: 'Server not found.' })

    const org = await Organization.findById(server.organization_id)
    if (!org)
      return res
        .status(404)
        .send({ error: 'Organization attached to server not found.' })

    if (
      !org.members.find(
        (x) =>
          (x.role === 'admin' || x.role === 'owner') &&
          String(x.user) === String(req.user._id),
      )
    )
      return res.status(403).send({
        error:
          "You don't have permission to delete servers in this organization.",
      })

    try {
      await terminateEC2Instance(server.instance_id)

      await deleteRecord(`${server._id}.nylund.us.`, 'A')

      await server.delete()
      return res.status(200).send({ message: 'Server deleted.' })
    } catch (err) {
      console.error(err)
      return res.status(500).send({ error: 'Failed to terminate instance.' })
    }
  } catch (err) {
    return res.status(500).send({ error: 'Unknown error occurred.' })
  }
})

module.exports.default = router
