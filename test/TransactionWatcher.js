import test from 'ava'

// Note that all tests share the same clock. Tests that advance the clock should
// be run serially.
import prepare, {clock} from './_prepare'

test('calls onReceipt when a transaction completes', prepare({
  onReceipt (t, receipt, token) {
    t.is(token, t.context.token)
    const {blockHash, ...props} = receipt
    t.snapshot(props)

    t.context.done()
  },

  async run (t) {
    const token = Symbol('token')
    t.context.token = token

    const tx = t.context.prepareTransaction()
    await tx.send()

    t.context.watcher.add({hash: tx.hash, token})
    await t.context.flushRequests()
  }
}))

test.serial('checks every interval to see if the transaction has completed', prepare({
  onReceipt (t) {
    t.true(clock.now > t.context.start + t.context.interval)
    t.context.done()
  },

  async run (t) {
    t.context.start = clock.now

    const tx = t.context.prepareTransaction()
    t.context.watcher.add({hash: tx.hash, token: Symbol('token')})
    await t.context.flushRequests()

    clock.runAll()
    await t.context.flushRequests()

    await tx.send()
    clock.runAll()
    await t.context.flushRequests()
  }
}))

test.serial('a receipt without a blockNumber means the transaction is incomplete', prepare({
  onReceipt (t, receipt, token) {
    t.is(token, t.context.token)
    t.false(receipt.blockNumber === null)
    t.context.done()
  },

  async run (t) {
    const token = Symbol('token')
    t.context.token = token

    const tx = t.context.prepareTransaction()
    await tx.send()

    t.context.watcher.add({hash: tx.hash, token})
    await t.context.flushRequests(receipt => {
      receipt.blockNumber = null
    })
    clock.runAll()
    await t.context.flushRequests()
  }
}))

test.serial('adding the same hash more than once is a noop', prepare({
  onReceipt (t) {
    t.pass()
  },

  async run (t) {
    t.plan(1)

    const tx = t.context.prepareTransaction()
    await tx.send()

    t.context.watcher.add({hash: tx.hash, token: Symbol('token')})
    t.context.watcher.add({hash: tx.hash, token: Symbol('token 2')})

    clock.runAll()
    await t.context.flushRequests()
    t.context.done()
  }
}))

test('adding a hash once stopped is a noop', prepare({
  onReceipt (t) {
    t.fail('Should not receive a receipt')
  },

  async run (t) {
    t.context.watcher.stop()

    const tx = t.context.prepareTransaction()
    await tx.send()

    t.context.watcher.add({hash: tx.hash, token: Symbol('token')})
    await t.context.flushRequests()

    t.pass()
    t.context.done()
  }
}))

test('adding a second hash while waiting for a first preempts the timer', prepare({
  onReceipt (t, receipt, token) {
    t.true(t.context.remaining.has(token))
    t.context.remaining.delete(token)
  },

  async run (t) {
    t.context.remaining = new Set()

    const first = t.context.prepareTransaction({nonce: 0})
    const firstToken = Symbol('first token')
    t.context.remaining.add(firstToken)
    t.context.watcher.add({hash: first.hash, token: firstToken})
    await t.context.flushRequests()

    const second = t.context.prepareTransaction({nonce: 1})
    const secondToken = Symbol('second token')
    t.context.remaining.add(secondToken)

    await first.send()
    await second.send()

    t.context.watcher.add({hash: second.hash, token: secondToken})
    await t.context.flushRequests()

    setImmediate(async () => {
      await t.context.flushRequests()

      t.true(t.context.remaining.size === 0)
      t.context.done()
    })
  }
}))

test('adding a second hash while getting receipts for a first does not result in duplicate receipts', prepare({
  onReceipt (t, receipt, token) {
    t.true(t.context.remaining.has(token))
    t.context.remaining.delete(token)
  },

  async run (t) {
    t.context.remaining = new Set()

    const first = t.context.prepareTransaction({nonce: 0})
    await first.send()

    const firstToken = Symbol('first token')
    t.context.remaining.add(firstToken)
    t.context.watcher.add({hash: first.hash, token: firstToken})

    const second = t.context.prepareTransaction({nonce: 1})
    await second.send()

    const secondToken = Symbol('second token')
    t.context.remaining.add(secondToken)
    t.context.watcher.add({hash: second.hash, token: secondToken})

    await t.context.flushRequests()
    setImmediate(async () => {
      await t.context.flushRequests()

      t.true(t.context.remaining.size === 0)
      t.context.done()
    })
  }
}))

test.serial('stopping the watcher while transactions are pending stops watching', prepare({
  onReceipt (t) {
    t.fail('Should not receive a receipt')
  },

  async run (t) {
    const tx = t.context.prepareTransaction()
    t.context.watcher.add({hash: tx.hash, token: Symbol('token')})
    await t.context.flushRequests()

    t.context.watcher.stop()

    await tx.send()
    clock.runAll()
    await t.context.flushRequests()

    t.pass()
    t.context.done()
  }
}))

test('stopping the watcher while waiting for onReceipt() stops watching remaining transactions', prepare({
  async onReceipt (t, receipt, token) {
    t.context.receivedToken = token
    await t.context.receiptPromise
  },

  async run (t) {
    let finishReceipt
    t.context.receiptPromise = new Promise(resolve => {
      finishReceipt = resolve
    })

    const first = t.context.prepareTransaction({nonce: 0})
    await first.send()
    const firstToken = Symbol('first token')
    t.context.watcher.add({hash: first.hash, token: firstToken})

    const second = t.context.prepareTransaction({nonce: 1})
    await second.send()
    t.context.watcher.add({hash: second.hash, token: Symbol('second token')})

    await t.context.flushRequests()
    t.is(t.context.receivedToken, firstToken)
    t.context.watcher.stop()
    finishReceipt()

    setImmediate(async () => {
      await t.context.flushRequests()
      t.is(t.context.receivedToken, firstToken)
      t.context.done()
    })
  }
}))

test('stopping the watcher while getting a receipt stops watching remaining transactions', prepare({
  async onReceipt (t, receipt, token) {
    t.fail('Should not receive a receipt')
  },

  async run (t) {
    const first = t.context.prepareTransaction({nonce: 0})
    await first.send()
    const firstToken = Symbol('first token')
    t.context.watcher.add({hash: first.hash, token: firstToken})

    const second = t.context.prepareTransaction({nonce: 1})
    await second.send()
    t.context.watcher.add({hash: second.hash, token: Symbol('second token')})

    t.context.watcher.stop()
    await t.context.flushRequests()

    setImmediate(async () => {
      await t.context.flushRequests()
      t.pass()
      t.context.done()
    })
  }
}))

test('forwards errors to onError()', prepare({
  onError (t, err, token) {
    t.is(err, t.context.err)
    t.is(token, t.context.token)
    t.context.done()
  },

  async run (t) {
    const token = Symbol('token')
    t.context.token = token

    const err = new Error()
    t.context.err = err

    const {hash} = t.context.prepareTransaction()
    t.context.watcher.add({hash, token})

    t.context.failRequests(err)
  }
}))

test('errors in one transaction do not impact getting the receipt for the next', prepare({
  onError (t) {
    t.pass()
  },

  onReceipt (t, receipt, token) {
    t.is(token, t.context.token)
    t.context.done()
  },

  async run (t) {
    t.plan(2)

    const token = Symbol('token')
    t.context.token = token

    const {hash} = t.context.prepareTransaction({value: 1, nonce: 0})
    t.context.watcher.add({hash, token: Symbol('failing')})

    const tx = t.context.prepareTransaction({value: 2, nonce: 0})
    await tx.send()
    t.context.watcher.add({hash: tx.hash, token})

    t.context.failRequests(new Error())
    setImmediate(async () => {
      await t.context.flushRequests()
    })
  }
}))

test('can wrap Web3 errors', prepare({
  wrapWeb3Error (err) {
    return {err, wrapped: true}
  },

  onError (t, err) {
    t.is(err.err, t.context.err)
    t.true(err.wrapped)
    t.context.done()
  },

  async run (t) {
    const err = new Error()
    t.context.err = err

    // Inject the error into the provider, since wrapping takes place at the
    // Web3 layer, not the watcher itself.
    t.context.provider.sendAsync = (payload, callback) => {
      setImmediate(() => callback(err))
    }

    const {hash} = t.context.prepareTransaction()
    t.context.watcher.add({hash, token: Symbol('token')})

    try {
      await t.context.flushRequests()
    } finally {}
  }
}))

test('by default, forwards wrapped Web3 errors as-is', prepare({
  onError (t, err) {
    t.is(err, t.context.err)
    t.context.done()
  },

  async run (t) {
    const err = new Error()
    t.context.err = err

    // Inject the error into the provider, since wrapping takes place at the
    // Web3 layer, not the watcher itself.
    t.context.provider.sendAsync = (payload, callback) => {
      setImmediate(() => callback(err))
    }

    const {hash} = t.context.prepareTransaction()
    t.context.watcher.add({hash, token: Symbol('token')})

    try {
      await t.context.flushRequests()
    } finally {}
  }
}))

test.serial('has a default 60 second interval', prepare({
  defaultInterval: true,

  onReceipt (t, receipt, token) {
    t.context.receivedToken = token
  },

  async run (t) {
    const token = Symbol('token')
    t.context.receivedToken = null

    const tx = t.context.prepareTransaction()
    t.context.watcher.add({hash: tx.hash, token})
    await t.context.flushRequests()

    await tx.send()
    await t.context.flushRequests()
    t.is(t.context.receivedToken, null)

    clock.tick(59e3)
    await t.context.flushRequests()
    t.is(t.context.receivedToken, null)

    clock.tick(1e3)
    await t.context.flushRequests()
    t.is(t.context.receivedToken, token)

    t.context.done()
  }
}))

test.serial('checks for receipts on every interval, regardless of request duration', prepare({
  defaultInterval: true,

  onReceipt (t, receipt, token) {
    t.context.receivedToken = token
  },

  async run (t) {
    const token = Symbol('token')
    t.context.receivedToken = null

    const tx = t.context.prepareTransaction({nonce: 0})
    t.context.watcher.add({hash: tx.hash, token})

    // Request takes 30 seconds (less than interval).
    clock.tick(30e3)
    await t.context.flushRequests()

    await tx.send()
    // Doesn't do anything since the timer is still pending.
    await t.context.flushRequests()
    t.is(t.context.receivedToken, null)

    clock.tick(29e3)
    await t.context.flushRequests()
    t.is(t.context.receivedToken, null)

    clock.tick(1e3)
    await t.context.flushRequests()
    t.is(t.context.receivedToken, token)

    // Finished first test.

    t.context.receivedToken = null
    const tx2 = t.context.prepareTransaction({nonce: 1})
    t.context.watcher.add({hash: tx2.hash, token})

    // Request takes 90 seconds (more than interval).
    clock.tick(90e3)
    await t.context.flushRequests()

    await tx2.send()
    // Doesn't do anything since the timer is still pending.
    await t.context.flushRequests()
    t.is(t.context.receivedToken, null)

    clock.tick(0)
    await t.context.flushRequests()
    t.is(t.context.receivedToken, token)

    t.context.done()
  }
}))
