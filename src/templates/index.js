const pug = require('pug')
module.exports.compileTemplate = (template, data) => {
  return pug.renderFile(`${__dirname}/${template}.pug`, data)
}
