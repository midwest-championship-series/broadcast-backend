const mongoose = require('mongoose')
mongoose.Promise = global.Promise
let isConnected

module.exports.database = (req, res, next) => {
  if (isConnected) {
    console.log('=> using existing database connection')
    next()
    return
  }

  console.log('=> using new database connection')
  mongoose
    .connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      bufferCommands: false,
    })
    .then((db) => {
      isConnected = db.connections[0].readyState

      // "Warm up" models
      require('../models/Organization')
      require('../models/Invitation')
      require('../models/Server')
      require('../models/Platform')
      require('../models/User')

      next()
      return
    })
    .catch((err) => {
      console.log(err)
      return res.status(500).send({ error: 'Failed to connect to database.' })
    })
}
