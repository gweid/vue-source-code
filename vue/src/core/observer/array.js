/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import {
  def
} from '../util/index'

// 新建一个继承于 Array 的对象
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
// 对数组方法设置了代理，执行数组那七种方法的时候会执行 mutator 函数
methodsToPatch.forEach(function (method) {
  // cache original method
  // 缓冲原始数组的方法
  const original = arrayProto[method]
  // 利用 Object.defineProperty 对方法的执行进行改写
  def(arrayMethods, method, function mutator(...args) {
    // 执行原数组方法，保证了与原始数组类型的方法一致性
    const result = original.apply(this, args)
    const ob = this.__ob__
    // inserted变量用来标志数组是否是增加了元素，如果增加的元素不是原始类型，而是数组对象类型，则需要触发 observeArray 方法，对每个元素进行依赖收集。
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 进行依赖的派发更新
    ob.dep.notify()
    return result
  })
})
