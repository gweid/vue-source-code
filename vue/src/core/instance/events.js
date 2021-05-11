/* @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  const listeners = vm.$options._parentListeners
  if (listeners) {
    updateComponentListeners(vm, listeners)
  }
}

let target: any

function add (event, fn) {
  target.$on(event, fn)
}

function remove (event, fn) {
  target.$off(event, fn)
}

function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

// 定义事件播报相关函数
export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  // $on 用来监听事件
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) {
      // 如果 event 是由多个事件名组成的数组，那么遍历这个 event 数组，逐个调用 vm.$on
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      // 将事件及回调函数以键值对形式存储，例如：vm._events = { event: [fn] }
      (vm._events[event] || (vm._events[event] = [])).push(fn)

      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  // $once 用来监听事件，但是只会触发一次，触发后将会移除监听事件
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    // 对 fn 做一层包装，先解除绑定再执行 fn 回调
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  // $off 用来解除事件监听
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this

    // 如果 $off 没有传递任何参数，将 vm._events 属性清空，即 vm._events = {}
    // 也就是移除所有监听
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }

    // 如果event 是数组，event=[event1, ...]，遍历，逐个调用 vm.$off
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }

    // specific event
    // 找到制定事件数组
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    // 如果没有指定事件的回调函数，则移除该事件的所有回调函数
    if (!fn) {
      vm._events[event] = null
      return vm
    }

    // 移除指定事件的指定回调函数
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  // $emit 方法用来触发事件，并将之前 $on 存储在 vm._events 的对应事件回调拿出来执行
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }

    // 从 vm._events 拿到事件 event 对应的回调函数数组
    let cbs = vm._events[event]
    // 如果 cbs 存在
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      // 获取到 emit 传进来的参数
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      // 遍历事件数组中的回调函数，并逐一执行
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
