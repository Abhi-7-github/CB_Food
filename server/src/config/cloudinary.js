import { v2 as cloudinary } from 'cloudinary'
import { Writable } from 'node:stream'

function createFakeCloudinary() {
  return {
    uploader: {
      upload: async () => ({
        secure_url: 'https://example.com/fake-payment-screenshot.png',
        public_id: 'fake/payment-screenshot',
      }),
      upload_stream: (_options, callback) => {
        // Mimic Cloudinary's upload_stream API.
        // Returns a writable stream; when ended, invokes callback(null, result).
        const stream = new Writable({
          write(_chunk, _enc, cb) {
            cb()
          },
        })

        // callback after stream finishes
        stream.on('finish', () => {
          callback(null, {
            secure_url: 'https://example.com/fake-payment-screenshot.png',
            public_id: 'fake/payment-screenshot',
          })
        })

        return stream
      },
    },
  }
}

export function getCloudinary() {
  if (process.env.USE_FAKE_CLOUDINARY === 'true') return createFakeCloudinary()
  return cloudinary
}

export function configureCloudinary() {
  if (process.env.USE_FAKE_CLOUDINARY === 'true') {
    return getCloudinary()
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary env vars are required (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)')
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })

  return cloudinary
}

export { cloudinary }
