'use strict'

const {makeGetTransactionReceipt} = require('./lib/web3')
const timers = require('./lib/timers')

const DEFAULT_INTERVAL = 60e3

class TransactionWatcher {
  constructor ({ethereumNode, interval = DEFAULT_INTERVAL, onError, onReceipt, wrapWeb3Error = err => err}) {
    this.interval = interval
    this.onError = onError
    this.onReceipt = onReceipt

    this.getTransactionReceipt = makeGetTransactionReceipt(ethereumNode, wrapWeb3Error)

    this.transactions = new Map()
    this.busy = false
    this.stopping = false
    this.timer = null
  }

  stop () {
    this.stopping = true
    if (this.timer) {
      timers.clear(this.timer)
      this.timer = null
    }
  }

  add ({hash, token}) {
    if (this.stopping) return
    if (this.transactions.has(hash)) return

    this.transactions.set(hash, token)
    this.getReceipts()
  }

  // Periodically checks for transaction receipts. Loops through each
  // transaction, restarting the loop no less than a minute after the start of
  // the previous iteration, until there are no transactions left to watch.
  async getReceipts () {
    if (this.busy) return

    // Allow getReceipts() to execute immediately when add() is called, without
    // waiting for the timer to fire.
    if (this.timer !== null) {
      timers.clear(this.timer)
    }

    this.busy = true
    const startedAt = timers.now()

    for (const [hash, token] of this.transactions) {
      if (this.stopping) break

      try {
        // TODO: Abort this request when stopping. Web3 does not currently
        // support this.
        const receipt = await this.getTransactionReceipt(hash)
        if (receipt === null) continue
        if (receipt.blockNumber === null) continue

        // Bail if the watcher is being stopped since getTransactionReceipt()
        // began.
        if (this.stopping) break

        await this.onReceipt(receipt, token)
        // Stop watching the transaction once the receipt has been recorded.
        this.transactions.delete(hash)
      } catch (err) {
        // Don't break the loop. Presumably the onError handler causes a delayed
        // crash of the observer.
        this.onError(err, token)
      }
    }

    this.busy = false

    if (this.transactions.size > 0) {
      const wait = Math.max(0, this.interval - (timers.now() - startedAt))
      this.timer = timers.set(() => {
        this.timer = null
        this.getReceipts()
      }, wait)
    }
  }
}
module.exports = TransactionWatcher
