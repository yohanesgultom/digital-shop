const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { SimpleIntervalJob, AsyncTask } = require('toad-scheduler');
const nodemailer = require("nodemailer");
const google = require('./google');

const PREVIEW_FOLDER_ID = process.env.PREVIEW_FOLDER_ID || '1hIybghWyA9FixTG7bAqvt1ieyzQlkk6j';
const ORIGINAL_FOLDER_ID = process.env.ORIGINAL_FOLDER_ID || '1dk0wYkao0dLAujr7vP_scsKi9iC5ZyWG';
const DOWNLOAD_INTERVAL_SECONDS = parseInt(process.env.DOWNLOAD_INTERVAL_SECONDS) || 5;
const ORDER_SPREADSHEET_ID = process.env.ORDER_SPREADSHEET_ID || '1SygsYdY-LXsqSySN5gZwJAUnKndnoHGw0mQIGCW2Nh0';
const SEND_ORIGINAL_INTERVAL_SECONDS = parseInt(process.env.SEND_ORIGINAL_INTERVAL_SECONDS) || 5;
const SMTP_USER = process.env.SMTP_USER || 'shop@proentry.id';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.zoho.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_PORT && process.env.SMTP_PORT !== '25',
    auth: {
        user: SMTP_USER,
        pass: process.env.SMTP_PASSWORD || '',
    },
});

const getExistingPreviewImages = async (dir) => {
    return new Promise((resolve, reject) => {
        fs.readdir(dir, (err, files) => {
            if (err) {
                reject(err);
            }
            resolve(files);
        });
    });
}

const loadPreviewImages = async () => {
    const targetFolder = 'public/products';
    const existingFiles = await getExistingPreviewImages(targetFolder);
    console.log(`Loading preview images from ${PREVIEW_FOLDER_ID}...`)
    const files = await google.listFiles(PREVIEW_FOLDER_ID)
    const newFiles = files.filter(file => !existingFiles.includes(file.name));
    console.log(`Found ${newFiles.length} new files.`)
    await Promise.all(files.map(async (file) => {
        if (!existingFiles.includes(file.name)) {
            const filePath = path.join(targetFolder, file.name);
            console.log(`Downloading to ${filePath}...`);
            await google.downloadFile(file.id, filePath);
        }
    }));
    return true;
}

const loadPreviewImagesJob = new SimpleIntervalJob({ seconds: DOWNLOAD_INTERVAL_SECONDS, }, new AsyncTask(
    'Load Preview Images Task',
    loadPreviewImages,
    console.error
));

const sendOriginalPhotos = async () => {
    const [originalFiles, orders] = await Promise.all([
        google.listFiles(ORIGINAL_FOLDER_ID),
        google.readRows(ORDER_SPREADSHEET_ID, 'orders'),
    ]);
    const fileMap = {};
    for (const ori of originalFiles) {
        fileMap[ori.name] = ori.id;
    }
    for (let i = 1; i <= orders.length; i++) {
        if (orders[i]) {
            const [orderTime, email, items, total, receipt, status, deliveryTime] = orders[i];
            if (status === 'PAID' && !deliveryTime) {
                console.log('Sending ' + items + ' to ' + email);
                const attachments = [];
                const fileNames = items.split(',');
                const promises = [];
                for (const fileName of fileNames) {
                    const fileId = fileMap[fileName];
                    console.log(`fileId of ${fileName} is ${fileId}`);
                    const tempPath = path.join('temp', fileName);
                    try {
                        await fsPromises.access(tempPath, fsPromises.constants.F_OK);
                    } catch (e) {
                        promises.push(google.downloadFile(fileId, tempPath));
                    }
                    attachments.push({path: tempPath});
                }
                await Promise.all(promises);
                
                const rowId = i + 1;
                const timestamp = new Date().toLocaleString('en-US', {timeZone: 'Asia/Jakarta'});
                const info = await transporter.sendMail({
                    from: SMTP_USER,
                    to: email,
                    subject: "[Digital Shop] Thank you for your purchase",
                    text: "Please get your order(s) in attachment",
                    html: "Please get your order(s) in attachment",
                    attachments
                });
                await google.updateCells(ORDER_SPREADSHEET_ID, 'orders!F' + rowId, [['DELIVERED', timestamp]]);
                console.log('Original photos ' + items + ' have been sent to ' + email);
            }
        }
    }
}

const sendOriginalPhotosJob = new SimpleIntervalJob({ seconds: SEND_ORIGINAL_INTERVAL_SECONDS, }, new AsyncTask(
    'Send Original Photos Task',
    sendOriginalPhotos,
    console.error
));

module.exports = {
    loadPreviewImagesJob,
    sendOriginalPhotosJob,
}