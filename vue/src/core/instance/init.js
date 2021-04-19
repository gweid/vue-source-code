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
/**
 * 总结：vue 初始化（new Vue）阶段干了什么：
 *   1、用户传入的配置和系统配置的合并
 *   2、初始化相关属性：$parent、$children、$root、$refs、_watcher、_isMounted 等
 *   3、初始化事件系统，就是 v-on 或者 @ 定义的事件
 *   4、解析插槽
 *   5、挂载 beforeCreate 生命周期
 *   6、初始化组件的 inject 注入配置项
 *   7、构建响应式系统（props、methods、data、computed、watch）
 *   8、解析组件配置项上的 provide 对象
 *   9、挂载 create 生命周期
 *   10、最后调用 $mount 进行页面挂载
 */
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
      // new Vue 时的配置合并（new Vue 传入的是用户配置，需要和系统配置合并）
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

    // 初始化事件系统，例如 v-on 或者 @ 定义的事件
    initEvents(vm)

    // 解析插槽 slot，得到 vm.$slot
    // 定义了 vm._c 方法，用于处理 template 模式
    // 定义了 vm.$createElement，用于处理手写 render 模式
    // 无论是 vm._c 还是 vm.$createElement 最终都会调用 createElement 方法
    // 将 vm.$attrs、vm.$listeners 转换为响应式
    initRender(vm)

    // 调用 beforeCreate 生命周期钩子
    // beforeCreate 之前三个处理都和数据无关
    // 在 beforeCreate 生命周期中只能访问上面三个操作相关的内容
    // 当前周期中是没有数据的，所以在此期间不要做数据操作
    callHook(vm, 'beforeCreate')
    
    // 初始化组件的 inject 注入配置项（处理注入祖辈传递下来的数据）
    // inject 是需要和 provide 配合使用的
    // 父组件通过 provide 提供数据，其他组价可以使用 inject 注入数据
    initInjections(vm) // resolve injections before data/props  在 data/props 之前解决注入

    // 初始化 state, props, methods, computed, watch
    // 其中初始化state, props, methods时，会遍历 data 中所有的 key，检测是否在 props，methods 重复定义
    // props变量有多种写法，vue会进行统一转化，转化成{ a: {type: "xx", default: 'xx'} } 形式
    // 将 data, props 都挂载到vm._data, vm._props上。设置访问数据代理，访问this.xx，实际上访问的是 vm._data[xx], vm._props[xx]
    // 给 _data, _props 添加响应式监听
    initState(vm)

    // 解析组件配置项上的 provide 对象，再挂载一份到 vm._provided 属性上（原本在 vm.$options.provide 上）
    initProvide(vm) // resolve provide after data/props

    // 调用 create 生命周期钩子
    // 在 beforeCreate 和 create 之间做了一系列的数据处理
    // 所以在 create 生命周期可以访问到数据
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
