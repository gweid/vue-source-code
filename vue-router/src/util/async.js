/* @flow */
/**
 * 执行路由守卫队列
 * @param {*} queue 需要执行的队列
 * @param {*} fn 迭代函数
 * @param {*} cb 回调函数
 */
export function runQueue (queue: Array<?NavigationGuard>, fn: Function, cb: Function) {
  const step = index => {
    if (index >= queue.length) {
      // 队列已经执行完，执行回调函数 cb
      cb()
    } else {
      if (queue[index]) {
        // queue[index] 存在，执行迭代函数 fn
        fn(queue[index], () => {
          step(index + 1)
        })
      } else {
        // queue[index] 不存在，执行下一个
        step(index + 1)
      }
    }
  }

  step(0)
}
