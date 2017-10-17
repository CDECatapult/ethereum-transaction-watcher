# @digicat/ethereum-transaction-watcher

This package can watch transactions on a
[web3.js](https://github.com/ethereum/web3.js/)-compatible
[Ethereum](https://ethereum.org/) network, providing callbacks for when receipts
are received. Requires [Node.js](https://nodejs.org/en/) 8.6 or newer.

## Usage

```js
const TransactionWatcher = require('@digicat/ethereum-transaction-watcher')

const watcher = new TransactionWatcher({
  ethereumNode: 'http://localhost:8545',
  interval: 60000, // Interval on which we check for receipts. Default is 60s.

  onError (err, token) {
    // Called when an error occurred when getting a transaction receipt.
    //
    // Expected to be synchronous.
  },

  onReceipt (receipt, token) {
    // Called when a transaction receipt is received for a transaction hash
    // that's being watched.
    //
    // Can be asynchronous (if you return a promise). Won't interleave with
    // other events.
  },

  wrapWeb3Error (err) {
    // Allows for underlying Web3 errors to be wrapped in another Error class.
    // By default returns the error as-is.
    return err
  }
})

// Start watching a new transaction hash. The `token` is provided in callbacks
// as-is.
watcher.add({
  hash: '0xe9d7d2bc7b98b1e5090b9363453836ab89b290415e997acb8d773e4f46440c09',
  token: {
    an: {
      arbitrary: 'object'
    }
  }
})

// Stop watching all transactions.
watcher.stop()
```
