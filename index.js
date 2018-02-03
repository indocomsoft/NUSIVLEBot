// 3rd party libraries
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

// My own libraries
const api = require('./lib/api');

// Constants
const MONGODB_SERVER = 'mongodb://localhost:27017';
const DB_NAME = 'NUSIVLEBot';

MongoClient.connect(MONGODB_SERVER, (err, client) => {
  assert.equal(null, err);
  console.log('Connected successfully to server');
  const db = client.db(DB_NAME);
  client.close();
});
