/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import {
  def
} from '../util/index'

// 对数组的原型进行备份
const arrayProto = Array.prototype
// 通过继承的方式创建新的 arrayMethods
export const arrayMethods = Object.create(arrayProto)

// 当外部访问通过以下7种方法访问数组，会被处理
// 因为这7种方法会改变数组
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
// 对数组那七种方法进行拦截并执行 mutator 函数
methodsToPatch.forEach(function (method) {
  // cache original method
  // 缓冲原始数组的方法
  const original = arrayProto[method]
  // 利用 Object.defineProperty 对 arrayMethods 进行拦截
  def(arrayMethods, method, function mutator(...args) {
    // 先执行数组原生方法，保证了与原生数组方法的执行结果一致
    // 例如 push.apply()
    const result = original.apply(this, args)

    const ob = this.__ob__
    // 如果 method 是以下三个之一，说明是新插入了元素
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args // 比如：args 是 [{...}]
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    // 对插入的元素进行响应式处理
    if (inserted) ob.observeArray(inserted)

    // 通过 dep.notify 通知更新
    ob.dep.notify()
    return result
  })
})
