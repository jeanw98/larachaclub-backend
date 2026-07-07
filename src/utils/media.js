const { signKeys } = require('../services/s3');

async function withSignedMedia(rows, urlField = 'image_url', keyField = 's3_key') {
  const urlMap = await signKeys(rows.map((r) => r[keyField]));
  return rows.map((row) => ({
    ...row,
    [urlField]: urlMap[row[keyField]] || null,
  }));
}

module.exports = { withSignedMedia };
