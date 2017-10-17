'use strict'

const util = require('util')
const Web3 = require('web3')

const makeProvider = require('./provider')

function makeGetTransactionReceipt (ethereumNode, wrapWeb3Error) {
  const provider = makeProvider(ethereumNode)
  const web3 = new Web3(provider)

  const _getTransactionReceipt = util.promisify(web3.eth.getTransactionReceipt.bind(web3.eth))
  const getTransactionReceipt = arg => _getTransactionReceipt(arg).catch(err => { throw wrapWeb3Error(err) })
  return getTransactionReceipt
}
exports.makeGetTransactionReceipt = makeGetTransactionReceipt
