import request from 'supertest'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { createApp } from '../src/app.js'
import { connectDb } from '../src/config/db.js'
import { FoodItem } from '../src/models/FoodItem.js'

async function run() {
  process.env.USE_FAKE_CLOUDINARY = 'true'
  process.env.ADMIN_API_KEY = 'test-admin-key'

  const mongod = await MongoMemoryServer.create()
  const uri = mongod.getUri()

  const conn = await connectDb(uri)

  // Seed a couple of foods
  await FoodItem.create([
    {
      clientId: 'veg-biryani',
      name: 'Veg Biryani',
      description: 'Fragrant basmati rice with veggies.',
      isVeg: true,
      price: 129,
      imageUrl: '',
    },
    {
      clientId: 'chicken-biryani',
      name: 'Chicken Biryani',
      description: 'Classic spiced chicken biryani.',
      isVeg: false,
      price: 199,
      imageUrl: '',
    },
  ])

  const app = createApp()

  // /health
  const health = await request(app).get('/health')
  if (health.status !== 200 || health.body?.ok !== true) {
    throw new Error(`/health failed: ${health.status} ${JSON.stringify(health.body)}`)
  }

  // GET /api/foods
  const foods = await request(app).get('/api/foods')
  if (foods.status !== 200 || !Array.isArray(foods.body) || foods.body.length < 2) {
    throw new Error(`/api/foods failed: ${foods.status} ${JSON.stringify(foods.body)}`)
  }

  // POST /api/admin/foods
  const adminCreate = await request(app)
    .post('/api/admin/foods')
    .set('x-admin-key', 'test-admin-key')
    .field('name', 'Admin Added Item')
    .field('description', 'Created via admin route')
    .field('isVeg', 'true')
    .field('price', '49')
    .attach('image', Buffer.from('fake-image-bytes'), 'food.png')

  if (adminCreate.status !== 201 || adminCreate.body?.id !== 'admin-added-item') {
    throw new Error(`/api/admin/foods POST failed: ${adminCreate.status} ${JSON.stringify(adminCreate.body)}`)
  }

  const foodsAfterAdmin = await request(app).get('/api/foods')
  if (
    foodsAfterAdmin.status !== 200 ||
    !Array.isArray(foodsAfterAdmin.body) ||
    !foodsAfterAdmin.body.some((f) => f.id === 'admin-added-item')
  ) {
    throw new Error(`/api/foods after admin create failed: ${foodsAfterAdmin.status} ${JSON.stringify(foodsAfterAdmin.body)}`)
  }

  // GET /api/orders
  const orders0 = await request(app).get('/api/orders')
  if (orders0.status !== 200 || !Array.isArray(orders0.body)) {
    throw new Error(`/api/orders GET failed: ${orders0.status} ${JSON.stringify(orders0.body)}`)
  }

  // POST /api/orders
  const items = [
    { id: 'veg-biryani', name: 'Veg Biryani', price: 129, quantity: 2 },
    { id: 'chicken-biryani', name: 'Chicken Biryani', price: 199, quantity: 1 },
  ]
  const subtotal = 129 * 2 + 199 * 1
  const totalItems = 3

  const post = await request(app)
    .post('/api/orders')
    .field('teamName', 'CB Warriors')
    .field('leaderName', 'Leader Name')
    .field('phone', '9876543210')
    .field('email', 'leader@college.edu')
    .field('transactionId', 'TXN123456')
    .field('items', JSON.stringify(items))
    .field('subtotal', String(subtotal))
    .field('totalItems', String(totalItems))
    .attach('paymentScreenshot', Buffer.from('fake-image-bytes'), 'payment.png')

  if (post.status !== 202 || !post.body?.id) {
    throw new Error(`/api/orders POST failed: ${post.status} ${JSON.stringify(post.body)}`)
  }

  // GET /api/orders should include the new order
  const orders1 = await request(app).get('/api/orders')
  if (orders1.status !== 200 || !Array.isArray(orders1.body) || orders1.body.length < 1) {
    throw new Error(`/api/orders GET after POST failed: ${orders1.status} ${JSON.stringify(orders1.body)}`)
  }

  const created = orders1.body.find((o) => String(o.id) === String(post.body.id))
  if (!created) {
    throw new Error(`/api/orders GET did not include created order: ${JSON.stringify({ createdId: post.body.id, ordersCount: orders1.body.length })}`)
  }

  const st = String(created?.payment?.uploadStatus || '')
  if (st && !['pending', 'uploaded', 'failed'].includes(st)) {
    throw new Error(`/api/orders GET unexpected uploadStatus: ${JSON.stringify(created?.payment)}`)
  }

  if (st === 'uploaded' && !created?.payment?.screenshotUrl) {
    throw new Error(`/api/orders GET uploaded but missing screenshotUrl: ${JSON.stringify(created?.payment)}`)
  }

  console.log('OK: /health')
  console.log('OK: GET /api/foods')
  console.log('OK: POST /api/admin/foods (multipart + auth + fake cloudinary)')
  console.log('OK: GET /api/orders')
  console.log('OK: POST /api/orders (multipart + fake cloudinary)')

  await conn.close()
  await mongod.stop()
}

run().catch((err) => {
  console.error('Smoke check FAILED')
  console.error(err)
  process.exit(1)
})
