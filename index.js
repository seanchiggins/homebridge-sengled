"use strict";

let ElementHomeClient = require('./lib/client');
let Accessory, Service, Characteristic, UUIDGen;

var convert = require( 'color-convert');

const numberMap = (value, x1, y1, x2, y2) =>
	((value - x1) * (y2 - x2)) / (y1 - x1) + x2;

module.exports = function(homebridge) {
	Accessory = homebridge.platformAccessory;
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform("homebridge-sengled", "SengledHub", SengledHubPlatform);
};

function between01( value) {
  if (value > 1) {
    return (value - 1);
  } else if (value < 0) {
    return (value + 1);
  } else {
    return value;
  }
}

function SengledHubPlatform(log, config, api) {
	this.log = log;
	this.config = config;
	this.accessories = {};
	this.cache_timeout = 10; // seconds
	this.debug = config['debug'] || false;
	this.username = config['username'];
	this.password = config['password'];

	if (api) {
		this.api = api;
		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}

	this.client = new ElementHomeClient(log, this.debug);
}

SengledHubPlatform.prototype.configureAccessory = function(accessory) {
	let me = this;
	if (me.debug) me.log("configureAccessory: invoked " + accessory);

	let accessoryId = accessory.context.id;
	if (this.debug) me.log("configureAccessory: " + accessoryId + " name: " + accessory.context.name);

	// Handle rename case. Depending on which order the accessories come back in, we will want to handle them differently below
	if (this.accessories[accessoryId]) {
		if (this.debug) me.log("configureAccessory: Duplicate accessory detected, removing existing if possible, otherwise removing this accessory", accessoryId);
		try {
			this.removeAccessory(this.accessories[accessoryId], accessoryId);
			this.setService(accessory);
		} catch (error) {
			this.removeAccessory(accessory, accessoryId);
			accessory = this.accessories[accessoryId];
		}
	} else {
		this.setService(accessory);
	}

	this.accessories[accessoryId] = accessory;
};

SengledHubPlatform.prototype.didFinishLaunching = function() {
	let me = this;
	if (me.debug) me.log( "didFinishLaunching: invoked ");
	if (me.debug) me.log( "didFinishLaunching: " + me.accessories);

	this.deviceDiscovery();

	setInterval(me.deviceDiscovery.bind(me), this.cache_timeout * 6000);
};

SengledHubPlatform.prototype.deviceDiscovery = function() {
	let me = this;
	if (me.debug) me.log( "deviceDiscovery: invoked");

	this.client.login(this.username, this.password).then(() => {
		return this.client.getDevices();
	}).then(devices => {
		if (me.debug) me.log("deviceDiscovery: Adding discovered devices");
		for (let i in devices) {
			let existing = me.accessories[devices[i].id];

			if (!existing) {
				if (me.debug) me.log("deviceDiscovery: Adding device: ", devices[i].id, devices[i].name);
				me.addAccessory(devices[i]);
			} else {
				if (me.debug) me.log("deviceDiscovery: Skipping existing device " + devices[ i].name);
			}
		}

		// Check existing accessories exist in sengled devices
		if (devices) {
			for (let index in me.accessories) {
				var acc = me.accessories[index];
				me.getState(acc);
				var found = devices.find((device) => {
					return device.id.includes(index);
				});
				if (!found) {
					if (me.debut) me.log("deviceDiscovery: Previously configured accessory not found, removing", index);
					me.removeAccessory(me.accessories[index]);
				} else if (found.name != acc.context.name) {
					if (me.debut) me.log("deviceDiscovery: Accessory name does not match device name, got " + found.name + " expected " + acc.context.name);
					me.removeAccessory(me.accessories[index]);
					me.addAccessory(found);
					if (me.debut) me.log("deviceDiscovery: Accessory removed & readded!");
				}
			}
		}

		if (me.debug) me.log("deviceDiscovery: Discovery complete");
		// if (me.debug) me.log(me.accessories);
	}).catch( function( error) {
		me.log( "deviceDiscovery: Discovery error caught: " + error);
    if (error == "Error: timeout of 2000ms exceeded") {
      me.log( "deviceDiscovery: Timeout - Try again");
      me.deviceDiscovery();
    }
	});
};

SengledHubPlatform.prototype.addAccessory = function(data) {
	let me = this;
	if (me.debug) me.log("addAccessory: invoked: ");
	if (me.debug) me.log( "addAccessory: " + data);
	//me.log( ">> Characteristic: %o", Characteristic);

	if (!this.accessories[data.id]) {
		let uuid = UUIDGen.generate(data.id);
		// 5 == Accessory.Categories.LIGHTBULB
		// 8 == Accessory.Categories.SWITCH
		var newAccessory = new Accessory(data.id, uuid, 5);

		newAccessory.context.name = data.name;
		newAccessory.context.id = data.id;
		newAccessory.context.cb = null;
		newAccessory.context.brightness = data.brightness;
		newAccessory.context.colorTemperature = data.colortemperature;
		newAccessory.context.rgbColorR = data.rgbColorR;
		newAccessory.context.rgbColorG = data.rgbColorG;
		newAccessory.context.rgbColorB = data.rgbColorB;
		newAccessory.context.on = data.status;
		newAccessory.context.productCode = data.productCode;
    var hsv = convert.rgb.hsv( [ data.rgbColorR, data.rgbColorG, data.rgvColorB]);
		newAccessory.context.hue = hsv[ 0];
		newAccessory.context.saturation = hsv[ 1];
    newAccessory.context.lightness = hsv[ 2];

		newAccessory.addService(Service.Lightbulb, data.name);
		newAccessory
		.getService(Service.Lightbulb)
		.addCharacteristic(Characteristic.Brightness);

		if (data.productCode == "E11-N1EA") {
			newAccessory
			.getService(Service.Lightbulb)
			.addCharacteristic(Characteristic.ColorTemperature);
			newAccessory
			.getService(Service.Lightbulb)
			.addCharacteristic(Characteristic.Hue);
			newAccessory
			.getService(Service.Lightbulb)
			.addCharacteristic(Characteristic.Saturation);
		}

		this.setService(newAccessory);

		this.api.registerPlatformAccessories("homebridge-sengled", "SengledHub", [newAccessory]);
	} else {
		var newAccessory = this.accessories[data.id];
	}

	this.getInitState(newAccessory, data);

	this.accessories[data.id] = newAccessory;

	if (me.debug) me.log( "addAccesssory: Device Added: " + newAccessory.displayName);
};

/**
 * In some cases the accessory context is undefined, or the accessory is undefined. to keep the code dry, this
 * is the only method for removing an accessory from the homebridge platform and the plugin accessory context.
 *
 * When the id is already known, it should be passed as the second parameter to ensure both homebridge api and
 * local accessory context is cleaned up after a device rename/removal. There may be a case where the id needs
 * to be removed from local context, but is missing from the homebridge api, so I wrapped the
 * unregisterPlatformAccessories call in a try/catch to avoid crashing before removing from this.accessories
 *
 * If the accessoryId is not passed in, attempt to find the accessory id from the context. In the case where
 * the id is still not determined, attempt to remove the device from the homebridge api to avoid crashes.
 */
SengledHubPlatform.prototype.removeAccessory = function(accessory, accessoryId = undefined) {
  let me = this;
	if (accessory) {
		let id = accessoryId !== undefined ? accessoryId : (accessory.context === undefined ? undefined : accessory.context.id);
		if (this.debug) me.log("Removing accessory", id);

		try {
			this.api.unregisterPlatformAccessories("homebridge-sengled", "SengledHub", [accessory]);
		} catch (error) {
			// in case its already been deregistered, don't crash. remove from plugin's accessories context below
		}

		// Remove from local accessories context if id is defined
		if (id !== undefined) {
			delete this.accessories[id];
		}
	}
};

SengledHubPlatform.prototype.setService = function(accessory) {
	let me = this;
	if (me.debug) me.log("setService invoked: ");
	if (me.debug) me.log(accessory);

	var lightbulbService = accessory.getService(Service.Lightbulb);
	lightbulbService.getCharacteristic(Characteristic.On)
		.on('set', this.setPowerState.bind(this, accessory.context))
		.on('get', this.getPowerState.bind(this, accessory.context));
	lightbulbService.getCharacteristic(Characteristic.Brightness)
		.on('set', this.setBrightness.bind(this, accessory.context))
		.on('get', this.getBrightness.bind(this, accessory.context));
	if (accessory.context.productCode == "E11-N1EA") {
		lightbulbService.getCharacteristic(Characteristic.Hue)
		//lightbulbService.getCharacteristic(Characteristic.CurrentLightLevel)
			.on('set', this.setHue.bind(this, accessory.context))
			.on('get', this.getHue.bind(this, accessory.context));
		lightbulbService.getCharacteristic(Characteristic.ColorTemperature)
			.on('set', this.setColorTemperature.bind(this, accessory.context))
			.on('get', this.getColorTemperature.bind(this, accessory.context));
		lightbulbService.getCharacteristic(Characteristic.Saturation)
			.on('set', this.setSaturation.bind(this, accessory.context))
			.on('get', this.getSaturation.bind(this, accessory.context));
	}

	accessory.on('identify', this.identify.bind(this, accessory.context));
};

SengledHubPlatform.prototype.getInitState = function(accessory, data) {
	let me = this;
	if (me.debug) me.log("getInitState invoked: " + accessory.context.name + " " + data.name);

	let info = accessory.getService(Service.AccessoryInformation);

	accessory.context.manufacturer = "Sengled";
	info.setCharacteristic(Characteristic.Manufacturer, accessory.context.manufacturer);

	accessory.context.model = (data.productCode != null) ? data.productCode : "Sengled Hub";
	info.setCharacteristic(Characteristic.Model, accessory.context.model);

	info.setCharacteristic(Characteristic.SerialNumber, accessory.context.id);

	me.getState(accessory);
};

SengledHubPlatform.prototype.getState = function(accessory) {
	let me = this;
	if (me.debug) me.log("getState invoked: " + accessory.context.name);

	accessory.getService(Service.Lightbulb)
		.getCharacteristic(Characteristic.On)
		.getValue();
	accessory.getService(Service.Lightbulb)
		.getCharacteristic(Characteristic.Brightness)
		.getValue();
	if (accessory.context.productCode == "E11-N1EA") {
		accessory.getService(Service.Lightbulb)
			.getCharacteristic(Characteristic.ColorTemperature)
			.getValue();
	}
};

SengledHubPlatform.prototype.setPowerState = function(thisPlug, powerState, callback) {
	let me = this;
	if (this.debug) me.log("++++ Sending device: " + thisPlug.name + " status change to " + powerState);

	return this.client.login(this.username, this.password).then(() => {
		return this.client.deviceSetOnOff(thisPlug.id, powerState);
	}).then(() => {
		// thisPlug.status = device.status;
		// callback(null, device.status);
		callback();
	}).catch( function( error) {
		me.log("setPowerState: Error: " + error);
		callback( error);
	});
};

SengledHubPlatform.prototype.getPowerState = function(thisPlug, callback) {
	let me = this;
	if (this.debug) me.log("getPowerState: Getting device state: " + thisPlug.name + " status");
	if (this.accessories[thisPlug.id]) {
		return this.client.login(this.username, this.password).then(() => {
			return this.client.getDevices();
		}).then(devices => {
			return devices.find((device) => {
				return device.id.includes(thisPlug.id);
			});
		}).then((device) => {
			if (typeof device === 'undefined') {
				if (this.debug) me.log("getPowerState: Removing undefined device", thisPlug.name);
				this.removeAccessory(thisPlug)
			} else {
				if (this.debug) me.log("getPowerState: Complete: " + thisPlug.name + " is " + device.status);
				thisPlug.status = device.status;
				callback(null, device.status);
			}
		}).catch( function( error) {
			me.log( "getPowerState:  Failed Error: " + error);
			callback( error);
		});
	} else {
		callback(new Error("getPowerState: Device not found"));
	}
};

SengledHubPlatform.prototype.setBrightness = function(thisPlug, brightness, callback) {
	let me = this;
	if (me.debug) me.log("++++ setBrightness: " + thisPlug.name + " status brightness to " + brightness);
	 brightness = brightness || 0;
	 brightness = Math.round(numberMap(brightness, 0, 100, 0, 255));
	if (me.debug) me.log("++++ Sending device: " + thisPlug.name + " status brightness to " + brightness);

	return this.client.login(this.username, this.password).then(() => {
		return this.client.deviceSetBrightness(thisPlug.id, brightness);
	}).then(() => {
		// thisPlug.brightness = brightness;
		// callback(null, device.brightness);
		callback();
	}).catch( function( error) {
		me.log( "setBrightness: Error: " + error);
		callback( error);
	});
};

SengledHubPlatform.prototype.getBrightness = function(thisPlug, callback) {
	let me = this;
	if (this.debug) me.log("getBrightness: Getting device brightness: " + thisPlug.name + " " + thisPlug.brightness);
	if (this.accessories[thisPlug.id]) {
		return this.client.login(this.username, this.password).then(() => {
			return this.client.getDevices();
		}).then(devices => {
			return devices.find((device) => {
				return device.id.includes(thisPlug.id);
			});
		}).then((device) => {
			if (typeof device === 'undefined') {
				if (this.debug) me.log("getBrightness: Removing undefined device", thisPlug.name);
				this.removeAccessory(thisPlug)
			} else {
				//me.log( "getBrightness - Found Device: %o", device);
				var brightness = Math.round(numberMap(device.brightness, 0, 255, 0, 100));
				if (this.debug) me.log("getBrightness: Complete: " + device.name + " is " + device.brightness);
				thisPlug.brightness = brightness;
				callback(null, brightness);
			}
		}).catch( function( error) {
			me.log( "getBrightness: failed: " + error);
			callback( error);
		});
	} else {
		callback(new Error("getDevices: Device not found"));
	}
};

SengledHubPlatform.prototype.getHue = function(thisPlug, callback) {
	let me = this;
  let debug_flag = this.debug;
  // debug_flag = true;
	if (debug_flag) me.log("Getting device hue: " + thisPlug.name);
	if (me.accessories[thisPlug.id]) {
		return me.client.login(me.username, me.password).then(() => {
			return me.client.getDevices();
		}).then(devices => {
			return devices.find((device) => {
				return device.id.includes(thisPlug.id);
			});
		}).then((device) => {
			if (typeof device === 'undefined') {
				if (me.debug) me.log("Removing undefined device", thisPlug.name);
				me.removeAccessory(thisPlug)
			} else {
				if (debug_flag) me.log("getHue devices: " + device.name + " is " + device.rgbColorR + " " + device.rgbColorG + " " + device.rgbColorB);
				thisPlug.rgbColorR = device.rgbColorR;
				thisPlug.rgbColorG = device.rgbColorG;
				thisPlug.rgbColorB = device.rgbColorB;
        thisPlug.brightness = Math.round( numberMap( device.brightness, 0, 255, 0, 100));
        var hsv = convert.rgb.hsv( [ device.rgbColorR, device.rgbColorG, device.rgbColorB]);
        if (debug_flag) me.log( "getHUE Convert: %o", hsv);
        thisPlug.hue = hsv[ 0];
        thisPlug.saturation = hsv[ 1];
        thisPlug.lightness = hsv[ 2]
				callback(null, thisPlug.hue);
			}
		}).catch( function( error) {
			me.log( "getHue: Error: " + error);
			callback( error);
		});
	} else {
		callback(new Error("Device not found"));
	}
}

SengledHubPlatform.prototype.setHue = function(thisPlug, hue, callback) {
  let me = this;
  let debug_flag = this.debug;
  // debug_flag = true;
	if (debug_flag) me.log( "Setting Hue: %d %d %d", hue, thisPlug.saturation, thisPlug.lightness);
  var color = convert.hsv.rgb( [ hue, thisPlug.saturation, thisPlug.lightness]);
  if (debug_flag) me.log( "Setting color: %o", color);
  thisPlug.rgbColorR = color[ 0];
  thisPlug.rgbColorG = color[ 1];
  thisPlug.rgbColorB = color[ 2];
  thisPlug.hue = hue;

	return this.client.login(this.username, this.password).then(() => {
		return this.client.deviceSetColor(thisPlug.id, color);
	}).then(() => {
		callback();
	}).catch( function( error) {
		me.log("setHue: Error: " +  error);
		callback( error);
	});
}

SengledHubPlatform.prototype.getSaturation = function(thisPlug, callback) {
	let me = this;
  let debug_flag = this.debug;
  // debug_flag = true;
	if (debug_flag) me.log("Getting device saturation: " + thisPlug.name);
	if (me.accessories[thisPlug.id]) {
		return me.client.login(me.username, me.password).then(() => {
			return me.client.getDevices();
		}).then(devices => {
			return devices.find((device) => {
				return device.id.includes(thisPlug.id);
			});
		}).then((device) => {
			if (typeof device === 'undefined') {
				if (debug_flag) me.log("Removing undefined device", thisPlug.name);
				me.removeAccessory(thisPlug)
			} else {
				if (debug_flag) me.log("getSaturation devices: " + device.name + " is " + device.rgbColorR + " " + device.rgbColorG + " " + device.rgbColorB);
				thisPlug.rgbColorR = device.rgbColorR;
				thisPlug.rgbColorG = device.rgbColorG;
				thisPlug.rgbColorB = device.rgbColorB;
        thisPlug.brightness = Math.round( numberMap( device.brightness, 0, 255, 0, 100));
        var hsv = convert.rgb.hsv( [ device.rgbColorR, device.rgbColorG, device.rgbColorB]);
        if (debug_flag) me.log( "getSaturation HSV: %o", hsv);
        thisPlug.hue = hsv[ 0];
        thisPlug.saturation = hsv[ 1];
        thisPlug.lightness = hsv[ 2];
				callback(null, thisPlug.saturation);
			}
		}).catch( function( error) {
			me.log( "getSaturation: Error: " + error);
			callback( error);
		});
	} else {
		callback(new Error("Device not found"));
	}
}

SengledHubPlatform.prototype.setSaturation = function(thisPlug, saturation, callback) {
  let me = this;
  let debug_flag = this.debug;
  // debug_flag = true;
	if (debug_flag) me.log( "Setting Saturation: %o", saturation);
  //if (saturation > 1) {
    //saturation = saturation / 100.0;
  //}
  var color = convert.hsv.rgb( [ thisPlug.hue, saturation, thisPlug.lightness]);
  if (debug_flag) me.log( "Setting color: %o", color);
  thisPlug.rgbColorR = color[ 0];
  thisPlug.rgbColorG = color[ 1];
  thisPlug.rgbColorB = color[ 2];
  thisPlug.saturation = saturation;

	return this.client.login(this.username, this.password).then(() => {
		return this.client.deviceSetColor(thisPlug.id, color);
	}).then(() => {
		callback();
	}).catch( function( error) {
		me.log("setSaturation: Error: " + error);
		callback( error);
	});
}

SengledHubPlatform.prototype.setColorTemperature = function(thisPlug, colortemperature, callback) {
	let me = this;
  let debug_flag = this.debug;
  // debug_flag = true;
	if (debug_flag) me.log("++++ setColortemperature: " + thisPlug.name + " status colortemperature to " + colortemperature);
	//colortemperature = colortemperature || 0;
	colortemperature = Math.round(numberMap(colortemperature, 140, 500, 0, 100));
	//colortemperature = 100 - colortemperature;
	if (debug_flag) me.log("++++ Sending device: " + thisPlug.name + " status colortemperature to " + colortemperature);

	return this.client.login(this.username, this.password).then(() => {
		return this.client.deviceSetColorTemperature(thisPlug.id, colortemperature);
	}).then(() => {
		callback();
	}).catch( function( error) {
		me.log( "setColorTemperature: Error: " + error);
		callback( error);
	});
};

SengledHubPlatform.prototype.getColorTemperature = function(thisPlug, callback) {
	let me = this;
  let debug_flag = this.debug;
  // debug_flag = true;
	if (debug_flag) me.log("Getting device temperature: " + thisPlug.name);
	if (this.accessories[thisPlug.id]) {
		return this.client.login(this.username, this.password).then(() => {
			return this.client.getDevices();
		}).then(devices => {
			return devices.find((device) => {
				return device.id.includes(thisPlug.id);
			});
		}).then((device) => {
			if (typeof device === 'undefined') {
				if (me.debug) me.log("Removing undefined device", thisPlug.name);
				this.removeAccessory(thisPlug)
			} else {
				//let colortemperature = Math.round(numberMap(100 - device.colortemperature, 0, 100, 140, 500));
				let colortemperature = Math.round(numberMap(device.colortemperature, 0, 100, 140, 500));
				if (debug_flag) me.log("getColortemperature complete: " + device.name + " is " + device.colortemperature);
        if (debug_flag) me.log( "R: " + device.rgbColorR + " G: " + device.rgbColorG + " B: " + device.rgbColorB);
				thisPlug.colorTemperature = colortemperature;
				callback(null, colortemperature);
			}
		}).catch( function( error) {
			me.log( "getColorTemperature: Error: " + error);
			callback( error);
		});
	} else {
		callback(new Error("Device not found"));
	}
};

SengledHubPlatform.prototype.identify = function(thisPlug, paired, callback) {
	let me = this;
	if (me.debug) me.log("identify invoked: " + thisPlug + " " + paired);
	callback();
}
