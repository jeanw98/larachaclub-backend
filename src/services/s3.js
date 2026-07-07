const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

const client = new S3Client({
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
});

const SIGNED_URL_EXPIRY = 3600; // 1 hora

const EXT_MAP = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

function isImage(mime) {
  return mime?.startsWith('image/');
}

function isVideo(mime) {
  return mime?.startsWith('video/');
}

async function signKey(key) {
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
  }), { expiresIn: SIGNED_URL_EXPIRY });
}

async function signKeys(keys) {
  const unique = [...new Set(keys.filter(Boolean))];
  const entries = await Promise.all(unique.map(async (key) => [key, await signKey(key)]));
  return Object.fromEntries(entries);
}

async function uploadMedia(file, userId) {
  const ext = file.originalname?.match(/\.[a-zA-Z0-9]+$/)?.[0]
    || EXT_MAP[file.mimetype]
    || (isVideo(file.mimetype) ? '.mp4' : '.jpg');
  const folder = isVideo(file.mimetype) ? 'videos' : 'pins';
  const key = `${folder}/${userId}/${uuidv4()}${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  const signed_url = await signKey(key);

  return {
    s3_key: key,
    signed_url,
    mime_type: file.mimetype,
    media_type: isVideo(file.mimetype) ? 'video' : 'image',
    file_size: file.size,
  };
}

module.exports = {
  uploadMedia,
  signKey,
  signKeys,
  isImage,
  isVideo,
  SIGNED_URL_EXPIRY,
};
