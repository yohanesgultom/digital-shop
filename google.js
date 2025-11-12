const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'service-account.json'),
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
    ],
});

// create clients
const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: "v4", auth });

// Now you can use the 'drive' object to interact with the Google Drive API
async function listFiles(folderId) {
    try {
        const res = await drive.files.list({
            pageSize: 10,
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'nextPageToken, files(id, name)',
        });
        const files = res.data.files;
        if (files.length) {
            return files.map(file => ({ id: file.id, name: file.name }));
        }
    } catch (err) {
        console.error('The API returned an error: ' + err);
    }
    return [];
}

async function downloadFile(fileId, filePath) {
    const response = await drive.files.get(
        {fileId: fileId, alt: 'media'},
        {responseType: 'stream'}
    );

    return new Promise((resolve, reject) => {
        const dest = fs.createWriteStream(filePath);
        response.data
            .on('end', () => {
                resolve(filePath);
            })
            .on('error', err => {
                console.error('Error downloading file:', err);
                reject(err);
            })
            .pipe(dest);
    });
}

async function appendRows(spreadsheetId, range, values, valueInputOption = "RAW") {
    return sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption,
        requestBody: { values },
    });
}

async function readRows(spreadsheetId, range) {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
    });
    return res.data.values;
}

async function updateCells(spreadsheetId, range, values, valueInputOption = 'USER_ENTERED') {
    const res = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption,
        resource: {values},
    });
    return res;
}

// listFiles('1hIybghWyA9FixTG7bAqvt1ieyzQlkk6j').then(console.log);
// downloadFile('1HA3JsJ7jtZT7lPe2Bock7_x-ejo-ZG7h', 'godzilla.jpg');

module.exports = {
    listFiles,
    downloadFile,
    appendRows,
    readRows,
    updateCells,
};