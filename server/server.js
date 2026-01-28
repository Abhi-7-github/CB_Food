import dotenv from 'dotenv'

process.on('unhandledRejection', (err) => {
	// eslint-disable-next-line no-console
	console.error('PROMISE:', err)
})

process.on('uncaughtException', (err) => {
	// eslint-disable-next-line no-console
	console.error('CRASH:', err)
	// Don't keep running in an unknown state; let Render restart.
	process.exit(1)
})

import { connectDb } from './src/config/db.js'
import { configureCloudinary } from './src/config/cloudinary.js'
import { createApp } from './src/app.js'

dotenv.config()

const app = createApp()

const port = Number(process.env.PORT || 5000)

async function start() {
	await connectDb(process.env.MONGODB_URI)
	configureCloudinary()

	app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`Server running on http://localhost:${port}`)
	})
}

start().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err)
	process.exit(1)
})
