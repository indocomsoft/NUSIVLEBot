// 3rd party libraries
const dotenv = require('dotenv');
const rp = require('request-promise');

dotenv.load();

// My own libraries

// Constants
const BASE_URL = 'https://ivle.nus.edu.sg/api/Lapi.svc/';

class api {
  constructor(APIKey) {
    this.params = { APIKey, AuthToken: '' };
  }
  validateToken(token) {
    return this.do('Validate', { Token: token }).then((r) => {
      //console.log(r);
      if (r.Success === true) {
        this.params.AuthToken = r.Token;
        return new Promise((resolve) => { resolve(r); });
      }
      return new Promise((resolve, reject) => { reject(r); });
    });
  }
  do(action, params = {}) {
    const finalParam = api.encodeDataToURL(Object.assign({}, this.params, params));
    // Skip if course is not set up on IVLE
    if (params.CourseId === '00000000-0000-0000-0000-000000000000') {
      return new Promise((resolve) => { resolve({ Results: [] }); });
    }
    //console.log(`${BASE_URL}${action}?${finalParam}`);
    return rp.get({ url: `${BASE_URL}${action}?${finalParam}`, json: true });
  }
  static encodeDataToURL(data) {
    return Object.keys(data).map(key => [key, data[key]].map(encodeURIComponent).join('='))
      .join('&');
  }
}

module.exports = api;
