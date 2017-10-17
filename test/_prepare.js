import Tx from 'ethereumjs-tx'
import ganache from 'ganache-core'
import lolex from 'lolex'
import memdown from 'memdown'
import td from 'testdouble'
import Web3 from 'web3'

const clock = lolex.createClock(0)
export {clock}
td.replace('../lib/timers', {clear: clock.clearTimeout, now: () => clock.now, set: clock.setTimeout})

const makeProvider = td.replace('../lib/provider')

// Use require() since this should be loaded after module stubs have been
// configured.
const TransactionWatcher = require('..')

const makePrepareTransaction = (provider, addresses) => ({from = addresses[0], to = addresses[1], value = 0, nonce = 0} = {}) => {
  const tx = new Tx({
    nonce,
    gasPrice: '0x4A817C800',
    gasLimit: '0x15f90',
    to,
    value
  })

  // TestRPC returns the unsigned hash
  const hash = '0x' + tx.hash().toString('hex')

  tx.sign(provider.manager.state.accounts[from].secretKey)
  return {
    hash,
    send () {
      return new Promise((resolve, reject) => {
        new Web3(provider).eth.sendRawTransaction(tx.serialize(), err => err ? reject(err) : resolve())
      })
    }
  }
}

const seenTitles = new Set()
export default (setup = {}) => {
  return async t => {
    // Titles are used to ensure each watcher instance gets the correct Web3 provider.
    if (seenTitles.has(t.title)) throw new Error(`Test title has already been used: ${t.title}`)
    seenTitles.add(t.title)

    const provider = ganache.provider({
      accounts: [
        {balance: 10e18},
        {balance: 0}
      ],
      db: memdown(),
      mnemonic: 'i’ll be with you lost boys',
      locked: true
    })

    const addresses = Object.keys(provider.manager.state.accounts)

    const ethereumNode = `ethereumNode (${t.title})`
    td.when(makeProvider(ethereumNode)).thenReturn(provider)

    let watcher
    const promise = new Promise(async (resolve, reject) => {
      const {
        defaultInterval = false,
        interval = 10,
        onError = (_, err) => reject(err),
        onReceipt = resolve,
        wrapWeb3Error
      } = setup

      watcher = new TransactionWatcher({
        ethereumNode,
        interval: defaultInterval ? undefined : interval,
        onError (...args) {
          return onError(t, ...args)
        },
        onReceipt (...args) {
          return onReceipt(t, ...args)
        },
        wrapWeb3Error
      })

      const {getTransactionReceipt} = watcher
      let pendingRequests = []
      watcher.getTransactionReceipt = (...args) => {
        const pending = new Promise((resolveRequest, rejectRequest) => { // eslint-disable-line promise/param-names
          const result = getTransactionReceipt.apply(watcher, args)
          pendingRequests.push({
            fail (err) {
              rejectRequest(err)
              return pending.catch(() => {})
            },
            flush (mutate) {
              resolveRequest(result.then(receipt => {
                mutate(receipt)
                return receipt
              }))
              return pending
            }
          })
        })
        return pending
      }
      const failRequests = async err => {
        const requests = pendingRequests
        pendingRequests = []
        await Promise.all(requests.map(request => request.fail(err)))
      }
      const flushRequests = async (mutate = () => {}) => {
        const requests = pendingRequests
        pendingRequests = []
        await Promise.all(requests.map(request => request.flush(mutate)))
      }

      t.context = {
        addresses,
        done: resolve,
        failRequests,
        flushRequests,
        interval,
        prepareTransaction: makePrepareTransaction(provider, addresses),
        provider,
        watcher
      }

      if (setup.run) {
        try {
          await setup.run(t)
        } catch (err) {
          reject(err)
        }
      }
    })

    try {
      await promise
    } finally {
      if (watcher) watcher.stop()
    }
  }
}
