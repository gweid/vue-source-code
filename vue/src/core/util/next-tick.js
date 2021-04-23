/* @flow */
/* globals MutationObserver */

// noop 是一个空函数
import { noop } from 'shared/util'
// 错误处理函数
import { handleError } from './error'
// 平台判断
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks = [] // 用于存放回调函数数组
let pending = false

// 作为 微任务 或者 宏任务 的回调函数
// 例如：setTimeout(flushCallbacks, 0)
function flushCallbacks () {
  pending = false
  // 从 callbacks 中取出所有回调回调函数，slice(0)相当于复制一份
  const copies = callbacks.slice(0)
  // 将 callbacks 数组置空
  callbacks.length = 0
  // 遍历执行每一个回调函数 flushSchedulerQueue
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).

// timerFunc 的逻辑特别简单：
//  主要就是将 flushCallbacks 放进浏览器的异步任务队列里面。
//  中间通过降级的方式处理兼容问题，优先使用 Promise，其次是 MutationObserver，然后是 setImmediate，最后才是使用 setTimeout
//  也就是优先微任务处理，微任务不行逐步降级到宏任务处理
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  // 如果支持 Promise 则优先使用 Promise
  const p = Promise.resolve()
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && (
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  // 使用 MutationObserver
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 使用 setImmediate，其实 setImmediate 已经算是宏任务了，但是性能会比 setTimeout 稍微好点
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // setTimeout 是最后的选择
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// cb：回调函数 flushSchedulerQueue
// ctx：上下文
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 将回调函数 cb（flushSchedulerQueue）放进 callbacks 数组中
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })
  
  // 如果 pending 为 false，代表浏览器任务队列为空（即没有 flushCallbacks）
  // 如果 pending 为 true，代表浏览器任务队列存在任务
  // 在执行 flushCallbacks 的时候会再次将 pending 标记为 false
  // 也就是说，pending 在这里的作用就是：保证在同一时刻，浏览器的任务队列中只有一个 flushCallbacks 函数
  if (!pending) {
    pending = true

    // 执行 timerFunc 函数
    // timerFunc 函数的主要作用就是：通过微任务或者宏任务的方式往浏览器添加任务队列
    timerFunc()
  }
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
