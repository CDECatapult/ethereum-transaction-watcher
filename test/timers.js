import test from 'ava'
import lolex from 'lolex'

const clock = lolex.install({now: 0, toFake: ['Date', 'clearTimeout', 'setTimeout']})

const timers = require('../lib/timers')

test.serial.cb('set() sets a timer', t => {
  timers.set(() => {
    t.pass()
    t.end()
  }, 10)

  clock.runAll()
})

test.serial.cb('clear() clears a timer', t => {
  const first = timers.set(() => {
    t.fail('Should have been cleared')
  }, 10)

  timers.set(() => {
    t.pass()
    t.end()
  }, 10)

  timers.clear(first)

  clock.runAll()
})

test('now() returns the current time', t => {
  clock.setSystemTime(42)
  t.is(timers.now(), 42)
})
