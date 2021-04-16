/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

// Vue 初始化阶段，往 Vue 原型上添加 _init 方法，new Vue 实际上就是执行的这个 _init 方法
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    // 将 this（实际上就是 Vue） 赋值给 vm
    const vm: Component = this
    // 每个 vue 实例都有一个 uid，并且 uid 往上递增
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    vm._isVue = true
    // 组件初始化时的配置合并（通过判断 options 上有没有 _isComponent 属性来确定是否是组件）
    if (options && options._isComponent) {
      /**
       * 每个子组件初始化时走这里，这里只做了一些性能优化
       * 将组件配置对象上的一些深层次属性放到 vm.$options 选项中，以提高代码的执行效率
       */
      initInternalComponent(vm, options)
    } else {
      // new Vue 时的配置合并
      // 进行 options 的合并,并挂载到 Vue.$options 上，那么 $options.data 可以访问到 data
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }

    if (process.env.NODE_ENV !== 'production') {
      // 设置代理，将 vm 实例上的属性代理到 vm._renderProxy
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }

    vm._self = vm

    // 初始化组件实例关系属性，比如 $parent、$children、$root、$refs、_watcher、_isMounted 等等
    initLifecycle(vm)

    // 初始化自定义事件，例如：@click
    initEvents(vm)

    // 解析插槽 slot，得到 vm.$slot
    // 处理渲染函数，得到 vm.$createElement 方法，即 h 函数
    // 将 vm.$attrs、vm.$listeners 转换为响应式
    initRender(vm)

    // 调用 beforeCreate 生命周期钩子
    callHook(vm, 'beforeCreate')
    
    // 初始化组件的 inject 配置项
    initInjections(vm) // resolve injections before data/props  在 data/props 之前解决注入

    // 构建响应式系统，处理 props、methods、data、computed、watch 的响应式问题
    initState(vm)

    // 解析组件配置项上的 provide 对象，再挂载一份到 vm._provided 属性上（原本在 vm.$options.provide 上）
    initProvide(vm) // resolve provide after data/props

    // 调用 create 生命周期钩子
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 最后, 如果有根元素，那么就挂载
    // options = { el: "#app", data: {}, methods: {}, ... }
    // 有 el 选项，自动调用 $mount 方法，就不需要再手动调用 $mount
    // 没有 el 则必须手动调用 $mount
    if (vm.$options.el) {
      // 调用 $mount 方法，进入挂载阶段
      vm.$mount(vm.$options.el)
    }
  }
}

// 组件的配置合并
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
