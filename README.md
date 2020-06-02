# homebridge-sengled updated by Sean C. Higgins
An unoffical [Homebridge](https://github.com/nfarina/homebridge) platform plugin for Sengled accessories.

This plugin uses the existing Sengled Element Home app infrastructure to allow you to control your Sengled accessories.

Provide your username and password and register as a platform, and it will auto-detect the light bulb you have registered.

This has been extended to work with the Classic A19, Color Plus A19, and Hub. Color is working ok. Still trying to
understand the parameters offered from Homebridge and Home Kit.

## Color Issues

The issue that I am having with Color is that Home Kit deals with Hue, Saturation, and Lightness and I cannot find the Lightness setting in Homebridge. My guess is that Homebridge believes Brightness = Lightness, but I do not think that is the case. I think Home Kit has both Lightness and Brightness.

# Changes

Improvements on the original version:

- Added device caching to minimize the number of calls to Sengled for information.
- Added a mutex via async-mutex to only allow one login request at a time.
- Added a mutex to only allow one request to Sengled at a time. If successful, all other requests use cache.
- Added initial support for Color.

# Installing

**Not sure how you would install my version. Installing the original version via:**

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-sengled`
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
