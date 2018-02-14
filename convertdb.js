// 3rd party libraries
const { MongoClient } = require('mongodb');

// Constants
const MONGODB_SERVER = 'mongodb://localhost:27017';
const DB_NAME = 'NUSIVLEBot';
let db;
let chatId;

MongoClient.connect(MONGODB_SERVER).then((client) => {
  console.log('Connected successfully to server');
  db = client.db(DB_NAME);
  chatId = db.collection('chatId');
}).then(() => {
  chatId.find({}).toArray().then((r) => {

  });
}).catch(() => {
  console.error('Failed to connect to server');
});
