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
const ATTACHMENT_LIMIT = parseInt(process.env.ATTACHMENT_LIMIT) || 25000000;

const EMAIL_SUBJECT = "[Digital Shop] Thank you for your purchase";
const EMAIL_BODY_TEXT = "Please get your order(s) in attachment";
const EMAIL_BODY_HTML = "Please get your order(s) in attachment";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.zoho.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
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
    try {
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
    } catch (e) {
        console.error('Unable to load preview images', e);
    }
}

const loadPreviewImagesJob = new SimpleIntervalJob({ seconds: DOWNLOAD_INTERVAL_SECONDS, }, new AsyncTask(
    'Load Preview Images Task',
    loadPreviewImages,
    console.error
), {preventOverrun: true});

/**
 * Splits attachments into groups where the total size of each group
 * does not exceed the maximum allowed size.
 *
 * @param {Array<string>} attachmentPaths - Array of file paths.
 * @param {int} attachmentLimit - Array of file paths.
 * @returns {Array<Array<Object>>} An array of attachment groups, where each group
 * is an array of Nodemailer attachment objects.
 */
const splitAttachments = async (attachmentPaths, attachmentLimit=10000000) => {
    let currentGroup = [];
    let currentSize = 0;
    const attachmentGroups = [];

    for (let i = 0; i < attachmentPaths.length; i++) {
        const filePath = attachmentPaths[i];
        const stat = await fsPromises.stat(filePath);
        const fileSize = stat.size;

        // Nodemailer attachment object structure
        const attachment = {
            filename: path.basename(filePath),
            path: filePath,
            // You can also use 'content' for inline content, but 'path' is best for large files
        };

        // If the current file size plus the current group size exceeds the limit
        if (currentSize + fileSize > attachmentLimit && currentGroup.length > 0) {
            // Start a new email/group with this file
            attachmentGroups.push(currentGroup);
            currentGroup = [attachment];
            currentSize = fileSize;
        } else {
            // Add to the current group
            currentGroup.push(attachment);
            currentSize += fileSize;
        }
    }

    // Push the final group if it's not empty
    if (currentGroup.length > 0) {
        attachmentGroups.push(currentGroup);
    }

    return attachmentGroups;
}

const sendOriginalPhotos = async () => {
    console.log('*** sendOriginalPhotos START***');
    // load files
    let originalFiles, orders;
    const fileMap = {};
    console.log('building fileMap...')
    try {
        [originalFiles, orders] = await Promise.all([
            google.listFiles(ORIGINAL_FOLDER_ID),
            google.readRows(ORDER_SPREADSHEET_ID, 'orders'),
        ]);
        for (const ori of originalFiles) {
            const oriName = ori.name.toUpperCase();
            fileMap[oriName] = ori.id;
        }
    } catch (e) {
        console.error('Unable to load files mapping');
    }

    // process orders
    for (let i = 1; i <= orders.length; i++) {
        if (orders[i]) {
            const rowId = i + 1;
            const timestamp = new Date().toLocaleString('en-US', {timeZone: 'Asia/Jakarta'});
            const [_orderTime, email, items, _total, _receipt, status, deliveryTime] = orders[i];
            try {
                if (status === 'PAID' && !deliveryTime) {
                    console.log('Sending ' + items + ' to ' + email);
                    
                    // download attachments
                    const attachments = [];
                    const fileNames = items.toUpperCase().split(',');
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
                        attachments.push(tempPath);
                    }
                    await Promise.all(promises);
                    
                    // split attachments
                    const attachmentGroups = await splitAttachments(attachments, ATTACHMENT_LIMIT);

                    // send email(s)
                    for (const partialAttachments of attachmentGroups) {
                        console.log(`sending email to ${email}`, partialAttachments);
                        await transporter.sendMail({
                            from: SMTP_USER,
                            to: email,
                            subject: EMAIL_SUBJECT,
                            text: EMAIL_BODY_TEXT,
                            html: EMAIL_BODY_HTML,
                            attachments: partialAttachments,
                        });
                    }
                    await google.updateCells(ORDER_SPREADSHEET_ID, 'orders!F' + rowId, [['DELIVERED', timestamp]]);
                    console.log('Original photos ' + items + ' have been sent to ' + email);
                }
            } catch (e) {
                console.error(`Unable to process order ${email}`, e);
                await google.updateCells(ORDER_SPREADSHEET_ID, 'orders!F' + rowId, [['FAILED', timestamp]]);
            }
        }
    }
    console.log('*** sendOriginalPhotos COMPLETED ***');
}

const sendOriginalPhotosJob = new SimpleIntervalJob({ seconds: SEND_ORIGINAL_INTERVAL_SECONDS, }, new AsyncTask(
    'Send Original Photos Task',
    sendOriginalPhotos,
    console.error
), {preventOverrun: true});

module.exports = {
    loadPreviewImages,
    sendOriginalPhotos,
    loadPreviewImagesJob,
    sendOriginalPhotosJob,
}