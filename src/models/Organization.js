const { Schema, model } = require('mongoose')

const roleEnum = {
  values: ['member', 'admin', 'owner'],
  message: 'Role not valid.',
}

const hexRegex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const memberSchema = new Schema({
  user: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  role: { type: String, enum: roleEnum, required: true, default: 'member' },
})

const orgSchema = new Schema({
  members: { type: [memberSchema], required: true, default: [] },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  color: { type: String, required: true, match: hexRegex, default: '#000' },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
})

orgSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

module.exports.Organization = model('Organization', orgSchema, 'organizations')
