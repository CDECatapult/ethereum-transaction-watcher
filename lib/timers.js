'use strict'
// This module exists only so that the timers can be stubbed during tests,
// without affecting timers throughout the process.

const {clearTimeout: clear, setTimeout: set} = require('timers')

exports.clear = clear
exports.now = () => Date.now()
exports.set = set
