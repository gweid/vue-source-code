/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

// Vue.js 在整个初始化过程中，除了给它的原型 prototype 上扩展方法
// 还会给 Vue 这个对象本身扩展全局的静态方法：
//   默认配置：Vue.config
//   一些工具方法：Vue.util.warn、Vue.util.extend、Vue.util.mergeOptions、Vue.util.defineReactive
//   Vue.set、Vue.delete、Vue.nextTick
//   响应式方法：Vue.observable
//   Vue.options.components、Vue.options.directives、Vue.options.filters、Vue.options._base
//   Vue.use、Vue.extend、Vue.mixin、Vue.component、Vue.directive、Vue.filter
export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }

  // Vue.config
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  // 一些工具方法
  // 轻易不要使用这些工具方法，除非你很清楚这些工具方法，以及知道使用的风险
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  Vue.set = set
  Vue.delete = del
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  // 响应式方法
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  // 主要将是 components、directives、filters 挂载到 Vue.options
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  // 将 Vue 构造函数挂载到 Vue.options._base 上
  Vue.options._base = Vue

  // 给 Vue.options.components 添加内置组件，例如 keep-alive
  extend(Vue.options.components, builtInComponents)

  initUse(Vue)              // Vue.use
  initMixin(Vue)            // Vue.mixin
  initExtend(Vue)           // Vue.extend 
  initAssetRegisters(Vue)   //  component、directive、filter 挂载到 Vue
}
