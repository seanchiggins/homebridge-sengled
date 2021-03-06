# homebridge-sengled updated by Sean C. Higgins

An unoffical [Homebridge](https://github.com/nfarina/homebridge) platform plugin for Sengled accessories.

This plugin uses the existing Sengled Element Home app infrastructure to allow you to control your Sengled accessories.

Provide your username and password and register as a platform, and it will auto-detect the light bulb you have registered.

This has been extended to work with the Classic A19, Color Plus A19, and Hub.

## Color

Color is working just about as good as I think it is going to get. Conversion of Sengled (RGB) to HomeKit (Hue, Saturation) is done via RGB to/from HSV. Using npm color-convert routines.

# Changes

Improvements on the original version:

- Added device caching to minimize the number of calls to Sengled for information.
- Added a mutex via async-mutex to only allow one login request at a time. This minimizes the number of requests to Sengled.
- Added a mutex to only allow one request to Sengled at a time. If successful, all other requests use cache. Again to minimize the number of requests to Sengled. Seems to be a much smoother operation.
- Added support for Color.

# Installing

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g seanchiggins/homebridge-sengled`
3. Update your configuration file. See below for a sample.

# Configuration

Configuration sample:

```
"platforms": [
  {
    "platform": "SengledHub",
    "name": "SengledHub",
    "username": "***",
    "password": "***"
  }
]
```

## Optional parameters

- debug, this will enable more logging information from the plugin

```
"platforms": [
  {
    "platform": "SengledHub",
    "name": "SengledHub",
    "username": "***",
    "password": "***",
    "debug": true
  }
]
```
