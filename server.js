const path = require('path');
const fs = require('fs');
const { pipeline } = require('node:stream/promises')

const { loadPreviewImagesJob, sendOriginalPhotosJob } = require('./jobs');
const google = require('./google');

const fastify = require('fastify')({ logger: true });
const { fastifySchedule } = require('@fastify/schedule');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEFAULT_PRICE = parseInt(process.env.DEFAULT_PRICE) || 20000;
const ORDER_SPREADSHEET_ID = process.env.ORDER_SPREADSHEET_ID || '1SygsYdY-LXsqSySN5gZwJAUnKndnoHGw0mQIGCW2Nh0';
const RECEIPT_PATH = 'receipts';
const RECEIPT_DIR = path.join('public', RECEIPT_PATH);

// Register static file serving
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/' // serve files from root path
});

// Multipart support for file uploads
fastify.register(require('@fastify/multipart'));

fastify.register(fastifySchedule);
fastify.ready().then(() => {
  fastify.scheduler.addSimpleIntervalJob(loadPreviewImagesJob);
  fastify.scheduler.addSimpleIntervalJob(sendOriginalPhotosJob);
});

// Redirect root to index.html
fastify.get('/', (request, reply) => {
  reply.sendFile('index.html');
});

// Read files from public/products
fastify.get('/api/products', (_, reply) => {
  const productsDir = path.join(__dirname, 'public', 'products');
  fs.readdir(productsDir, (err, files) => {
    if (err) {
      fastify.log.error(err);
      reply.status(500).send({ error: 'Failed to read products' });
    }

    reply.send(files
      .filter(file => ['.jpg', '.png'].includes(path.extname(file).toLocaleLowerCase()))
      .map(file => {
        return {
            id: file,
            name: path.parse(file).name,
            price: DEFAULT_PRICE,
            desc: file,
            img: `/products/${file}`,
        };
    }));
  });
});

fastify.post('/api/order', async (request, reply) => {
  const data = await request.file();
  const fields = data.fields;
  const body = {
    email: fields?.email?.value,
    items: fields?.items?.value,
  }
  if (!body.email || !body.items || !data?.filename) {
    reply.status(400);
    return { error: 'Invalid payload' };
  } else {
    // upload receipt
    const prefix = new Date().toISOString().replaceAll(/[^\d]/g, '');
    const filename = prefix + '_' + data.filename;
    const uploadPath = path.join(RECEIPT_DIR, filename);
    await pipeline(data.file, fs.createWriteStream(uploadPath));
    // update sheet
    const receipt = `${BASE_URL}/${RECEIPT_PATH}/${filename}`;
    const status = 'NEW';
    const values = [[
      new Date().toLocaleString('en-US', {timeZone: 'Asia/Jakarta'}),
      body.email,
      body.items,
      body.items.split(',').reduce((s)=>s + DEFAULT_PRICE, 0),
      receipt,
      status,
    ]];
    const res = await google.appendRows(ORDER_SPREADSHEET_ID, 'orders!A2', values);
    return {
      success: true,
      response: res
    }
  }
});

// Run the server
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server running at http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();