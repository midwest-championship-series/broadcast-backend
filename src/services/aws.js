// Setup SES
const AWS = require('aws-sdk')
const { Types } = require('mongoose')
const { compileTemplate } = require('../templates')

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  require('dotenv').config()
}

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
})

const ses = new AWS.SES({ apiVersion: '2010-12-01' })
const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' })
const r53 = new AWS.Route53({ apiVersion: '2013-04-01' })

module.exports.sendEmail = async (to, subject, template, templateData) => {
  const params = {
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to],
    },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: compileTemplate(template, templateData),
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: subject,
      },
    },
    Source: 'broadcast@nylund.us',
  }
  return ses.sendEmail(params).promise()
}

module.exports.getEC2Instances = (instances) => {
  return new Promise((resolve, reject) => {
    ec2.describeInstances(
      {
        InstanceIds: Array.isArray(instances) ? instances : [instances],
      },
      (err, data) => {
        if (err) {
          reject(err)
        } else {
          const instances = []
          for (let i = 0; i < data.Reservations.length; i++) {
            instances.push(...data.Reservations[i].Instances)
          }
          resolve(instances)
        }
      },
    )
  })
}

module.exports.rebootEC2Instance = (instance_id) => {
  return new Promise((resolve, reject) => {
    ec2.rebootInstances(
      {
        InstanceIds: [instance_id],
      },
      (err, data) => {
        if (err) reject(err)
        else resolve(data)
      },
    )
  })
}

module.exports.stopEC2Instance = (instance_id) => {
  return new Promise((resolve, reject) => {
    ec2.stopInstances(
      {
        InstanceIds: [instance_id],
      },
      (err, data) => {
        if (err) reject(err)
        else resolve(data)
      },
    )
  })
}

module.exports.startEC2Instance = (instance_id) => {
  return new Promise((resolve, reject) => {
    ec2.startInstances(
      {
        InstanceIds: [instance_id],
      },
      (err, data) => {
        if (err) reject(err)
        else resolve(data)
      },
    )
  })
}

module.exports.terminateEC2Instance = (instance_id) => {
  return new Promise((resolve, reject) => {
    ec2.terminateInstances(
      {
        InstanceIds: [instance_id],
      },
      (err, data) => {
        if (err) reject(err)
        else resolve(data)
      },
    )
  })
}

const findRecord = async (name, type, start = undefined) => {
  const data = await r53
    .listResourceRecordSets({
      HostedZoneId: process.env.HOSTED_ZONE_ID,
      StartRecordIdentifier: start,
    })
    .promise()

  const resource = data.ResourceRecordSets.find(
    (x) => x.Name === name && x.Type === type,
  )

  if (!resource && !data.IsTruncated) throw new Error('Record not found.')

  return resource
    ? resource
    : await findRecord(name, type, data.NextRecordIdentifier)
}

module.exports.deleteRecord = (name, type) => {
  return new Promise(async (resolve, reject) => {
    const record = await findRecord(name, type)
    r53.changeResourceRecordSets(
      {
        HostedZoneId: process.env.HOSTED_ZONE_ID,
        ChangeBatch: {
          Changes: [
            {
              Action: 'DELETE',
              ResourceRecordSet: {
                Name: record.Name,
                Type: record.Type,
                ResourceRecords: record.ResourceRecords,
                TTL: record.TTL,
              },
            },
          ],
        },
      },
      (error, del_data) => {
        if (error) return reject(error)
        resolve(del_data)
      },
    )
  })
}

const getService = () => {
  return `
[Unit]
Description=ddns-route53
Documentation=https://crazymax.dev/ddns-route53/
After=syslog.target
After=network.target

[Service]
RestartSec=2s
Type=simple
User=root
ExecStart=/app/ddns-route53/ddns-route53 --config /app/ddns-route53/ddns-route53.yml
Restart=always
Environment=SCHEDULE="*/30 * * * *"

[Install]
WantedBy=multi-user.target`
}

const getDDNSConfig = (domain) => {
  return `
credentials:
  accessKeyID: "${process.env.EC2_ACCESS_KEY_ID}"
  secretAccessKey: "${process.env.EC2_SECRET_ACCESS_KEY}"

route53:
  hostedZoneID: "${process.env.HOSTED_ZONE_ID}"
  recordsSet:
    - name: "${domain}."
      type: "A"
      ttl: 60`
}

// Node is available in UserData, tested on a deployment
const getUserData = (domain) => {
  const data = {
    HOSTED_ZONE_ID: process.env.HOSTED_ZONE_ID,
    DOMAIN: domain,
    BUCKET: process.env.RELAY_BUCKET,
    AWS_ACCESS_KEY_ID: process.env.EC2_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.EC2_SECRET_ACCESS_KEY,
    REGION: 'us-east-1',
  }
  return `#!/bin/bash
mkdir /app
echo '${JSON.stringify(data, null, 2)}' > /app/config.json
apt install unzip > /app/unzipinstall
npm install -g aws-sdk @aws-sdk/client-s3 pm2 > /app/npminstall
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /app > /app/pm2startup
wget -O /app/install-relay.js https://broadcasting-system-files.s3.amazonaws.com/install-relay.js > /app/installer
cd /app
node install-relay.js > /app/installrelay.log
unzip /app/relay.zip
yarn > /app/yarnlog
PM2_HOME='/app/.pm2' pm2 start yarn --name "Relay Server" -- start:prod > /app/pm2start
PM2_HOME='/app/.pm2' pm2 save
mkdir /app/ddns-route53
echo '${getDDNSConfig(domain)}' > /app/ddns-route53/ddns-route53.yml
cd /app/ddns-route53 && wget -qO- https://github.com/crazy-max/ddns-route53/releases/download/v2.8.0/ddns-route53_2.8.0_linux_amd64.tar.gz | tar -zxvf - ddns-route53
echo '${getService()}' > /etc/systemd/system/ddns-route53.service
systemctl enable ddns-route53
systemctl start ddns-route53
`
}

module.exports.deployEC2Instance = async (sid) => {
  await r53
    .changeResourceRecordSets({
      HostedZoneId: process.env.HOSTED_ZONE_ID,
      ChangeBatch: {
        Changes: [
          {
            Action: 'UPSERT',
            ResourceRecordSet: {
              Name: `${sid}.nylund.us`,
              Type: 'A',
              ResourceRecords: [{ Value: '127.0.0.1' }],
              TTL: 60,
            },
          },
        ],
      },
    })
    .promise()

  console.log('Route53 updated')

  const data = Buffer.from(getUserData(`${sid}.nylund.us`)).toString('base64')

  const result = await ec2
    .runInstances({
      LaunchTemplate: {
        LaunchTemplateId: process.env.LAUNCH_TEMPLATE_ID,
        Version: process.env.LAUNCH_TEMPLATE_VERSION,
      },
      InstanceType: 't3.small',
      MinCount: 1,
      MaxCount: 1,
      UserData: data,
    })
    .promise()

  console.log(`EC2 Instance started ${result.Instances[0].InstanceId}`)

  return result
}
