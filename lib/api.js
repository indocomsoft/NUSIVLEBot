// 3rd party libraries
const dotenv = require('dotenv');
const rp = require('request-promise');

dotenv.load();

// My own libraries

// Constants
const { API_KEY } = process.env;

class api {
  constructor(token) {
    this.token = token;
  }
  static do(action, params = {}) {
    const finalParam = api.encodeDataToURL(Object.assign({}, { API_KEY }, params));
    return rp.get(`${action}${finalParam}`);
  }
  static encodeDataToURL(data) {
    return Object.keys(data).map(key => [key, data[key]].map(encodeURIComponent).join('='))
      .join('&');
  }
}

module.exports = api;
