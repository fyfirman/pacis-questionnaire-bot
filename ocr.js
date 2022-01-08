const fs = require("fs");
const createReadStream = require('fs').createReadStream;
const sleep = require('util').promisify(setTimeout);
const ComputerVisionClient = require('@azure/cognitiveservices-computervision').ComputerVisionClient;
const ApiKeyCredentials = require('@azure/ms-rest-js').ApiKeyCredentials;

require("dotenv").config();

// Status strings returned from Read API
const STATUS_SUCCEEDED = "succeeded";

// Authentication requirements
const key = process.env.AZURE_COMPUTER_VISION_KEY;
const endpoint = process.env.AZURE_COMPUTER_VISION_ENDPOINT;

// Check if computer vision credentials are available
const isConfigured = () => {
  const result = (key && endpoint && (key.length > 0) && (endpoint.length > 0)) ? true : false;
  return result;
}

// Analyze image from captcha
const captchaOCR = async () => {
  // Authenticate to Azure service
  const computerVisionClient = new ComputerVisionClient(
    new ApiKeyCredentials({ inHeader: { "Ocp-Apim-Subscription-Key": key } }),
    endpoint
  );

  // Scanned text from saved captcha image
  const captchaResult = await readTextFromFile(computerVisionClient, "./a.jpeg");
  fs.unlink('./a.jpeg', (err) => {
    if (err) {
      console.error(err);
      return;
    }  
  });
  return recText(captchaResult);
};

// Perform read and await the result from local file
async function readTextFromFile(client, localImagePath) {
  // To recognize text in a local image, replace client.read() with readTextInStream() as shown:
  let result = await client.readInStream(() => createReadStream(localImagePath));
  // Operation ID is last path segment of operationLocation (a URL)
  let operation = result.operationLocation.split('/').slice(-1)[0];

  // Wait for read recognition to complete
  // result.status is initially undefined, since it's the result of read
  while (result.status !== STATUS_SUCCEEDED) { await sleep(500); result = await client.getReadResult(operation); }
  
  // Return the first page of result. Replace [0] with the desired page if this is a multi-page file such as .pdf or .tiff.
  return result.analyzeResult.readResults;
}

// Concatenate received text
function recText(readResults) {
  let text = '';
  const result = readResults[0];
  if (result.lines.length) {
    for (const line of result.lines) {
      text = line.words.map(w => w.text).join(' ').toLowerCase();
    }
  }
  return text;
}

exports.isConfigured = isConfigured;
exports.captchaOCR = captchaOCR;