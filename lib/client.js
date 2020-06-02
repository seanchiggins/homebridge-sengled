const axios = require('axios');
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
axiosCookieJarSupport(axios);
//const cookieJar = new tough.CookieJar( rejectPublicSuffixes = false, looseMode = true);
const cookieJar = new tough.CookieJar();

var Mutex = require('async-mutex').Mutex;
var Semaphore = require('async-mutex').Semaphore;
var withTimeout = require('async-mutex').withTimeout;

let moment = require('moment');
const https = require('https');
const mutex_getDevices = new Mutex();
const mutex_login = new Mutex();

function _ArrayFlatMap(array, selector) {
    if (array.length == 0) {
      return [];
    } else if (array.length == 1) {
      return selector(array[0]);
    }
    return array.reduce((prev, next) =>
    (/*first*/ selector(prev) || /*all after first*/ prev).concat(selector(next)))
}

function _guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
    s4() + '-' + s4() + s4() + s4();
}

module.exports = class ElementHomeClient {

  constructor(log, debug) {

    this.client = axios.create({
      baseURL: 'https://us-elements.cloud.sengled.com:443/zigbee/',
      timeout: 2000,
      jar: cookieJar,
      withCredentials: true,
      responseType: 'json'
    });
    this.client.defaults.headers.post['Content-Type'] = 'application/json';
    this.log = log;
    this.debug = debug;
    this.log( "construtor: Starting Sengled.");
    this.lastLogin = moment('2000-01-01');
    this.uuid = _guid();

    this.cache = new Array();
    this.lastCache = moment( '2000-01-01');
  }

  async login( username, password) {

    //var debug = true;
    var debug = this.debug;
    if (debug) this.log( "login: Started");
    const release_login = await mutex_login.acquire();
    if (debug) this.log( "login: Received Mutex");
    return new Promise((fulfill, reject) => {
	    let me = this;
	    if (debug) this.log( "login: Session ID: " + this.jsessionid);
	    //this.log( "login: " + this.loginResponse);
      if (this.jsessionid != null) {
        if (debug) this.log("login: Cookie found, skipping login request.");
        release_login();
        fulfill(this.loginResponse);
      } else {
        if (debug) this.log( "login: Processing Login");
        this.client.post('/customer/remoteLogin.json',
        {
          'uuid':this.uuid,
          'isRemote':true,
          'user': username,
          'pwd': password,
          'os_type': 'ios'
        }).then((response) => {
          this.jsessionid = response.data.jsessionid;
          this.lastLogin = moment();
          this.loginResponse = response;
          release_login();
          fulfill(response);
        }).catch(function (error) {
          me.log( "login: Error: " + error);
          release_login();
          reject(error);
        });
      }
    });
  }

  async getDevices() {
    let me = this;
    if (me.debug) me.log( "getDevices: Started");
//
// Example Device from within Device Details
//  {
//    deviceUuid: 'B0CE1814000219E2',
//    deviceClass: 1,
//    supportAttributes: '0,1,2,3,4,12,13',
//    attributes: {
//      deviceRssi: '5',
//      rgbColorR: '61',
//      activeTime: '2020-05-14 13:48:33',
//      colorMode: '2',
//      rgbColorG: '87',
//      isOnline: '1',
//      version: '71',
//      typeCode: 'E11-N1EA',
//      colorTemperature: '24',
//      productCode: 'E11-N1EA',
//      brightness: '160',
//      rgbColorB: '255',
//      name: 'Office Bulb 2',
//      onCount: '6',
//      onoff: '1'
//    }
//  },
//
// For getDevices, only let one request run at a time and let all other requests use the cache. To do this, a mutex
// is implemented to only allow one "getDeviceInfos" run at a time. It makes everybody run better overall.
//
    if (me.debug) me.log( "getDevices: Getting Mutex");
    const release_getDevices = await mutex_getDevices.acquire();
    if (me.debug) me.log( "getDevices: Got Mutex");
    if (moment() - me.lastCache <= 10000) {
      if (me.debug) me.log( "getDevices: ### Using Cache after wait");
      release_getDevices();
      //me.log( "Cache: %o", me.cache);
      return( me.cache);
    } else {
      return new Promise((fulfill, reject) => {
        this.client.post('/device/getDeviceDetails.json', {})
        .then((response) => {
          if (response.data.ret == 100) {
            release_getDevices();
            reject(response.data);
          } else {
            //this.log( "Get Device Response: %o", response.data);
            //this.log( "Device Info: %o", response.data.deviceInfos[ 0]);
      
            let deviceInfos = response.data.deviceInfos;
            let deviceInfos0 = deviceInfos[ 0];
            let deviceList = deviceInfos0.lampInfos;
            //this.log( "Get Devices: %o", deviceList);
            let devices = deviceList.map((device) => {
              var newDevice = {
                id: device.deviceUuid,
                name: device.attributes.name,
                status: device.attributes.onoff,
                isOnline: device.attributes.isOnline,
                signalQuality: device.signalQuality,
                brightness: device.attributes.brightness,
                colortemperature: device.attributes.colorTemperature,
                rgbColorR: device.attributes.rgbColorR,
                rgbColorG: device.attributes.rgbColorG,
                rgbColorB: device.attributes.rgbColorB,
                productCode: device.attributes.productCode
              };
              return newDevice;
            });
            release_getDevices();
            //me.log( "Pulled devices: %o", devices);
            me.cache = devices;
            me.lastCache = moment();
            fulfill(devices);
          }
        }).catch(function (error) {
          release_getDevices();
          me.log( "getDevices: Failed: " + error);
          reject(error);
        });
      });
    }
  }

  userInfo() {
    return new Promise((fulfill, reject) => {
      this.client.post('/customer/getUserInfo.json', {})
      .then((response) => {
        if (response.data.ret == 100) {
          reject(response.data);
        } else {
          fulfill(response);
        }
      }).catch(function (error) {
        reject(error);
      });
    });
  }

  deviceSetOnOff(deviceId, onoff) {
    let me = this;
    return new Promise((fulfill, reject) => {
      this.client.post('/device/deviceSetOnOff.json', {"onoff": onoff ? 1 : 0,"deviceUuid": deviceId})
      .then((response) => {
        if (response.data.ret == 100) {
          reject(response.data);
        } else {
          fulfill(response);
        }
      }).catch(function (error) {
        me.log( "deviceSetOnOff: Error: " + error);
        reject(error);
      });
    });
  }

  deviceSetColor( deviceId, color) {
    var params = {
      "cmdId" : 129,
      "deviceUuidList" : [ deviceId],
      "rgbColorR" : color[ 0],
      "rgbColorG" : color[ 1],
      "rgbColorB" : color[ 2],
    }
    return new Promise((fulfill, reject) => {
      this.client.post('/device/deviceSetGroup.json', params)
      .then((response) => {
        //this.log( "deviceSetColor: %o", response);
        if (response.data.ret == 100) {
          reject(response.data);
        } else {
          fulfill(response);
        }
      }).catch(function (error) {
        this.log( "deviceSetColor: Error: " + error);
        reject(error);
      });
    });
  }

  deviceSetBrightness(deviceId, brightnessValue) {
    return new Promise((fulfill, reject) => {
      this.client.post('/device/deviceSetBrightness.json', {"brightness": brightnessValue * 2.55,"deviceUuid": deviceId})
      .then((response) => {
        if (response.data.ret == 100) {
          reject(response.data);
        } else {
          fulfill(response);
        }
      }).catch(function (error) {
        this.log( "deviceSetBrightness: Error: " + error);
        reject(error);
      });
    });
  }
	
  deviceSetColorTemperature(deviceId, colorTemperature) {
		let me = this;
		if (me.debug) me.log("deviceSetColorTemperature: invoked " + deviceId + " with color temperature to " + colorTemperature);
		return new Promise((fulfill, reject) => {
			this.client
			.post('/device/deviceSetColorTemperature.json', {
				colorTemperature: colorTemperature,
				deviceUuid: deviceId
			})
			.then(response => {
				if (response.data.ret == 100) {
					reject(response.data);
				} else {
					fulfill(response);
				}
			})
				.catch(function(error) {
          me.log( "deviceSetColorTemperature: Error: " + error);
					reject(error);
				});
		});
	}
};
