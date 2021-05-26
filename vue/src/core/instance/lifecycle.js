/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance
  activeInstance = vm
  return () => {
    activeInstance = prevActiveInstance
  }
}

export function initLifecycle (vm: Component) {
  // 这个 vm 是子组件实例
  const options = vm.$options

  // locate first non-abstract parent
  let parent = options.parent  // 此时的 parent 其实是 activeInstance，也是父组件 vm 实例
  if (parent && !options.abstract) {
    // 判断父组件是否是抽象组件
    // 如果是抽象组件，就选取抽象组件的上一级作为父级，忽略与抽象组件和子组件之间的层级关系
    // 主要是 keep-alive 包裹状态下
    // keep-alive 会被定义为抽象组件，不会作为节点渲染到页面上
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 将子组件实例放到父组件的 $children
    parent.$children.push(vm)
  }

  // 父组件挂载到子组件的 $parent 上
  vm.$parent = parent
  vm.$root = parent ? parent.$root : vm

  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) {
  // 负责更新页面，首次渲染和更新数据都会调用 _update 去做页面更新
  // 也是 patch 的入口位置
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    // 保存当前 vm 实例
    const vm: Component = this

    // 页面挂载的根节点
    const prevEl = vm.$el

    // 保存一份老的 VNode
    const prevVnode = vm._vnode
    const restoreActiveInstance = setActiveInstance(vm)

    // 将新的 VNode 挂载到 vm._vnode 上
    vm._vnode = vnode

    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) {
      // 老 VNode 不存在，表示首次渲染，即初始化页面时走这里
      // 使用 vm.__patch__ 进行 dom diff 并且生成真实 dom，最后挂载到 vm.$el 上
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // 老 VNode 不存在，代表是更新操作，即页面更新走这里
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  // 直接调用 watcher.update 方法，强制使组件重新渲染
  // 它仅仅影响实例本身和插入插槽内容的子组件，而不是所有子组件
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }

  // 完全销毁一个实例。清理它与其它实例的连接，解绑它的全部指令及事件监听器
  Vue.prototype.$destroy = function () {
    const vm: Component = this

    // 如果实例正在被销毁，直接返回
    if (vm._isBeingDestroyed) {
      return
    }

    // 调用 beforeDestroy 钩子
    callHook(vm, 'beforeDestroy')

    // 为 true，代表实例正在被销毁
    vm._isBeingDestroyed = true

    // remove self from parent
    // 把自身从父组件移除
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }

    // 移除依赖监听
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }

    // remove reference from data ob
    // frozen object may not have observer.
    // 移除对 data 的响应式处理
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }

    // 为 true 代表实例已经清除完毕
    vm._isDestroyed = true

    // invoke destroy hooks on current rendered tree
    // 调用 __patch__，销毁节点
    vm.__patch__(vm._vnode, null)

    // 调用 destroyed 钩子
    callHook(vm, 'destroyed')

    // 移除所有事件播报之类的监听
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}


// 调用 vm._render 方法先生成虚拟 Node，再实例化一个渲染 Watcher ，在它的回调函数中会调用 updateComponent 方法，最终调用 vm._update 更新 DOM。
// mountComponent 的核心方法就是 vm._render 和 vm._update
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {

  // 首先将 el 做缓存 
  vm.$el = el
  // 如果没有 render 函数
  if (!vm.$options.render) {
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }

  // 挂载 beforeMount 生命周期钩子
  callHook(vm, 'beforeMount')

  let updateComponent
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    // 定义 updateComponent 函数作为 Watcher 的回调函数
    updateComponent = () => {
      // vm._render 函数渲染成虚拟 DOM， vm._update 将虚拟 DOM 渲染成真实的 DOM
      vm._update(vm._render(), hydrating)
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  /**
   * vm 当前实例
   * updateComponent 函数
   * noop 这里指空函数    在 util/index 中定义
   * {} 配置
   * 魔法注释：isRenderWatcher 标记是否渲染 watcher
   */
  // new Watcher 会执行 Watcher 的构造函数 Constructor
  // Constructor 中会调用 Watcher.get 去执行 updateComponent
  // Watcher 在这个有2个作用： 
  //   1、初始化的时候会执行回调函数(首次渲染) 
  //   2、当 vm 实例中的监测的数据发生变化的时候执行回调函数(响应式)
  new Watcher(vm, updateComponent, noop, {
    before () {
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // vm.$vnode 表示 Vue 实例的父虚拟 node，为 null 则表示 当前是根 Vue 实例
  // 设置 vm._isMounted 为 true，表示该实例已经挂载
  // 最后调用 mounted 生命周期钩子函数
  if (vm.$vnode == null) {
    vm._isMounted = true
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  // 组件内有插槽，那么标记 needsForceUpdate 为 true，代表需要强制更新
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  // 存在插槽，强制更新
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
