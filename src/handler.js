const serverless = require('serverless-http')
const express = require('express')
const cors = require('cors')
const app = express()

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  }),
)

app.use(
  '/api',
  require('connect-timeout')('10s'),
  require('body-parser').json(),
  require('./middleware/db').database,
  require('./api').default,
)

module.exports.app = serverless(app)
