const { Schema, model } = require('mongoose')

const hexRegex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const platformSchema = new Schema({
  baseUrl: { type: String, required: true },
  apiKey: { type: String, default: '' },
  name: { type: String, required: true },
  organization: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Organization',
  },
  color: { type: String, required: true, match: hexRegex, default: '#000' },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
})

platformSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

module.exports.Platform = model('Platform', platformSchema, 'platforms')
