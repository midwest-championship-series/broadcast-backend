const { compare } = require('bcryptjs')
const { verify, sign } = require('jsonwebtoken')

const { User } = require('../models/User')

const jwtSecret = process.env.JWT_SIGNING_KEY

module.exports.login = async (email, password) => {
  const user = await User.findOne({ email })
  if (!user) {
    throw { status: 401, message: "User doesn't exist." }
  }
  const passwordsMatch = await compare(password, user.password)
  if (passwordsMatch) {
    return user
  }
  throw { status: 401, message: 'Invalid password.' }
}

module.exports.generateLoginObject = (user) => {
  const objectToSign = {
    id: user._id,
    expiration: new Date(
      Date.now() +
        1000 * 60 * 60 * 24 * (process.env.NODE_ENV === 'local' ? 30 : 1),
    ),
  }

  return {
    user: user.toPublic(),
    token: sign(objectToSign, jwtSecret),
  }
}

module.exports.decodeToken = (authorization) => {
  const jwt = verify(authorization, jwtSecret)
  if (!jwt) throw new Error('Invalid token.')
  if (Date.now() > new Date(jwt.expiration).getTime()) {
    throw new Error('Token expired.')
  }

  return User.findById(jwt.id).exec()
}
