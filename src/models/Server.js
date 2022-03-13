const { Schema, model } = require('mongoose')
const { getEC2Instances } = require('../services/aws')
const { pick } = require('underscore')

const serverSchema = new Schema({
  instance_id: { type: String, required: true },
  organization_id: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Organization',
  },
  createdAt: { type: Date, required: true, default: Date.now },
  updatedAt: { type: Date, required: true, default: Date.now },
})

serverSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

serverSchema.methods.withInstance = async function () {
  const instance = (await getEC2Instances(this.instance_id))[0]
  delete instance.ClientToken
  delete instance.BlockDeviceMappings
  delete instance.NetworkInterfaces
  delete instance.KeyName
  delete instance.ImageId
  delete instance.SubnetId
  delete instance.VpcId
  delete instance.InstanceType
  delete instance.Tags
  delete instance.CpuOptions
  return {
    ...pick(this, (val, key, obj) => {
      return (
        ['instance_id', 'organization_id', 'createdAt', 'updatedAt'].indexOf(
          key,
        ) > -1
      )
    }),
    instance,
  }
}

module.exports.Server = model('Server', serverSchema, 'servers')
