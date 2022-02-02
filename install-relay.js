/*

  -- Relay Installation Script --

  This script lies inside a public S3 bucket so that any EC2 instance
  can access it and run it. However, EC2 Instances come pre-loaded with
  the configuration required to actually download the relay.

*/
const config = require('./config.json')

const {
  S3Client,
  GetObjectCommand,
  ListObjectsCommand,
} = require('/usr/lib/node_modules/@aws-sdk/client-s3')
const client = new S3Client({
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
  region: config.REGION,
})

async function getObject(Bucket, Key) {
  const response = await client.send(
    new GetObjectCommand({
      Key,
      Bucket,
    }),
  )
  const stream = response.Body

  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.once('end', () => resolve(Buffer.concat(chunks)))
    stream.once('error', reject)
  })
}

const fs = require('fs')

async function getLatest(Bucket) {
  const response = await client.send(
    new ListObjectsCommand({
      Bucket,
    }),
  )

  if (!response.Contents || response.Contents.length === 0) return null

  let latest = response.Contents[0]
  for (let i = 1; i < response.Contents.length; i++) {
    if (
      response.Contents[i].LastModified >= latest.LastModified &&
      response.Contents[i].Key.startsWith('relay-') &&
      response.Contents[i].Key.endsWith('.zip')
    ) {
      latest = val
    }
  }

  return latest
}

getLatest(config.BUCKET)
  .then((val) => {
    getObject(config.BUCKET, val.Key)
      .then((data) => {
        fs.writeFileSync('/app/relay.zip', data)
      })
      .catch((err) => {
        console.log('Failed to download object. ', err)
      })
  })
  .catch((err) => {
    console.log('Failed to get latest zip. ', err)
  })
