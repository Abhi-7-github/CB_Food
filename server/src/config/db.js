import mongoose from 'mongoose'

export async function connectDb(mongoUri) {
  if (!mongoUri) throw new Error('MONGODB_URI is required')

  mongoose.set('strictQuery', true)

  mongoose.connection.on('connected', () => {
    // eslint-disable-next-line no-console
    console.log('[db] connected')
  })
  mongoose.connection.on('disconnected', () => {
    // eslint-disable-next-line no-console
    console.warn('[db] disconnected')
  })
  mongoose.connection.on('reconnected', () => {
    // eslint-disable-next-line no-console
    console.log('[db] reconnected')
  })
  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] error', err)
  })

  await mongoose.connect(mongoUri, {
    autoIndex: true,
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10_000),
    connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10_000),
  })

  return mongoose.connection
}
