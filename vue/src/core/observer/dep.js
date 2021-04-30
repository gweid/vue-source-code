/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
// 依赖收集
export default class Dep {
  // Dep.targte 就是一个 watcher
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    // subs 存储 watcher 的
    this.subs = []
  }

  // 在 dep 中添加 watcher
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  // 将 dep 添加进 watcher
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  // 派发更新
  // 通知 dep 中的所有 watcher，执行 watcher.update() 方法
  // watcher.update 中实际上就是调用 updateComponent 对页面进行重新渲染
  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []

// 开放出去的方法，主要用来往 Dep 类上添加 target（也就是 watcher）
export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  // 删除 targetStack 最后一个 watcher
  targetStack.pop()
  // 如果 targetStack=[]，那么 targetStack[targetStack.length - 1] 的结果是 undefined
  Dep.target = targetStack[targetStack.length - 1]
}