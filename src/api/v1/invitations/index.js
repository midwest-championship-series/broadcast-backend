const router = require('express').Router()
const Joi = require('joi')
Joi.objectId = require('joi-objectid')(Joi)

const { Organization } = require('../../../models/Organization')
const { Invitation } = require('../../../models/Invitation')
const { sendEmail } = require('../../../services/aws')

router.get('/', async (req, res) => {
  try {
    let invites = await Invitation.find({ email: req.user.email })
    invites = await Promise.all(
      invites.map(async (val, _) => {
        await val.populate('from', '-password -organizations')
        val.organization = await Organization.findById(val.organization_id)
        return val
      }),
    )
    return res.status(200).send(invites)
  } catch (err) {
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const invite = await Invitation.findById(id)
    if (!invite) return res.status(404).send({ error: 'Invitation not found.' })

    if (
      !(
        String(invite.from) === String(req.user._id) ||
        invite.email === req.user.email
      )
    ) {
      return res
        .status(403)
        .send({ error: "You don't have access to this invitation." })
    }

    return res.status(200).send(invite)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

const orgSchema = Joi.object().keys({
  email: Joi.string().email().required(),
  organization_id: Joi.objectId().required(),
})

router.post('/', async (req, res) => {
  const data = req.body

  try {
    const { error, value } = orgSchema.validate(data)
    if (error) {
      return res.status(400).send({ error: 'Invitation data not valid.' })
    }

    const org = await Organization.findById(data.organization_id)
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
          "You don't have permission to invite users to this organization.",
      })
    }

    const inv = await Invitation.findOne({
      email: data.email,
      organization_id: data.organization_id,
    })
    if (inv) {
      return res
        .status(409)
        .send({ error: 'That user was already invited to this organization.' })
    }

    await org.populate('members.user')

    if (org.members.find((x) => x.user.email === data.email)) {
      return res.status(409).send({
        error: 'A user with that email is already in your organization.',
      })
    }

    const invite = new Invitation(data)
    invite.from = req.user._id
    await invite.validate()
    await invite.save()

    await sendEmail(data.email, `Invitation to ${org.name}`, 'org-invite', {
      organization_name: org.name,
      url: `${process.env.BASE_URL}/invite/${invite._id}`,
    })

    return res.status(201).send(invite)
  } catch (err) {
    console.log(err)
    return res.status(500).send({ error: 'An unknown error occurred.' })
  }
})

router.delete('/:id', async (req, res) => {
  const { id } = req.params

  try {
    const invite = await Invitation.findById(id)
    if (!invite) return res.status(404).send({ error: 'Invitation not found.' })

    const org = await Organization.findById(invite.organization_id)
    if (!org) {
      return res
        .status(404)
        .send({ error: 'Organization attached to invitation not found.' })
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
          "You don't have permission to remove invitations in this organization.",
      })
    }

    await invite.delete()

    return res.status(200).send({ message: 'Invitation removed.' })
  } catch (err) {
    return res.status(500).send({ error: 'Failed to delete invitation.' })
  }
})

router.post('/:id', async (req, res) => {
  const user = req.user
  const { id } = req.params

  try {
    const invite = await Invitation.findById(id)
    if (!invite) return res.status(404).send({ error: 'Invitation not found.' })

    if (invite.email !== user.email)
      return res
        .status(403)
        .send({ error: 'Invitation not valid for current user.' })

    const org = await Organization.findById(invite.organization_id)

    if (!org) {
      return res
        .status(404)
        .send('Organization attached to invitation not found.')
    }

    if (org.members.find((x) => String(x.user) === String(user._id))) {
      return res
        .status(400)
        .send({ error: 'You are already a member of this organization.' })
    }

    org.members.push({
      user: user._id,
      role: 'member',
    })
    await org.save()

    return res.status(200).send({ message: 'Invitation accepted.' })
  } catch (err) {
    return res.status(500).send({ error: 'Failed to accept invitation.' })
  }
})

module.exports.default = router
