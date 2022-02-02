const { Schema, model } = require('mongoose')

const platformSchema = new Schema({
  baseUrl: { type: String, required: true },
  apiKey: { type: String, default: '' },
  name: { type: String, required: true },
  organization: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Organization',
  },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
})

platformSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

module.exports.Platform = model('Platform', platformSchema, 'platforms')
