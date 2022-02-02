const { Schema, model } = require('mongoose')
const { validateEmail } = require('./_User')

const invitationSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    validate: validateEmail,
  },
  organization_id: { type: Schema.Types.ObjectId, required: true },
  from: { type: Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
})

invitationSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

module.exports.Invitation = model('Invitation', invitationSchema, 'invitations')
